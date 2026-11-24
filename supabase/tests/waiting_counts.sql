-- Dowod liczb zapisow oczekujacych (#128, spec #122, ADR 0006, GLOSSARY „Zapis oczekujacy”).
--
-- Gwarancje:
--   * licznik zapisow do przyjecia (public.count_pending_bookings): wlasciciel - caly swoj osrodek, instruktor
--     z kontem - tylko swoje sloty, jezdziec - 0; zapis oczekujacy, ktorego slot sie zaczal (wygasly), sie nie
--     liczy; zapisy innego osrodka sie nie licza
--   * liczba czekajacych na slot (public.get_slot_occupancy.waiting): osrodek widzi ja zawsze (takze 0 przy
--     slocie z samymi aktywnymi), instruktor z kontem - na swoich slotach, pensjonariusz - przy slotach
--     treningowych; kto liczbe widzi, dostaje wiersz kazdego slotu w swoim zakresie, takze bez zapisow (0/0) -
--     aplikacja nie decyduje o widocznosci sama; jezdziec rekreacyjny dostaje NULL i nie dostaje wiersza slotu
--     z samymi zapisami oczekujacymi ani slotu bez zapisow (nie dowie sie, ze ktos czeka); taken nadal liczy
--     tylko zapisy aktywne
--   * licznik zapisow do przyjecia liczy dokladnie wiersze listy zapisow do przyjecia (jeden filtr)
--
-- Seed (jutro, Pod Dębem 10-16): Joanna Wrona (konto 9999...) 1 miejsce w kazdej godzinie, Anna (aktywny)
-- u Joanny o 11, Karol bez grafiku; Nad Rzeką: Tomasz Lis 1 miejsce 9-14, Piotr (aktywny) o 10;
-- pensjonariuszka Katarzyna (Hrabia Pod Dębem). Wymaga swiezego seeda (`npx supabase db reset`).
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Liczby zapisow oczekujacych: setup (postgres) ==='

begin;

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
  v_tomasz bigint;
  v_river_day bigint;
  v_yesterday bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors where stable_id = v_stable and name = 'Joanna Wrona';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  select i.id, sd.id into v_tomasz, v_river_day
  from public.instructors i
  join public.schedule_days sd on sd.stable_id = i.stable_id and sd.day = current_date + 1
  where i.name = 'Tomasz Lis';
  if v_day is null or v_joanna is null or v_karol is null or v_river_day is null then
    raise exception 'Brak danych seeda albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Karol pracuje jutro: o 12 slot rekreacyjny (1 miejsce), o 14 treningowy (2 miejsca), o 15 treningowy bez
  -- zadnego zapisu (1 miejsce).
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id, kind)
  values (v_day, v_karol, 12, 1, private.default_place_id(v_stable), 'recreation'),
         (v_day, v_karol, 14, 2, private.default_place_id(v_stable), 'training'),
         (v_day, v_karol, 15, 1, private.default_place_id(v_stable), 'training');

  -- Wczoraj (czas polski): slot Joanny o 10 juz sie zaczal.
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, v_today - 1, 10, 16)
  returning id into v_yesterday;
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_yesterday, v_joanna, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id)
  values (v_yesterday, v_joanna, 10, 1, private.default_place_id(v_stable));

  -- Zapisy oczekujace (postgres pisze wprost; wyzwalacze regul slotu dzialaja jak dla jezdzca):
  -- Joanna o 13 - Zofia i Celina; Karol o 12 (rekreacyjny) - Zofia; Karol o 14 (treningowy) - Katarzyna
  -- na Hrabi; wczoraj Joanna o 10 - Zofia (wygasly); Nad Rzeką Tomasz o 12 - Celina.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_joanna, 13, 'abababab-abab-abab-abab-abababababab', 'pending'),
         (v_day, v_joanna, 13, 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd', 'pending'),
         (v_day, v_karol, 12, 'abababab-abab-abab-abab-abababababab', 'pending'),
         (v_day, v_karol, 14, '12121212-1212-1212-1212-121212121212', 'pending'),
         (v_yesterday, v_joanna, 10, 'abababab-abab-abab-abab-abababababab', 'pending'),
         (v_river_day, v_tomasz, 12, 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd', 'pending');

  perform set_config('app.stable', v_stable::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.karol', v_karol::text, true);
end $$;

-- Pomocnik: zajetosc jednego slotu jako tekst `taken/waiting` (`-` - brak wiersza, `null` - liczba ukryta).
create function pg_temp.slot(p_day date, p_instructor text, p_hour int)
returns text
language sql
as $$
  select coalesce(
    (select o.taken::text || '/' || coalesce(o.waiting::text, 'null')
     from public.get_slot_occupancy(current_setting('app.stable')::bigint, p_day) o
     where o.instructor_id = current_setting(p_instructor)::bigint and o.hour = p_hour),
    '-'
  );
$$;
grant execute on function pg_temp.slot(date, text, int) to authenticated;

\echo '=== Licznik zapisow do przyjecia ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare v int := public.count_pending_bookings();
begin
  if v <> 4 then
    raise exception 'FAIL: wlasciciel liczy % zapisow do przyjecia (oczekiwane 4: bez wygaslego i bez innego osrodka)', v;
  end if;
  raise notice 'PASS: wlasciciel liczy zapisy do przyjecia calego osrodka, bez wygaslych';
  if v <> (select count(*) from public.get_pending_bookings()) then
    raise exception 'FAIL: licznik (%) liczy inne zapisy niz lista zapisow do przyjecia (%)',
      v, (select count(*) from public.get_pending_bookings());
  end if;
  raise notice 'PASS: licznik liczy dokladnie wiersze listy zapisow do przyjecia (bez wygaslego)';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
do $$
declare v int := public.count_pending_bookings();
begin
  if v <> 2 then
    raise exception 'FAIL: instruktorka liczy % zapisow do przyjecia (oczekiwane 2 - tylko swoje sloty)', v;
  end if;
  raise notice 'PASS: instruktor z kontem liczy tylko zapisy do przyjecia swoich slotow';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
do $$
declare v int := public.count_pending_bookings();
begin
  if v <> 1 then
    raise exception 'FAIL: wlasciciel Nad Rzeką liczy % zapisow do przyjecia (oczekiwane 1)', v;
  end if;
  raise notice 'PASS: wlasciciel innego osrodka liczy tylko swoje';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';
do $$
declare v int := public.count_pending_bookings();
begin
  if v <> 0 then
    raise exception 'FAIL: jezdziec dostal licznik zapisow do przyjecia (%)', v;
  end if;
  raise notice 'PASS: jezdziec nie ma zapisow do przyjecia';
end $$;
reset role;

\echo '=== Liczba czekajacych na slot ==='

-- Wlasciciel: zawsze, takze 0 przy slocie z samym aktywnym zapisem; wygasly sie nie liczy.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
do $$
declare
  v_tomorrow date := current_date + 1;
  v_yesterday date := (now() at time zone 'Europe/Warsaw')::date - 1;
begin
  if pg_temp.slot(v_tomorrow, 'app.joanna', 13) <> '0/2'
     or pg_temp.slot(v_tomorrow, 'app.joanna', 11) <> '1/0'
     or pg_temp.slot(v_tomorrow, 'app.karol', 12) <> '0/1'
     or pg_temp.slot(v_tomorrow, 'app.karol', 14) <> '0/1'
     or pg_temp.slot(v_tomorrow, 'app.karol', 15) <> '0/0' then
    raise exception 'FAIL: wlasciciel widzi J13 %, J11 %, K12 %, K14 %, K15 % (oczekiwane 0/2, 1/0, 0/1, 0/1, 0/0)',
      pg_temp.slot(v_tomorrow, 'app.joanna', 13), pg_temp.slot(v_tomorrow, 'app.joanna', 11),
      pg_temp.slot(v_tomorrow, 'app.karol', 12), pg_temp.slot(v_tomorrow, 'app.karol', 14),
      pg_temp.slot(v_tomorrow, 'app.karol', 15);
  end if;
  raise notice 'PASS: osrodek widzi liczbe czekajacych przy kazdym slocie; taken liczy tylko aktywne';
  if pg_temp.slot(v_yesterday, 'app.joanna', 10) <> '0/0' then
    raise exception 'FAIL: wygasly zapis liczy sie jako czekajacy (%)', pg_temp.slot(v_yesterday, 'app.joanna', 10);
  end if;
  raise notice 'PASS: zapis oczekujacy, ktorego slot sie zaczal, nie czeka';
end $$;
reset role;

-- Instruktorka z kontem: swoje sloty z liczba czekajacych, cudzych nie widzi.
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';
do $$
declare v_tomorrow date := current_date + 1;
begin
  if pg_temp.slot(v_tomorrow, 'app.joanna', 13) <> '0/2' or pg_temp.slot(v_tomorrow, 'app.joanna', 10) <> '0/0'
     or pg_temp.slot(v_tomorrow, 'app.karol', 14) <> '-' then
    raise exception 'FAIL: instruktorka widzi J13 %, J10 %, K14 % (oczekiwane 0/2, 0/0, -)',
      pg_temp.slot(v_tomorrow, 'app.joanna', 13), pg_temp.slot(v_tomorrow, 'app.joanna', 10),
      pg_temp.slot(v_tomorrow, 'app.karol', 14);
  end if;
  raise notice 'PASS: instruktor z kontem widzi czekajacych na swoich slotach, cudzych slotow nie';
end $$;
reset role;

-- Jezdziec rekreacyjny (Anna): tylko aktywne zapisy, liczba czekajacych ukryta; slot z samymi oczekujacymi
-- nie ma wiersza.
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_tomorrow date := current_date + 1;
begin
  if pg_temp.slot(v_tomorrow, 'app.joanna', 11) <> '1/null'
     or pg_temp.slot(v_tomorrow, 'app.joanna', 13) <> '-'
     or pg_temp.slot(v_tomorrow, 'app.karol', 12) <> '-'
     or pg_temp.slot(v_tomorrow, 'app.karol', 14) <> '-'
     or pg_temp.slot(v_tomorrow, 'app.karol', 15) <> '-'
     or pg_temp.slot(v_tomorrow, 'app.joanna', 10) <> '-' then
    raise exception 'FAIL: jezdziec rekreacyjny widzi J11 %, J13 %, K12 %, K14 %, K15 %, J10 % (oczekiwane 1/null, -, -, -, -, -)',
      pg_temp.slot(v_tomorrow, 'app.joanna', 11), pg_temp.slot(v_tomorrow, 'app.joanna', 13),
      pg_temp.slot(v_tomorrow, 'app.karol', 12), pg_temp.slot(v_tomorrow, 'app.karol', 14),
      pg_temp.slot(v_tomorrow, 'app.karol', 15), pg_temp.slot(v_tomorrow, 'app.joanna', 10);
  end if;
  raise notice 'PASS: jezdziec rekreacyjny widzi tylko zajete miejsca, nie liczbe czekajacych';
end $$;
reset role;

-- Pensjonariuszka Katarzyna: liczba czekajacych przy slocie treningowym, przy rekreacyjnym - nie.
set local role authenticated;
set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';
do $$
declare v_tomorrow date := current_date + 1;
begin
  if pg_temp.slot(v_tomorrow, 'app.karol', 14) <> '0/1'
     or pg_temp.slot(v_tomorrow, 'app.karol', 15) <> '0/0'
     or pg_temp.slot(v_tomorrow, 'app.karol', 12) <> '-'
     or pg_temp.slot(v_tomorrow, 'app.joanna', 10) <> '-'
     or pg_temp.slot(v_tomorrow, 'app.joanna', 11) <> '1/null' then
    raise exception 'FAIL: pensjonariuszka widzi K14 %, K15 %, K12 %, J10 %, J11 % (oczekiwane 0/1, 0/0, -, -, 1/null)',
      pg_temp.slot(v_tomorrow, 'app.karol', 14), pg_temp.slot(v_tomorrow, 'app.karol', 15),
      pg_temp.slot(v_tomorrow, 'app.karol', 12), pg_temp.slot(v_tomorrow, 'app.joanna', 10),
      pg_temp.slot(v_tomorrow, 'app.joanna', 11);
  end if;
  raise notice 'PASS: pensjonariusz widzi liczbe czekajacych tylko przy slotach treningowych, takze 0 przy slocie bez zapisow';
end $$;
reset role;

rollback;

\echo '=== Liczby zapisow oczekujacych: wszystkie dowody przeszly ==='
