-- Powiadomienia o zapisie (#129, spec #122, ADR 0006, GLOSSARY „Powiadomienie”). Tylko w aplikacji: dzwonek
-- z liczba nieprzeczytanych w gornym pasku i strona „Powiadomienia”.
--
--   1. public.notifications - powiadomienie zapisane: odbiorca (konto), rodzaj, zapis, ewentualny powod, czas.
--      Kazdy czyta tylko swoje (RLS); nikt nie pisze wprost - wiersze wstawia wyzwalacz.
--   2. Wyzwalacz bookings_notifications (AFTER INSERT OR UPDATE OF status) - jedno miejsce, ktore tworzy
--      powiadomienia, w tej samej transakcji co zmiana stanu zapisu, niezaleznie od sciezki (zapis z aplikacji,
--      accept_booking, reject_booking, private.reject_bookings z kazdego zrodla - takze zmiana grafiku, #127):
--        * zapis oczekujacy powstaje                -> osrodek: booking_pending
--        * oczekujacy -> aktywny (przyjecie)         -> jezdziec: booking_accepted
--        * oczekujacy -> odrzucony                   -> jezdziec: booking_rejected z powodem z wiersza zapisu
--        * aktywny -> odwolany przez jezdzca         -> osrodek: booking_cancelled_by_rider
--        * aktywny -> odwolany przez osrodek         -> jezdziec: booking_cancelled_by_stable
--        * oczekujacy -> odwolany (wycofanie)        -> nikt
--      Zapis wstawiony od razu jako aktywny (seed, dane demo) nie powiadamia. „Osrodek” to wlasciciel osrodka
--      i konto aktywnego instruktora slotu, jesli ma konto (private.booking_stable_recipients; wlasciciel
--      prowadzacy slot - jedno powiadomienie). Jezdziec anonimizowany (rider_id NULL) - bez powiadomienia.
--   3. Wygasniecie (zapis oczekujacy, ktorego slot sie zaczal) nie jest zapisywane: odczyt listy jezdzca
--      wyprowadza je w TS (src/lib/notifications/), czas = start slotu.
--   4. public.get_my_notifications() - powiadomienia wolajacego, najnowsze pierwsze, ze slotem (dzien, godzina,
--      instruktor, osrodek) i jezdzcem (imie i nazwisko - takze jezdzca z samym zapisem oczekujacym, ktorego
--      RLS profili osrodkowi nie oddaje).
--   5. Nieprzeczytane = nowsze od daty ostatniego otwarcia strony „Powiadomienia”: public.notification_views
--      (jedna data na konto, czyta tylko wlasciciel), ustawia ja public.mark_notifications_seen().
--
-- Usuniecie konta odbiorcy albo zapisu (ADR 0001) usuwa jego powiadomienia (FK cascade). Kody odmowy: brak
-- (zakres SB082-SB085 niewykorzystany). Dowod: supabase/tests/booking_notifications.sql.

-- ---------------------------------------------------------------------------
-- 1. Powiadomienia
-- ---------------------------------------------------------------------------

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  booking_id bigint not null references public.bookings (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  constraint notifications_kind_check check (kind in (
    'booking_pending', 'booking_cancelled_by_rider',
    'booking_accepted', 'booking_rejected', 'booking_cancelled_by_stable'
  )),
  constraint notifications_reason_check check ((kind = 'booking_rejected') = (reason is not null))
);

comment on table public.notifications is
  'Powiadomienia o zapisie w aplikacji (#129, GLOSSARY „Powiadomienie”). Wstawia je wyzwalacz bookings_notifications przy zmianie stanu zapisu; kazdy czyta tylko swoje. Wygasniecia nie sa zapisywane - wyprowadza je odczyt.';
comment on column public.notifications.kind is
  'booking_pending i booking_cancelled_by_rider - dla osrodka; booking_accepted, booking_rejected, booking_cancelled_by_stable - dla jezdzca.';
comment on column public.notifications.reason is 'Powod odrzucenia (kopia bookings.rejection_reason); tylko przy booking_rejected.';

create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_booking_idx on public.notifications (booking_id);

alter table public.notifications enable row level security;

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Wyzwalacz: powiadomienia przy kazdej zmianie stanu zapisu
-- ---------------------------------------------------------------------------

create function private.booking_stable_recipients(p_schedule_day_id bigint, p_instructor_id bigint)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  -- union usuwa powtorke: wlasciciel, ktory sam prowadzi slot, dostaje jedno powiadomienie.
  select s.owner_id
  from public.schedule_days sd
  join public.stables s on s.id = sd.stable_id
  where sd.id = p_schedule_day_id
  union
  select i.account_id
  from public.instructors i
  where i.id = p_instructor_id and i.active and i.account_id is not null;
$$;

comment on function private.booking_stable_recipients(bigint, bigint) is
  'Odbiorcy powiadomien osrodka o zapisie (#129): wlasciciel osrodka dnia grafiku i konto aktywnego instruktora slotu, jesli je ma.';

revoke execute on function private.booking_stable_recipients(bigint, bigint) from public, anon, authenticated;

create function public.notify_booking_change()
returns trigger
language plpgsql
-- SECURITY DEFINER celowo: powiadomienia pisze tylko ten wyzwalacz (rola authenticated nie ma INSERT), takze
-- dla zmian robionych przez jezdzca pod RLS; odbiorcow (wlasciciel, konto instruktora) czyta bez RLS.
security definer
set search_path = ''
as $$
declare
  v_kind text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      insert into public.notifications (recipient_id, kind, booking_id)
      select r, 'booking_pending', new.id
      from private.booking_stable_recipients(new.schedule_day_id, new.instructor_id) r;
    end if;
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if old.status = 'active' and new.status = 'cancelled' and new.cancelled_by = 'rider' then
    insert into public.notifications (recipient_id, kind, booking_id)
    select r, 'booking_cancelled_by_rider', new.id
    from private.booking_stable_recipients(new.schedule_day_id, new.instructor_id) r;
    return null;
  end if;

  v_kind := case
    when old.status = 'pending' and new.status = 'active' then 'booking_accepted'
    when old.status = 'pending' and new.status = 'rejected' then 'booking_rejected'
    when old.status = 'active' and new.status = 'cancelled' and new.cancelled_by = 'stable'
      then 'booking_cancelled_by_stable'
  end;

  if v_kind is not null and new.rider_id is not null then
    insert into public.notifications (recipient_id, kind, booking_id, reason)
    values (new.rider_id, v_kind, new.id, case when v_kind = 'booking_rejected' then new.rejection_reason end);
  end if;

  return null;
end;
$$;

comment on function public.notify_booking_change() is
  'Wyzwalacz bookings_notifications (#129): jedyne miejsce, ktore tworzy powiadomienia - przy powstaniu zapisu oczekujacego i kazdej zmianie stanu zapisu, w tej samej transakcji (opis rodzajow w migracji 20261214090000).';

revoke execute on function public.notify_booking_change() from public, anon, authenticated;

create trigger bookings_notifications
after insert or update of status on public.bookings
for each row execute function public.notify_booking_change();

-- ---------------------------------------------------------------------------
-- 3. Lista powiadomien wolajacego
-- ---------------------------------------------------------------------------

create function public.get_my_notifications()
returns table (
  id bigint,
  kind text,
  booking_id bigint,
  reason text,
  created_at timestamptz,
  day date,
  hour smallint,
  instructor_name text,
  stable_name text,
  rider_name text
)
language sql
stable
-- SECURITY DEFINER celowo: jezdziec z samym zapisem oczekujacym nie jest „jezdzcem osrodka”, wiec RLS profili
-- nie odda osrodkowi jego imienia, a instruktor nie czyta zapisow oczekujacych. Tylko powiadomienia wolajacego.
security definer
set search_path = ''
as $$
  select n.id, n.kind, n.booking_id, n.reason, n.created_at, sd.day, b.hour, i.name, s.name, p.full_name
  from public.notifications n
  join public.bookings b on b.id = n.booking_id
  join public.schedule_days sd on sd.id = b.schedule_day_id
  join public.stables s on s.id = sd.stable_id
  join public.instructors i on i.id = b.instructor_id
  left join public.profiles p on p.id = b.rider_id
  where n.recipient_id = (select auth.uid())
  order by n.created_at desc, n.id desc;
$$;

comment on function public.get_my_notifications() is
  'Powiadomienia wolajacego (#129), najnowsze pierwsze, ze slotem zapisu (dzien, godzina, instruktor, osrodek) i jezdzcem (rider_name NULL - jezdziec anonimizowany). Wygasniecia doklada odczyt w TS.';

revoke execute on function public.get_my_notifications() from public, anon;
grant execute on function public.get_my_notifications() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Data ostatniego otwarcia strony „Powiadomienia”
-- ---------------------------------------------------------------------------

create table public.notification_views (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  seen_at timestamptz not null
);

comment on table public.notification_views is
  'Ostatnie otwarcie strony „Powiadomienia” przez konto (#129) - nieprzeczytane to powiadomienia nowsze od tej chwili. Jedna data na konto; ustawia ja public.mark_notifications_seen().';

alter table public.notification_views enable row level security;

revoke all on public.notification_views from anon, authenticated;
grant select on public.notification_views to authenticated;

create policy notification_views_select_own on public.notification_views
  for select to authenticated
  using (profile_id = (select auth.uid()));

create function public.mark_notifications_seen()
returns timestamptz
language sql
volatile
-- SECURITY DEFINER celowo: rola authenticated nie pisze notification_views wprost - date ustawia tylko otwarcie
-- strony, zawsze na teraz i zawsze wolajacemu.
security definer
set search_path = ''
as $$
  insert into public.notification_views (profile_id, seen_at)
  values ((select auth.uid()), now())
  on conflict (profile_id) do update set seen_at = excluded.seen_at
  returning seen_at;
$$;

comment on function public.mark_notifications_seen() is
  'Otwarcie strony „Powiadomienia” (#129): data ostatniego otwarcia wolajacego = teraz. Zwraca ja.';

revoke execute on function public.mark_notifications_seen() from public, anon;
grant execute on function public.mark_notifications_seen() to authenticated;
