-- Dowod odrzucenia zapisu (#125, spec #122, ADR 0006, GLOSSARY „Odrzucenie zapisu”).
--
-- Gwarancje:
--   * odrzucenie (public.reject_booking) zmienia zapis oczekujacy w odrzucony z powodem (przycietym), ktory
--     jezdziec widzi, i zrodlem 'stable'; zwalnia konia pensjonatowego zapisu na slot treningowy
--   * odmawia: bez powodu albo z samymi spacjami (SB070), z powodem dluzszym niz 300 znakow (SB071), dla zapisu
--     nieoczekujacego (SB065), po starcie slotu (SB064), dla wolajacego bez uprawnien i cudzego/nieistniejacego
--     zapisu (SB066)
--   * ani jezdziec, ani wlasciciel nie odrzuca zapisu z pominieciem funkcji (42501); zapis odrzucony bez powodu
--     i zrodla nie istnieje (23514)
--   * jezdziec zapisuje sie ponownie na ten sam slot; wlasciciel widzi przy nowym zapisie oczekujacym, ze
--     wczesniej odrzucil temu jezdzcowi zapis na ten slot (get_pending_bookings.rejected_before)
--   * przyjecie, ktore zapelnia slot, w tej samej transakcji odrzuca pozostale zapisy oczekujace na ten slot
--     z powodem „Brak miejsc” i zrodlem 'no_seats'; przyjecie, ktore slotu nie zapelnia, i zapisy na inne
--     sloty zostaja oczekujace
-- Wyscig przyjec z automatycznym odrzuceniem przegranych: supabase/tests/concurrent_seat_booking.sh.
--
-- Seed (jutro, Pod Dębem 10-16): Joanna Wrona 1 miejsce w kazdej godzinie, Anna (aktywny) u Joanny o 11,
-- Karol bez grafiku; pensjonariuszka Katarzyna (Hrabia). Wymaga swiezego seeda (`npx supabase db reset`).
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Odrzucenie zapisu: setup (postgres) ==='

begin;

-- Dwie swieze jezdzczynie bez zadnego zapisu.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'abababab-abab-abab-abab-abababababab', 'authenticated',
        'authenticated', 'zofia.nowicjuszka@example.com', '{"role":"rider","full_name":"Zofia Nowicjuszka"}',
        now(), now()),
       ('00000000-0000-0000-0000-000000000000', 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd', 'authenticated',
        'authenticated', 'celina.testowa@example.com', '{"role":"rider","full_name":"Celina Testowa"}',
        now(), now());

do $$
declare
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_stable bigint;
  v_day bigint;
  v_joanna bigint;
  v_karol bigint;
  v_yesterday bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors where stable_id = v_stable and name = 'Joanna Wrona';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  if v_day is null or v_joanna is null or v_karol is null then
    raise exception 'Brak danych seeda albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Joanna o 10 ma 2 miejsca (suma limitow o 10: 2 konie). Karol pracuje jutro: o 14 slot treningowy
  -- z 1 miejscem. Postgres pisze grafik wprost, jak seed.
  update public.schedule_slots set seats = 2
  where schedule_day_id = v_day and instructor_id = v_joanna and hour = 10;
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id, kind)
  values (v_day, v_karol, 14, 1, private.default_place_id(v_stable), 'training');

  -- Wczoraj (czas polski): slot Joanny o 10 juz sie zaczal.
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, v_today - 1, 10, 16)
  returning id into v_yesterday;
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_yesterday, v_joanna, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id)
  values (v_yesterday, v_joanna, 10, 1, private.default_place_id(v_stable));

  perform set_config('app.stable', v_stable::text, true);
  perform set_config('app.day', v_day::text, true);
  perform set_config('app.yesterday', v_yesterday::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.karol', v_karol::text, true);
  perform set_config('app.hrabia', (select h.id::text from public.horses h
                                    where h.stable_id = v_stable and h.name = 'Hrabia'), true);
  perform set_config('app.anna_11', (select b.id::text from public.bookings b
                                     where b.schedule_day_id = v_day and b.instructor_id = v_joanna
                                       and b.hour = 11), true);
end $$;

-- Zapis oczekujacy na slot, ktory juz sie zaczal (wstawia postgres - aplikacja by odmowila).
insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
values (current_setting('app.yesterday')::bigint, current_setting('app.joanna')::bigint, 10,
        'abababab-abab-abab-abab-abababababab', 'pending');
select set_config('app.zofia_yesterday', (select id::text from public.bookings
                                          where schedule_day_id = current_setting('app.yesterday')::bigint),
                  true) as ignored \gset

\echo '=== Zapisy oczekujace jezdzcow ==='

-- Zofia czeka u Joanny o 13 i o 10.
set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 13,
          'abababab-abab-abab-abab-abababababab')
  returning id
)
select set_config('app.zofia_13', b.id::text, true) as ignored from b \gset
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 10,
          'abababab-abab-abab-abab-abababababab')
  returning id
)
select set_config('app.zofia_10', b.id::text, true) as ignored from b \gset
reset role;

-- Piotr czeka u Joanny o 13 (to samo jedyne miejsce co Zofia) i o 10.
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 13,
          '44444444-4444-4444-4444-444444444444')
  returning id
)
select set_config('app.piotr_13', b.id::text, true) as ignored from b \gset
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 10,
          '44444444-4444-4444-4444-444444444444')
  returning id
)
select set_config('app.piotr_10', b.id::text, true) as ignored from b \gset
reset role;

-- Celina czeka u Joanny o 10 (trzecia na dwa miejsca).
set local role authenticated;
set local request.jwt.claims = '{"sub":"cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd","role":"authenticated"}';
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 10,
          'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd')
  returning id
)
select set_config('app.celina_10', b.id::text, true) as ignored from b \gset
reset role;

-- Pensjonariuszka Katarzyna czeka na slot treningowy Karola o 14 - z Hrabia od razu.
set local role authenticated;
set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.karol')::bigint, 14,
          '12121212-1212-1212-1212-121212121212')
  returning id
)
select set_config('app.katarzyna_14', b.id::text, true) as ignored from b \gset
reset role;

\echo '=== Nikt nie odrzuca zapisu z pominieciem funkcji ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';

do $$
begin
  begin
    update public.bookings set rejection_reason = 'Sama sobie' where id = current_setting('app.zofia_13')::bigint;
    raise exception 'FAIL: jezdziec wpisal powod odrzucenia';
  exception when insufficient_privilege then
    raise notice 'PASS: jezdziec nie wpisze powodu odrzucenia (42501)';
  end;
  begin
    perform public.reject_booking(current_setting('app.zofia_13')::bigint, 'Sama sobie');
    raise exception 'FAIL: jezdziec odrzucil zapis funkcja odrzucenia';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: jezdziec nie odrzuci zapisu (SB066)';
  end;
end $$;

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
begin
  begin
    update public.bookings set status = 'rejected' where id = current_setting('app.zofia_13')::bigint;
    raise exception 'FAIL: wlasciciel odrzucil zapis z pominieciem funkcji odrzucenia';
  exception when insufficient_privilege then
    raise notice 'PASS: wlasciciel nie odrzuca zapisu wprost (42501)';
  end;
end $$;

reset role;

do $$
begin
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
    values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 15,
            '44444444-4444-4444-4444-444444444444', 'rejected');
    raise exception 'FAIL: zapis odrzucony bez powodu i zrodla';
  exception when check_violation then
    raise notice 'PASS: zapis odrzucony zawsze ma powod i zrodlo (23514)';
  end;
end $$;

\echo '=== Odmowy odrzucenia ==='

-- Instruktor z kontem (swoj slot tak, cudzy nie): supabase/tests/instructor_booking_decisions.sql (#126).

-- Wlasciciel innego osrodka (Stajnia Nad Rzeką).
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
begin
  begin
    perform public.reject_booking(current_setting('app.zofia_13')::bigint, 'Brak koni');
    raise exception 'FAIL: wlasciciel innego osrodka odrzucil zapis';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: wlasciciel innego osrodka nie odrzuci zapisu (SB066)';
  end;
end $$;

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_status text;
begin
  begin
    perform public.reject_booking(-1, 'Brak koni');
    raise exception 'FAIL: odrzucenie nieistniejacego zapisu przeszlo';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: nieistniejacy zapis - SB066';
  end;

  begin
    perform public.reject_booking(current_setting('app.zofia_13')::bigint, null);
    raise exception 'FAIL: odrzucenie bez powodu przeszlo';
  exception when sqlstate 'SB070' then
    raise notice 'PASS: odrzucenie bez powodu odmawiane (SB070)';
  end;
  begin
    perform public.reject_booking(current_setting('app.zofia_13')::bigint, E'  \t ');
    raise exception 'FAIL: odrzucenie z samymi spacjami przeszlo';
  exception when sqlstate 'SB070' then
    raise notice 'PASS: powod z samych spacji to brak powodu (SB070)';
  end;
  begin
    perform public.reject_booking(current_setting('app.zofia_13')::bigint, repeat('x', 301));
    raise exception 'FAIL: odrzucenie z powodem 301 znakow przeszlo';
  exception when sqlstate 'SB071' then
    raise notice 'PASS: powod dluzszy niz 300 znakow odmawiany (SB071)';
  end;

  begin
    perform public.reject_booking(current_setting('app.anna_11')::bigint, 'Brak koni');
    raise exception 'FAIL: odrzucenie zapisu aktywnego przeszlo';
  exception when sqlstate 'SB065' then
    raise notice 'PASS: odrzucenie zapisu nieoczekujacego odmawiane (SB065)';
  end;

  begin
    perform public.reject_booking(current_setting('app.zofia_yesterday')::bigint, 'Brak koni');
    raise exception 'FAIL: odrzucenie po starcie slotu przeszlo';
  exception when sqlstate 'SB064' then
    raise notice 'PASS: odrzucenie po starcie slotu odmawiane (SB064)';
  end;

  select status into v_status from public.bookings where id = current_setting('app.zofia_13')::bigint;
  if v_status <> 'pending' then
    raise exception 'FAIL: odmowy odrzucenia zmienily zapis (stan %)', v_status;
  end if;
  raise notice 'PASS: odmowa odrzucenia niczego nie zmienia';
end $$;

reset role;

\echo '=== Odrzucenie przez wlasciciela ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  r record;
  v int;
  v_result text;
begin
  -- Powod na granicy dlugosci (300 znakow po przycieciu) przechodzi.
  perform public.reject_booking(current_setting('app.katarzyna_14')::bigint, '  ' || repeat('k', 300) || ' ');
  select status, rejection_reason, rejection_source, horse_id into r from public.bookings
  where id = current_setting('app.katarzyna_14')::bigint;
  if r.status <> 'rejected' or r.rejection_reason <> repeat('k', 300) or r.rejection_source <> 'stable'
     or r.horse_id is not null then
    raise exception 'FAIL: odrzucony zapis na slot treningowy: %', row_to_json(r);
  end if;
  raise notice 'PASS: odrzucenie z powodem 300 znakow, przycietym; kon pensjonatowy zwolniony';

  -- Funkcja oddaje stan zapisu po odrzuceniu (odczyt zwrotny dla endpointu przed komunikatem sukcesu).
  v_result := public.reject_booking(current_setting('app.zofia_13')::bigint, '  Na tę godzinę mamy już komplet.  ');
  if v_result is distinct from 'rejected' then
    raise exception 'FAIL: odrzucenie zwrocilo stan %, oczekiwano rejected', v_result;
  end if;
  raise notice 'PASS: odrzucenie zwraca stan zapisu po zmianie (rejected)';
  select status, rejection_reason, rejection_source, rejected_at, accepted_at into r from public.bookings
  where id = current_setting('app.zofia_13')::bigint;
  if r.status <> 'rejected' or r.rejection_reason <> 'Na tę godzinę mamy już komplet.'
     or r.rejection_source <> 'stable' or r.rejected_at is null or r.accepted_at is not null then
    raise exception 'FAIL: odrzucony zapis: %', row_to_json(r);
  end if;
  raise notice 'PASS: odrzucenie zmienia zapis oczekujacy w odrzucony z powodem i zrodlem stable';

  select count(*) into v from public.get_pending_bookings()
  where booking_id in (current_setting('app.zofia_13')::bigint, current_setting('app.katarzyna_14')::bigint);
  if v <> 0 then
    raise exception 'FAIL: odrzucony zapis zostal w zapisach do przyjecia';
  end if;
  raise notice 'PASS: odrzucony zapis znika z zapisow do przyjecia';

  begin
    perform public.reject_booking(current_setting('app.zofia_13')::bigint, 'Jeszcze raz');
    raise exception 'FAIL: ponowne odrzucenie przeszlo';
  exception when sqlstate 'SB065' then
    raise notice 'PASS: odrzucenie zapisu odrzuconego odmawiane (SB065)';
  end;
  begin
    perform public.accept_booking(current_setting('app.zofia_13')::bigint);
    raise exception 'FAIL: przyjecie zapisu odrzuconego przeszlo';
  exception when sqlstate 'SB065' then
    raise notice 'PASS: zapisu odrzuconego nie da sie przyjac (SB065)';
  end;
end $$;

reset role;

\echo '=== Jezdziec widzi powod i zapisuje sie ponownie ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';

do $$
declare
  v_reason text;
  v_id bigint;
begin
  select rejection_reason into v_reason from public.bookings where id = current_setting('app.zofia_13')::bigint;
  if v_reason is distinct from 'Na tę godzinę mamy już komplet.' then
    raise exception 'FAIL: jezdziec nie widzi powodu odrzucenia (%)', v_reason;
  end if;
  raise notice 'PASS: jezdziec widzi powod odrzucenia swojego zapisu';

  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 13,
          'abababab-abab-abab-abab-abababababab')
  returning id into v_id;
  perform set_config('app.zofia_13_again', v_id::text, true);
  raise notice 'PASS: po odrzuceniu jezdziec zapisuje sie na ten sam slot ponownie';
end $$;

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_again boolean;
  v_piotr boolean;
begin
  select rejected_before into v_again from public.get_pending_bookings()
  where booking_id = current_setting('app.zofia_13_again')::bigint;
  select rejected_before into v_piotr from public.get_pending_bookings()
  where booking_id = current_setting('app.piotr_13')::bigint;
  if v_again is distinct from true or v_piotr is distinct from false then
    raise exception 'FAIL: znacznik wczesniejszego odrzucenia: Zofia %, Piotr %', v_again, v_piotr;
  end if;
  raise notice 'PASS: wlasciciel widzi, ze wczesniej odrzucil temu jezdzcowi zapis na ten slot';
end $$;

reset role;

\echo '=== Przyjecie, ktore zapelnia slot, odrzuca pozostale zapisy oczekujace („Brak miejsc”) ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_status text;
  r record;
begin
  -- Joanna o 10: 2 miejsca, czekaja Zofia, Piotr, Celina. Pierwsze przyjecie slotu nie zapelnia.
  perform public.accept_booking(current_setting('app.zofia_10')::bigint);
  select count(*) filter (where status = 'pending') as pending into r from public.bookings
  where id in (current_setting('app.piotr_10')::bigint, current_setting('app.celina_10')::bigint);
  if r.pending <> 2 then
    raise exception 'FAIL: przyjecie, ktore nie zapelnia slotu, odrzucilo zapisy oczekujace';
  end if;
  raise notice 'PASS: przyjecie, ktore nie zapelnia slotu, zostawia pozostale zapisy oczekujace';

  -- Drugie przyjecie zapelnia slot: Celina odrzucona z powodem „Brak miejsc”.
  perform public.accept_booking(current_setting('app.piotr_10')::bigint);
  select status, rejection_reason, rejection_source, rejected_at into r from public.bookings
  where id = current_setting('app.celina_10')::bigint;
  if r.status <> 'rejected' or r.rejection_reason <> 'Brak miejsc' or r.rejection_source <> 'no_seats'
     or r.rejected_at is null then
    raise exception 'FAIL: pozostaly zapis oczekujacy po zapelnieniu slotu: %', row_to_json(r);
  end if;
  raise notice 'PASS: przyjecie, ktore zapelnia slot, odrzuca pozostale zapisy oczekujace z powodem „Brak miejsc”';

  -- Zapis oczekujacy na inny slot zostaje.
  select status into v_status from public.bookings where id = current_setting('app.piotr_13')::bigint;
  if v_status <> 'pending' then
    raise exception 'FAIL: zapelnienie slotu o 10 zmienilo zapis Piotra o 13 (%)', v_status;
  end if;
  raise notice 'PASS: zapisy oczekujace na inne sloty zostaja';

  -- Joanna o 13 (1 miejsce): przyjecie Piotra odrzuca ponowny zapis Zofii.
  perform public.accept_booking(current_setting('app.piotr_13')::bigint);
  select status, rejection_reason, rejection_source into r from public.bookings
  where id = current_setting('app.zofia_13_again')::bigint;
  if r.status <> 'rejected' or r.rejection_reason <> 'Brak miejsc' or r.rejection_source <> 'no_seats' then
    raise exception 'FAIL: ponowny zapis Zofii po zapelnieniu slotu o 13: %', row_to_json(r);
  end if;
  raise notice 'PASS: automatyczne odrzucenie „Brak miejsc” rozni sie zrodlem od recznego';
end $$;

reset role;

-- Jezdziec widzi automatyczny powod.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd","role":"authenticated"}';

do $$
declare
  v_reason text;
begin
  select rejection_reason into v_reason from public.bookings where id = current_setting('app.celina_10')::bigint;
  if v_reason is distinct from 'Brak miejsc' then
    raise exception 'FAIL: jezdziec nie widzi powodu „Brak miejsc” (%)', v_reason;
  end if;
  raise notice 'PASS: jezdziec widzi powod „Brak miejsc”';

  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 10,
            'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd');
    raise exception 'FAIL: zapis na pelny slot po odrzuceniu „Brak miejsc” przeszedl';
  exception when sqlstate 'SB009' then
    raise notice 'PASS: na pelny slot nowy zapis oczekujacy odmawiany (SB009)';
  end;
end $$;

reset role;

rollback;

\echo '=== Odrzucenie zapisu: wszystkie dowody przeszly ==='
