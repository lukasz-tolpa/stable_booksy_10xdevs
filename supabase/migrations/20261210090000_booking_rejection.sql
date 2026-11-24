-- Odrzucenie zapisu (#125, spec #122, ADR 0006, GLOSSARY „Odrzucenie zapisu”). Osrodek odrzuca zapis
-- oczekujacy z powodem, ktory jezdziec widzi; przyjecie, ktore zapelnia slot, samo odrzuca pozostale zapisy
-- oczekujace na ten slot z powodem „Brak miejsc”.
--
--   1. Odrzucenie na wierszu zapisu: bookings.rejection_reason (1-300 znakow, przyciety), rejection_source
--      ('stable' - osrodek recznie, 'no_seats' - „Brak miejsc”, 'schedule_change' - „Ośrodek zmienił grafik”,
--      #127) i rejected_at. CHECK: zapis odrzucony ma wszystkie trzy, inny - zadnego. Kolumn nie zmienia rola
--      authenticated (bez grantu UPDATE).
--   2. Jedno miejsce, ktore odrzuca: private.reject_bookings(ids, source, reason) - zapisy oczekujace z listy
--      w odrzucone (powod automatyczny z zrodla, reczny - z argumentu), kon zwolniony; zwraca odrzucone id.
--      Kazda sciezka odrzucenia (reczna, „Brak miejsc”, zmiana grafiku #127) idzie przez nia - tu tez
--      podepnie sie powiadomienie jezdzca (#129).
--   3. private.reject_pending_of_full_slot(day, instructor, hour) - gdy slot ma komplet aktywnych zapisow,
--      odrzuca jego zapisy oczekujace z powodem „Brak miejsc”. Wolajacy trzyma blokade wiersza slotu.
--   4. Przyjecie (public.accept_booking): blokada slotu (FOR UPDATE) przed blokada zapisu - kolejnosc dzien,
--      slot, zapis, wiec rownolegle przyjecia czekaja na slot, a nie na zapis odrzucany przez zwyciezce (bez
--      zakleszczen); po przyjeciu - private.reject_pending_of_full_slot w tej samej transakcji.
--   5. Odrzucenie przez osrodek: public.reject_booking(booking, reason). Wolajacy: wlasciciel osrodka zapisu
--      (instruktor z kontem - #126).
--   6. Zapisy do przyjecia (public.get_pending_bookings) z rejected_before: osrodek odrzucil juz recznie temu
--      jezdzcowi zapis na ten slot.
--
-- Kody: SB070 brak powodu odrzucenia, SB071 powod dluzszy niz 300 znakow; z #124 (te same warunki co przy
-- przyjeciu): SB064 slot sie zaczal, SB065 zapis nie jest oczekujacy, SB066 brak uprawnien albo
-- cudzy/nieistniejacy zapis. SB072-SB074 wolne (zakres #125). Komunikaty: src/lib/bookings/rejection.ts.
-- Dowod: supabase/tests/booking_rejection.sql, concurrent_seat_booking.sh (przegrani wyscigu przyjec odrzuceni).

-- ---------------------------------------------------------------------------
-- 1. Odrzucenie na wierszu zapisu
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column rejection_reason text,
  add column rejection_source text,
  add column rejected_at timestamptz;

alter table public.bookings add constraint bookings_rejection_source_check
  check (rejection_source in ('stable', 'no_seats', 'schedule_change'));

alter table public.bookings add constraint bookings_rejection_reason_check
  check (char_length(rejection_reason) between 1 and 300 and rejection_reason !~ '^[[:space:]]|[[:space:]]$');

alter table public.bookings add constraint bookings_rejection_consistency_check
  check (
    (status = 'rejected') = (rejection_reason is not null)
    and (status = 'rejected') = (rejection_source is not null)
    and (status = 'rejected') = (rejected_at is not null)
  );

comment on column public.bookings.rejection_reason is
  'Powod odrzucenia zapisu, ktory jezdziec widzi (1-300 znakow, przyciety); tylko przy zapisie odrzuconym. Automatyczny: „Brak miejsc”, „Ośrodek zmienił grafik” (#125, #127).';
comment on column public.bookings.rejection_source is
  'Kto/co odrzucil zapis: stable - osrodek recznie (public.reject_booking), no_seats - przyjecie zapelnilo slot, schedule_change - zmiana grafiku (#127). Tylko przy zapisie odrzuconym.';
comment on column public.bookings.rejected_at is 'Chwila odrzucenia zapisu; tylko przy zapisie odrzuconym.';

-- ---------------------------------------------------------------------------
-- 2. Jedno miejsce, ktore odrzuca
-- ---------------------------------------------------------------------------

-- Przyciecie bialych znakow z obu stron (spacje, tabulatory, nowe linie) - jak `.trim()` formularza w TS.
create function private.trim_reason(p_reason text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(p_reason, '^[[:space:]]+|[[:space:]]+$', '', 'g');
$$;

revoke execute on function private.trim_reason(text) from public, anon, authenticated;

create function private.reject_bookings(p_booking_ids bigint[], p_source text, p_reason text default null)
returns setof bigint
language plpgsql
set search_path = ''
as $$
declare
  v_reason text := case p_source
    when 'stable' then private.trim_reason(p_reason)
    when 'no_seats' then 'Brak miejsc'
    when 'schedule_change' then 'Ośrodek zmienił grafik'
  end;
begin
  if v_reason is null or v_reason = '' then
    raise exception 'Odrzucenie wymaga zrodla i powodu (zrodlo %)', p_source using errcode = '22023';
  end if;

  -- Tylko zapisy, ktore nadal czekaja: rownolegle odwolanie albo przyjecie wygrywa bez bledu. Odrzucony zapis
  -- nie ma konia (CHECK bookings_horse_only_when_active_check) - kon pensjonatowy zapisu jest zwalniany.
  return query
  update public.bookings b
  set status = 'rejected',
      rejection_reason = v_reason,
      rejection_source = p_source,
      rejected_at = now(),
      horse_id = null
  where b.id = any (p_booking_ids)
    and b.status = 'pending'
  returning b.id;
end;
$$;

comment on function private.reject_bookings(bigint[], text, text) is
  'Jedyna sciezka odrzucenia zapisu (#125): zapisy oczekujace z listy staja sie odrzucone z powodem i zrodlem (stable - powod z argumentu; no_seats - „Brak miejsc”; schedule_change - „Ośrodek zmienił grafik”, #127), kon zwolniony. Zwraca id odrzuconych. Uprawnien nie sprawdza - wolaja ja funkcje bazy (reject_booking, accept_booking, save_schedule_day). Tu podpinaja sie powiadomienia o odrzuceniu (#129).';

revoke execute on function private.reject_bookings(bigint[], text, text) from public, anon, authenticated;

create function private.reject_pending_of_full_slot(p_schedule_day_id bigint, p_instructor_id bigint, p_hour smallint)
returns setof bigint
language sql
set search_path = ''
as $$
  -- Komplet = aktywnych zapisow co najmniej tyle, ile miejsc (slot bez miejsc albo bez wiersza tu nie trafia -
  -- to zmiana grafiku, #127).
  select private.reject_bookings(
    array(
      select b.id from public.bookings b
      where b.schedule_day_id = p_schedule_day_id and b.instructor_id = p_instructor_id and b.hour = p_hour
        and b.status = 'pending'
    ),
    'no_seats'
  )
  from public.schedule_slots s
  where s.schedule_day_id = p_schedule_day_id and s.instructor_id = p_instructor_id and s.hour = p_hour
    and s.seats > 0
    and (select count(*) from public.bookings a
         where a.schedule_day_id = p_schedule_day_id and a.instructor_id = p_instructor_id and a.hour = p_hour
           and a.status = 'active') >= s.seats;
$$;

comment on function private.reject_pending_of_full_slot(bigint, bigint, smallint) is
  'Gdy slot ma komplet aktywnych zapisow, odrzuca jego zapisy oczekujace z powodem „Brak miejsc” (private.reject_bookings, zrodlo no_seats, #125). Wolajacy trzyma blokade wiersza slotu (FOR UPDATE), zeby liczenie nie minelo sie z rownoleglym przyjeciem.';

revoke execute on function private.reject_pending_of_full_slot(bigint, bigint, smallint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Przyjecie zapelniajace slot odrzuca pozostale zapisy oczekujace
-- ---------------------------------------------------------------------------

create or replace function public.accept_booking(p_booking_id bigint)
returns void
language plpgsql
-- SECURITY DEFINER celowo: zmiana stanu zapisu jest odebrana roli authenticated (bookings_state_machine);
-- osrodek bierzemy z sesji, nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.owned_stable_id();
  v_day_id bigint;
  v_instructor bigint;
  v_hour smallint;
  v_day date;
  v_status text;
begin
  -- Dzien, instruktor i godzina zapisu sa niezmienne (bez grantu UPDATE) - mozna je czytac bez blokady.
  select b.schedule_day_id, b.instructor_id, b.hour into v_day_id, v_instructor, v_hour
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  where b.id = p_booking_id
    and v_stable is not null
    and sd.stable_id = v_stable;

  if not found then
    raise exception 'Zapis % nie nalezy do osrodka wolajacego', p_booking_id using errcode = 'SB066';
  end if;

  -- Kolejnosc blokad jak w bookings_seat_limit i save_schedule_day: dzien, slot, dopiero zapis. Rownolegle
  -- przyjecia na ten slot czekaja na slot - nie na zapis, ktory zwyciezca odrzuca („Brak miejsc”) - wiec
  -- przegrany widzi juz zapis odrzucony (SB065), bez zakleszczenia.
  select sd.day into v_day from public.schedule_days sd where sd.id = v_day_id for share;

  perform 1 from public.schedule_slots s
  where s.schedule_day_id = v_day_id and s.instructor_id = v_instructor and s.hour = v_hour
  for update;

  select b.status into v_status
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if v_status <> 'pending' then
    raise exception 'Zapis % nie jest oczekujacy (%)', p_booking_id, v_status using errcode = 'SB065';
  end if;

  if private.booking_slot_started(v_day, v_hour) then
    raise exception 'Slot zapisu % juz sie zaczal', p_booking_id using errcode = 'SB064';
  end if;

  -- Limit miejsc (SB009) i istnienie slotu (23503) - bookings_seat_limit; znacznik przyjecia -
  -- bookings_acceptance.
  update public.bookings set status = 'active' where id = p_booking_id;

  perform private.reject_pending_of_full_slot(v_day_id, v_instructor, v_hour);
end;
$$;

comment on function public.accept_booking(bigint) is
  'Przyjecie zapisu (#124, #125, GLOSSARY „Przyjęcie zapisu”): zapis oczekujacy osrodka wolajacego staje sie aktywny i zajmuje miejsce; gdy slot ma przez to komplet, pozostale zapisy oczekujace na ten slot sa odrzucane z powodem „Brak miejsc” w tej samej transakcji. Odmowy: SB066 wolajacy nie jest wlascicielem osrodka zapisu (albo brak zapisu), SB065 zapis nie jest oczekujacy (takze odrzucony przez rownolegle przyjecie), SB064 slot sie zaczal, SB009 brak miejsc, 23503 slotu nie ma w grafiku.';

-- ---------------------------------------------------------------------------
-- 5. Odrzucenie przez osrodek
-- ---------------------------------------------------------------------------

create function public.reject_booking(p_booking_id bigint, p_reason text)
returns void
language plpgsql
-- SECURITY DEFINER celowo: zmiana stanu zapisu i kolumny odrzucenia sa odebrane roli authenticated;
-- osrodek bierzemy z sesji, nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.owned_stable_id();
  v_reason text := coalesce(private.trim_reason(p_reason), '');
  v_day_id bigint;
  v_day date;
  v_hour smallint;
  v_status text;
begin
  select b.schedule_day_id into v_day_id
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  where b.id = p_booking_id
    and v_stable is not null
    and sd.stable_id = v_stable;

  if not found then
    raise exception 'Zapis % nie nalezy do osrodka wolajacego', p_booking_id using errcode = 'SB066';
  end if;

  if v_reason = '' then
    raise exception 'Odrzucenie zapisu wymaga powodu' using errcode = 'SB070';
  end if;
  if char_length(v_reason) > 300 then
    raise exception 'Powod odrzucenia ma % znakow (najwyzej 300)', char_length(v_reason) using errcode = 'SB071';
  end if;

  -- Blokada dnia jak przy przyjeciu (czekamy na trwajacy zapis grafiku), potem zapis. Slotu nie blokujemy -
  -- odrzucenie miejsca nie zwalnia ani nie zajmuje.
  select sd.day into v_day from public.schedule_days sd where sd.id = v_day_id for share;

  select b.status, b.hour into v_status, v_hour
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if v_status <> 'pending' then
    raise exception 'Zapis % nie jest oczekujacy (%)', p_booking_id, v_status using errcode = 'SB065';
  end if;

  if private.booking_slot_started(v_day, v_hour) then
    raise exception 'Slot zapisu % juz sie zaczal', p_booking_id using errcode = 'SB064';
  end if;

  perform private.reject_bookings(array[p_booking_id], 'stable', v_reason);
end;
$$;

comment on function public.reject_booking(bigint, text) is
  'Odrzucenie zapisu przez osrodek (#125, GLOSSARY „Odrzucenie zapisu”): zapis oczekujacy osrodka wolajacego staje sie odrzucony z powodem (przycietym), ktory jezdziec widzi; zrodlo stable (private.reject_bookings). Odmowy: SB066 wolajacy nie jest wlascicielem osrodka zapisu (albo brak zapisu), SB070 brak powodu, SB071 powod dluzszy niz 300 znakow, SB065 zapis nie jest oczekujacy, SB064 slot sie zaczal.';

revoke execute on function public.reject_booking(bigint, text) from public, anon;
grant execute on function public.reject_booking(bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Zapisy do przyjecia ze znacznikiem wczesniejszego odrzucenia
-- ---------------------------------------------------------------------------

drop function public.get_pending_bookings();

create function public.get_pending_bookings()
returns table (
  booking_id bigint,
  day date,
  hour smallint,
  instructor_id bigint,
  instructor_name text,
  place_name text,
  kind text,
  seats int,
  taken int,
  rider_id uuid,
  rider_name text,
  rider_email text,
  created_at timestamptz,
  rejected_before boolean
)
language sql
stable
-- SECURITY DEFINER celowo: imie i adres jezdzca z samym zapisem oczekujacym (nie jest „jezdzcem osrodka”,
-- RLS profili go nie odda) i liczba zajetych miejsc slotu. Tylko osrodek wlasciciela; inne konto - zero wierszy.
security definer
set search_path = ''
as $$
  select b.id, sd.day, b.hour, b.instructor_id, i.name, pl.name, coalesce(s.kind, 'recreation'),
         coalesce(s.seats, 0)::int,
         (select count(*)::int
          from public.bookings a
          where a.schedule_day_id = b.schedule_day_id
            and a.instructor_id = b.instructor_id
            and a.hour = b.hour
            and a.status = 'active'),
         b.rider_id, p.full_name, u.email::text, b.created_at,
         -- Osrodek odrzucil juz recznie temu jezdzcowi zapis na ten slot („Brak miejsc” to nie jego decyzja).
         exists (
           select 1 from public.bookings r
           where r.schedule_day_id = b.schedule_day_id
             and r.instructor_id = b.instructor_id
             and r.hour = b.hour
             and r.rider_id = b.rider_id
             and r.status = 'rejected'
             and r.rejection_source = 'stable'
         )
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  join public.instructors i on i.id = b.instructor_id
  left join public.schedule_slots s
    on s.schedule_day_id = b.schedule_day_id and s.instructor_id = b.instructor_id and s.hour = b.hour
  left join public.places pl on pl.id = s.place_id
  left join public.profiles p on p.id = b.rider_id
  left join auth.users u on u.id = b.rider_id
  where sd.stable_id = private.owned_stable_id()
    and b.status = 'pending'
    and sd.day >= private.warsaw_today()
  order by sd.day, b.hour, b.created_at, b.id;
$$;

comment on function public.get_pending_bookings() is
  'Zapisy do przyjecia (#124, #125): zapisy oczekujace osrodka wlasciciela od dzis (Europe/Warsaw), najblizsze terminy pierwsze, z jezdzcem (imie i nazwisko, adres e-mail), slotem (instruktor, plac, rodzaj, limit), liczba aktywnych zapisow slotu i znacznikiem rejected_before (osrodek odrzucil juz recznie temu jezdzcowi zapis na ten slot). Zapis, ktorego slot sie zaczal (wygasly), odfiltrowuje odczyt w TS. Inne konta: zero wierszy.';

revoke execute on function public.get_pending_bookings() from public, anon;
grant execute on function public.get_pending_bookings() to authenticated;
