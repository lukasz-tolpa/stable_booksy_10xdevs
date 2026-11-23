-- Odczyt zwrotny decyzji o zapisie (przeglad spec #122, CODING_STANDARDS „A response claims success only after the
-- dependency confirmed it”). public.accept_booking i public.reject_booking zwracaja stan zapisu po zmianie
-- (text: 'active' / 'rejected'), a nie void - endpointy /api/bookings/accept i /reject sprawdzaja go przed
-- przekierowaniem z sukces=. Ciala bez zmian wzgledem 20261211090000 (#126) poza koncowym odczytem.
--
-- Zmiana typu wyniku wymaga DROP + CREATE (create or replace nie zmienia typu zwracanego) - dlatego granty
-- i komentarze sa powtorzone. Kody: bez nowych. Dowod: supabase/tests/booking_acceptance.sql,
-- supabase/tests/booking_rejection.sql.

drop function public.accept_booking(bigint);

create function public.accept_booking(p_booking_id bigint)
returns text
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

  -- Odczyt zwrotny: stan zapisu po zmianie - endpoint oglasza sukces dopiero, gdy to 'active'.
  select b.status into v_status from public.bookings b where b.id = p_booking_id;
  return v_status;
end;
$$;


comment on function public.accept_booking(bigint) is
  'Przyjecie zapisu (#124, #125, #126, GLOSSARY „Przyjęcie zapisu”): zapis oczekujacy staje sie aktywny i zajmuje miejsce; gdy slot ma przez to komplet, pozostale zapisy oczekujace na ten slot sa odrzucane z powodem „Brak miejsc” w tej samej transakcji. Wolajacy: wlasciciel osrodka zapisu albo instruktor z kontem, do ktorego slotu nalezy zapis (private.decides_on_slot). Odmowy: SB066 wolajacy nie decyduje o tym zapisie (albo brak zapisu), SB065 zapis nie jest oczekujacy (takze odrzucony przez rownolegle przyjecie), SB064 slot sie zaczal, SB009 brak miejsc, 23503 slotu nie ma w grafiku. Zwraca stan zapisu po zmianie (active) - odczyt zwrotny dla wolajacego.';

revoke execute on function public.accept_booking(bigint) from public, anon;
grant execute on function public.accept_booking(bigint) to authenticated;

drop function public.reject_booking(bigint, text);

create function public.reject_booking(p_booking_id bigint, p_reason text)
returns text
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

  -- Odczyt zwrotny: stan zapisu po zmianie - endpoint oglasza sukces dopiero, gdy to 'rejected'.
  select b.status into v_status from public.bookings b where b.id = p_booking_id;
  return v_status;
end;
$$;


comment on function public.reject_booking(bigint, text) is
  'Odrzucenie zapisu (#125, #126, GLOSSARY „Odrzucenie zapisu”): zapis oczekujacy staje sie odrzucony z powodem (przycietym), ktory jezdziec widzi; zrodlo stable (private.reject_bookings). Wolajacy: wlasciciel osrodka zapisu albo instruktor z kontem, do ktorego slotu nalezy zapis (private.decides_on_slot). Odmowy: SB066 wolajacy nie decyduje o tym zapisie (albo brak zapisu), SB070 brak powodu, SB071 powod dluzszy niz 300 znakow, SB065 zapis nie jest oczekujacy, SB064 slot sie zaczal. Zwraca stan zapisu po zmianie (rejected) - odczyt zwrotny dla wolajacego.';

revoke execute on function public.reject_booking(bigint, text) from public, anon;
grant execute on function public.reject_booking(bigint, text) to authenticated;
