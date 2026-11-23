-- Dowod przyjmowania i odrzucania zapisow przez instruktora z kontem (#126, spec #122, ADR 0006, GLOSSARY
-- „Przyjęcie zapisu”, „Odrzucenie zapisu”).
--
-- Gwarancje:
--   * instruktor z kontem (nie wlasciciel) widzi w zapisach do przyjecia (public.get_pending_bookings) zapisy
--     oczekujace na swoje sloty, a na sloty innych instruktorow nie; wlasciciel dalej widzi wszystkie
--   * instruktor przyjmuje (public.accept_booking) i odrzuca (public.reject_booking) zapis oczekujacy na swoj
--     slot - tak jak wlasciciel: przyjecie zajmuje miejsce, a gdy zapelnia slot, pozostale zapisy oczekujace na
--     niego odrzucaja sie same („Brak miejsc”); odrzucenie niesie powod i zrodlo 'stable'
--   * zapisu na cudzy slot instruktor nie przyjmie ani nie odrzuci (SB066), zapis zostaje oczekujacy
--   * instruktor zdezaktywowany traci zapisy do przyjecia i prawo decyzji (SB066)
--
-- Seed (jutro, Pod Dębem 10-16): Joanna Wrona (konto 9999..., bez praw wlasciciela) 1 miejsce w kazdej
-- godzinie, Anna u Joanny o 11, Karol bez grafiku i bez konta. Wymaga swiezego seeda (`npx supabase db reset`).
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Decyzje instruktora: setup (postgres) ==='

begin;

-- Swieza jezdzczyni bez zadnego zapisu.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'abababab-abab-abab-abab-abababababab', 'authenticated',
        'authenticated', 'zofia.nowicjuszka@example.com', '{"role":"rider","full_name":"Zofia Nowicjuszka"}',
        now(), now());

do $$
declare
  v_stable bigint;
  v_day bigint;
  v_joanna bigint;
  v_karol bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors
  where stable_id = v_stable and account_id = '99999999-9999-9999-9999-999999999999';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  if v_day is null or v_joanna is null or v_karol is null then
    raise exception 'Brak danych seeda albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Karol pracuje jutro: o 14 slot rekreacyjny z 1 miejscem. Postgres pisze grafik wprost, jak seed.
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id)
  values (v_day, v_karol, 14, 1, private.default_place_id(v_stable));

  perform set_config('app.day', v_day::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.karol', v_karol::text, true);
end $$;

\echo '=== Zapisy oczekujace jezdzcow ==='

-- Zofia czeka u Joanny o 13, 14 i 15.
set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';

do $$
declare
  v_hour smallint;
  v_id bigint;
begin
  foreach v_hour in array array[13, 14, 15]::smallint[] loop
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, v_hour,
            'abababab-abab-abab-abab-abababababab')
    returning id into v_id;
    perform set_config('app.zofia_' || v_hour, v_id::text, true);
  end loop;
end $$;

reset role;

-- Piotr czeka u Joanny o 13 (to samo jedyne miejsce co Zofia) i u Karola o 14.
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

do $$
declare
  v_id bigint;
begin
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 13,
          '44444444-4444-4444-4444-444444444444')
  returning id into v_id;
  perform set_config('app.piotr_13', v_id::text, true);

  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.karol')::bigint, 14,
          '44444444-4444-4444-4444-444444444444')
  returning id into v_id;
  perform set_config('app.piotr_karol_14', v_id::text, true);
end $$;

reset role;

\echo '=== Zapisy do przyjecia: instruktor widzi swoje sloty, wlasciciel wszystkie ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_ids bigint[];
  v_expected bigint[] := array[
    current_setting('app.zofia_13')::bigint, current_setting('app.piotr_13')::bigint,
    current_setting('app.zofia_14')::bigint, current_setting('app.zofia_15')::bigint
  ];
  r record;
begin
  select array_agg(booking_id order by day, hour, created_at, booking_id) into v_ids
  from public.get_pending_bookings();
  if v_ids is distinct from v_expected then
    raise exception 'FAIL: instruktorka widzi zapisy do przyjecia % zamiast %', v_ids, v_expected;
  end if;
  raise notice 'PASS: instruktorka widzi zapisy oczekujace na swoje sloty, a na sloty Karola nie';

  select rider_name, rider_email, instructor_name, seats, taken into r from public.get_pending_bookings()
  where booking_id = current_setting('app.zofia_13')::bigint;
  if r.rider_name is distinct from 'Zofia Nowicjuszka' or r.rider_email is distinct from 'zofia.nowicjuszka@example.com'
     or r.instructor_name is distinct from 'Joanna Wrona' or r.seats <> 1 or r.taken <> 0 then
    raise exception 'FAIL: wiersz zapisu do przyjecia instruktorki: %', row_to_json(r);
  end if;
  raise notice 'PASS: instruktorka widzi jezdzca (imie i adres) i miejsca slotu';
end $$;

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.get_pending_bookings()
  where booking_id in (current_setting('app.zofia_13')::bigint, current_setting('app.piotr_13')::bigint,
                       current_setting('app.zofia_14')::bigint, current_setting('app.zofia_15')::bigint,
                       current_setting('app.piotr_karol_14')::bigint);
  if v <> 5 then
    raise exception 'FAIL: wlasciciel widzi % z 5 zapisow oczekujacych osrodka', v;
  end if;
  raise notice 'PASS: wlasciciel dalej widzi zapisy oczekujace na wszystkie sloty osrodka';
end $$;

reset role;

\echo '=== Cudzy slot: instruktor nie przyjmie ani nie odrzuci ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_status text;
begin
  begin
    perform public.accept_booking(current_setting('app.piotr_karol_14')::bigint);
    raise exception 'FAIL: instruktorka przyjela zapis na slot Karola';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: instruktorka nie przyjmie zapisu na cudzy slot (SB066)';
  end;
  begin
    perform public.reject_booking(current_setting('app.piotr_karol_14')::bigint, 'Nie moj slot');
    raise exception 'FAIL: instruktorka odrzucila zapis na slot Karola';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: instruktorka nie odrzuci zapisu na cudzy slot (SB066)';
  end;
  begin
    perform public.accept_booking(-1);
    raise exception 'FAIL: przyjecie nieistniejacego zapisu przeszlo';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: nieistniejacy zapis - SB066';
  end;

  select status into v_status from public.bookings where id = current_setting('app.piotr_karol_14')::bigint;
  if v_status is distinct from null then
    raise exception 'FAIL: instruktorka czyta wprost cudzy zapis oczekujacy (stan %)', v_status;
  end if;
end $$;

reset role;

do $$
begin
  if (select status from public.bookings where id = current_setting('app.piotr_karol_14')::bigint) <> 'pending' then
    raise exception 'FAIL: odmowa instruktorki zmienila zapis na slot Karola';
  end if;
  raise notice 'PASS: zapis na cudzy slot zostaje oczekujacy';
end $$;

\echo '=== Swoj slot: instruktor przyjmuje i odrzuca ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
begin
  perform public.accept_booking(current_setting('app.zofia_13')::bigint);
  perform public.reject_booking(current_setting('app.zofia_14')::bigint, '  Tego dnia prowadzę tylko zaawansowanych.  ');
  raise notice 'PASS: instruktorka przyjmuje i odrzuca zapisy na swoje sloty';
end $$;

reset role;

do $$
declare
  r record;
begin
  select status, accepted_at into r from public.bookings where id = current_setting('app.zofia_13')::bigint;
  if r.status <> 'active' or r.accepted_at is null then
    raise exception 'FAIL: zapis przyjety przez instruktorke: %', row_to_json(r);
  end if;
  raise notice 'PASS: przyjecie przez instruktorke zmienia zapis w aktywny';

  select status, rejection_reason, rejection_source into r from public.bookings
  where id = current_setting('app.piotr_13')::bigint;
  if r.status <> 'rejected' or r.rejection_reason <> 'Brak miejsc' or r.rejection_source <> 'no_seats' then
    raise exception 'FAIL: pozostaly zapis na zapelniony slot: %', row_to_json(r);
  end if;
  raise notice 'PASS: przyjecie przez instruktorke, ktore zapelnia slot, odrzuca pozostalych („Brak miejsc”)';

  select status, rejection_reason, rejection_source into r from public.bookings
  where id = current_setting('app.zofia_14')::bigint;
  if r.status <> 'rejected' or r.rejection_reason <> 'Tego dnia prowadzę tylko zaawansowanych.'
     or r.rejection_source <> 'stable' then
    raise exception 'FAIL: zapis odrzucony przez instruktorke: %', row_to_json(r);
  end if;
  raise notice 'PASS: odrzucenie przez instruktorke niesie powod (przyciety) i zrodlo stable';
end $$;

\echo '=== Instruktor zdezaktywowany ==='

update public.instructors set active = false where id = current_setting('app.joanna')::bigint;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.get_pending_bookings();
  if v <> 0 then
    raise exception 'FAIL: zdezaktywowana instruktorka czyta zapisy do przyjecia (% wierszy)', v;
  end if;
  raise notice 'PASS: zdezaktywowana instruktorka nie widzi zapisow do przyjecia';

  begin
    perform public.accept_booking(current_setting('app.zofia_15')::bigint);
    raise exception 'FAIL: zdezaktywowana instruktorka przyjela zapis';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: zdezaktywowana instruktorka nie przyjmie zapisu (SB066)';
  end;
  begin
    perform public.reject_booking(current_setting('app.zofia_15')::bigint, 'Brak koni');
    raise exception 'FAIL: zdezaktywowana instruktorka odrzucila zapis';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: zdezaktywowana instruktorka nie odrzuci zapisu (SB066)';
  end;
end $$;

reset role;

rollback;
