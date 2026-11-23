-- Prefactor zapisow oczekujacych (#123, spec #122, ADR 0006, GLOSSARY „Zapis”). Bez widocznej zmiany:
-- zadna sciezka aplikacji nie tworzy jeszcze zapisu oczekujacego (wartosc domyslna kolumny i polityka
-- INSERT jezdzca zostaja przy 'active' - zmienia je #124).
--
--   1. Stany zapisu: oczekujacy ('pending'), aktywny ('active'), odrzucony ('rejected'), odwolany
--      ('cancelled'). „Wygasly” nie jest stanem kolumny - wyprowadza go odczyt (zapis oczekujacy,
--      ktorego slot sie zaczal).
--   2. Znacznik przyjecia `bookings.accepted_at`: kiedy zapis stal sie aktywny. Odroznia odwolanie
--      zapisu przyjetego (liczy sie w statystykach odwolan) od wycofania zapisu oczekujacego. Stempluje
--      go wyzwalacz bookings_acceptance (wstawienie aktywnego, przejscie w aktywny); dzisiejsze zapisy
--      aktywne i odwolane dostaja go wstecznie (= created_at - przyjete w chwili zapisu). CHECK
--      bookings_accepted_at_consistency_check: aktywny ma znacznik, oczekujacy i odrzucony nie maja.
--      Kolumny nie zmienia `authenticated` (granty UPDATE obejmuja tylko status/odwolanie/konia).
--   3. „Jezdziec osrodka” (private.is_rider_of_my_stable) to jezdziec z zapisem, ktory byl aktywny
--      (accepted_at is not null), albo pensjonariusz jak dotad. Jezdziec z samymi zapisami
--      oczekujacymi, odrzuconymi albo wycofanymi oczekujacymi nie trafia do profili osrodka, stawek,
--      kosztow dodatkowych ani „Pozostalych jezdzcow osrodka”.
--
-- Odczyty liczace miejsca i jazdy w SQL juz filtruja status = 'active' (get_slot_occupancy,
-- get_place_occupancy, get_my_slot_bookings, get_my_month_bookings, save_schedule_day, bookings_seat_limit).
-- Kody: brak nowych.
-- Dowod: supabase/tests/booking_states.sql.

-- ---------------------------------------------------------------------------
-- 1. Stany zapisu
-- ---------------------------------------------------------------------------

alter table public.bookings drop constraint bookings_status_check;
alter table public.bookings add constraint bookings_status_check
  check (status in ('pending', 'active', 'rejected', 'cancelled'));

comment on column public.bookings.status is
  'Stan zapisu (GLOSSARY „Zapis”, ADR 0006): pending - oczekujacy (nie zajmuje miejsca), active - aktywny (zajmuje miejsce), rejected - odrzucony, cancelled - odwolany. Wygasly jest wyprowadzany przy odczycie.';

-- ---------------------------------------------------------------------------
-- 2. Znacznik przyjecia
-- ---------------------------------------------------------------------------

alter table public.bookings add column accepted_at timestamptz;

-- Dzisiejsze zapisy byly aktywne od chwili zapisu - takze te pozniej odwolane.
update public.bookings set accepted_at = created_at where status in ('active', 'cancelled');

alter table public.bookings add constraint bookings_accepted_at_consistency_check
  check (
    case status
      when 'active' then accepted_at is not null
      when 'cancelled' then true
      else accepted_at is null
    end
  );

comment on column public.bookings.accepted_at is
  'Kiedy zapis stal sie aktywny (przyjecie); NULL - nigdy nie byl aktywny. Odwolanie z NULL to wycofanie zapisu oczekujacego - nie liczy sie w statystykach odwolan. Stempluje wyzwalacz bookings_acceptance.';

create function public.stamp_booking_acceptance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' then
    if tg_op = 'INSERT' then
      new.accepted_at := coalesce(new.accepted_at, now());
    elsif old.status <> 'active' then
      new.accepted_at := now();
    end if;
  end if;
  return new;
end;
$$;

comment on function public.stamp_booking_acceptance() is
  'Znacznik przyjecia: zapis wstawiany jako aktywny albo przechodzacy w aktywny dostaje accepted_at. Pozostale przejscia go nie ruszaja (odwolanie zapisu przyjetego go zachowuje).';

revoke execute on function public.stamp_booking_acceptance() from public, anon, authenticated;

create trigger bookings_acceptance
before insert or update of status on public.bookings
for each row execute function public.stamp_booking_acceptance();

-- ---------------------------------------------------------------------------
-- 3. „Jezdziec mojego osrodka” - zapis, ktory byl aktywny
-- ---------------------------------------------------------------------------

create or replace function private.is_rider_of_my_stable(p_rider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    join public.schedule_days sd on sd.id = b.schedule_day_id
    where b.rider_id = p_rider_id
      and b.accepted_at is not null
      and sd.stable_id = (select private.owned_stable_id())
  ) or exists (
    select 1
    from public.horse_owners o
    join public.horse_stays s on s.horse_id = o.horse_id
    where o.rider_id = p_rider_id
      and o.stable_id = (select private.owned_stable_id())
      and s.arrival_day <= private.warsaw_today()
  );
$$;

comment on function private.is_rider_of_my_stable(uuid) is
  'Jezdziec osrodka wlasciciela: ma w nim zapis, ktory byl aktywny (accepted_at, takze pozniej odwolany; #123), albo jest pensjonariuszem z pobytem konia od dnia przyjazdu (#114). Zapis oczekujacy, odrzucony ani wycofany oczekujacy nie wystarcza. Polityki profili, stawek i kosztow dodatkowych. SECURITY DEFINER omija zagniezdzone RLS na bookings i pobytach.';
