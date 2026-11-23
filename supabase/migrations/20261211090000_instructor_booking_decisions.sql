-- Instruktor z kontem przyjmuje i odrzuca zapisy na swoje sloty (#126, spec #122, ADR 0006, GLOSSARY „Przyjęcie
-- zapisu”, „Odrzucenie zapisu”). Do tej pory decydowal tylko wlasciciel osrodka (#124, #125).
--
--   1. private.decides_on_slot(stable, instructor) - jedna regula „kto decyduje o zapisie”: wlasciciel osrodka
--      (kazdy slot) albo aktywny instruktor z kontem (swoj slot). Instruktor zdezaktywowany traci prawo, bo
--      private.current_instructor_id() zwraca wtedy NULL.
--   2. public.accept_booking i public.reject_booking: cialo bez zmian (#125) - zmienia sie tylko sprawdzenie
--      wolajacego. Odmowa bez zmian: SB066 (cudzy slot, cudzy osrodek albo brak zapisu - bez wyroczni istnienia).
--   3. public.get_pending_bookings (Zapisy do przyjecia): wlasciciel - zapisy oczekujace calego osrodka,
--      instruktor - na swoich slotach. Odczyt przez funkcje: polityka RLS instruktora na bookings dalej pokazuje
--      mu tylko zapisy aktywne na jego slotach.
--
-- Kody: bez nowych (SB075-SB077 wolne, zakres #126). Dowod: supabase/tests/instructor_booking_decisions.sql.

-- ---------------------------------------------------------------------------
-- 1. Kto decyduje o zapisie
-- ---------------------------------------------------------------------------

create function private.decides_on_slot(p_stable_id bigint, p_instructor_id bigint)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p_stable_id = private.owned_stable_id(), false)
      or coalesce(p_instructor_id = private.current_instructor_id(), false);
$$;

comment on function private.decides_on_slot(bigint, bigint) is
  'Czy zalogowane konto decyduje o zapisach na slot instruktora p_instructor_id w osrodku p_stable_id (#126): wlasciciel osrodka - kazdy slot, aktywny instruktor z kontem - swoj slot. Przyjecie, odrzucenie i Zapisy do przyjecia.';

revoke execute on function private.decides_on_slot(bigint, bigint) from public, anon;
grant execute on function private.decides_on_slot(bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Przyjecie i odrzucenie - takze instruktor na swoim slocie
-- ---------------------------------------------------------------------------

create or replace function public.accept_booking(p_booking_id bigint)
returns void
language plpgsql
-- SECURITY DEFINER celowo: zmiana stanu zapisu jest odebrana roli authenticated (bookings_state_machine);
-- wolajacego bierzemy z sesji, nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
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
    and private.decides_on_slot(sd.stable_id, b.instructor_id);

  if not found then
    raise exception 'Zapis % nie nalezy do osrodka ani slotow wolajacego', p_booking_id using errcode = 'SB066';
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
  'Przyjecie zapisu (#124, #125, #126, GLOSSARY „Przyjęcie zapisu”): zapis oczekujacy staje sie aktywny i zajmuje miejsce; gdy slot ma przez to komplet, pozostale zapisy oczekujace na ten slot sa odrzucane z powodem „Brak miejsc” w tej samej transakcji. Wolajacy: wlasciciel osrodka zapisu albo instruktor z kontem, do ktorego slotu nalezy zapis (private.decides_on_slot). Odmowy: SB066 wolajacy nie decyduje o tym zapisie (albo brak zapisu), SB065 zapis nie jest oczekujacy (takze odrzucony przez rownolegle przyjecie), SB064 slot sie zaczal, SB009 brak miejsc, 23503 slotu nie ma w grafiku.';

create or replace function public.reject_booking(p_booking_id bigint, p_reason text)
returns void
language plpgsql
-- SECURITY DEFINER celowo: zmiana stanu zapisu i kolumny odrzucenia sa odebrane roli authenticated;
-- wolajacego bierzemy z sesji, nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
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
    and private.decides_on_slot(sd.stable_id, b.instructor_id);

  if not found then
    raise exception 'Zapis % nie nalezy do osrodka ani slotow wolajacego', p_booking_id using errcode = 'SB066';
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
  'Odrzucenie zapisu (#125, #126, GLOSSARY „Odrzucenie zapisu”): zapis oczekujacy staje sie odrzucony z powodem (przycietym), ktory jezdziec widzi; zrodlo stable (private.reject_bookings). Wolajacy: wlasciciel osrodka zapisu albo instruktor z kontem, do ktorego slotu nalezy zapis (private.decides_on_slot). Odmowy: SB066 wolajacy nie decyduje o tym zapisie (albo brak zapisu), SB070 brak powodu, SB071 powod dluzszy niz 300 znakow, SB065 zapis nie jest oczekujacy, SB064 slot sie zaczal.';

-- ---------------------------------------------------------------------------
-- 3. Zapisy do przyjecia instruktora - jego sloty
-- ---------------------------------------------------------------------------

create or replace function public.get_pending_bookings()
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
-- RLS profili go nie odda) i liczba zajetych miejsc slotu. Wlasciciel - caly osrodek, instruktor - swoje sloty;
-- inne konto - zero wierszy.
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
  where private.decides_on_slot(sd.stable_id, b.instructor_id)
    and b.status = 'pending'
    and sd.day >= private.warsaw_today()
  order by sd.day, b.hour, b.created_at, b.id;
$$;


comment on function public.get_pending_bookings() is
  'Zapisy do przyjecia (#124, #125, #126): zapisy oczekujace od dzis (Europe/Warsaw) - wlasciciel: calego osrodka, instruktor z kontem: na jego slotach (private.decides_on_slot) - najblizsze terminy pierwsze, z jezdzcem (imie i nazwisko, adres e-mail), slotem (instruktor, plac, rodzaj, limit), liczba aktywnych zapisow slotu i znacznikiem rejected_before (osrodek odrzucil juz recznie temu jezdzcowi zapis na ten slot). Zapis, ktorego slot sie zaczal (wygasly), odfiltrowuje odczyt w TS. Inne konta: zero wierszy.';
