-- Dowod funkcji Podsumowania miesiaca instruktora (#90, spec #87, GLOSSARY "Podsumowanie miesiaca").
--
-- Gwarancje w bazie, nie w aplikacji - public.get_my_month_bookings(from, to):
--   * (#118) przy kazdym zapisie regule "pensjonariusz w miesiacu" (boarder) - z tej samej funkcji
--     private.is_boarder_in_month co odmowy zapisu; zanonimizowany - false,
--   * zwraca wylacznie AKTYWNE zapisy na sloty ZALOGOWANEGO instruktora w dniach from..to
--     (wlacznie) - bez odwolanych, bez zapisow na sloty innego instruktora i spoza zakresu,
--   * z kluczem jezdzca (konto), dzieki czemu jezdzcy o tej samej nazwie i bez nazwy sie nie
--     zlewaja; jezdziec zanonimizowany - brak klucza i anonymised = true; kon albo NULL,
--   * jezdziec, konto instruktora bez osrodka, instruktor innego osrodka (jego wlasne sloty,
--     nic z cudzego osrodka) i instruktor zdezaktywowany - zero wierszy z tego osrodka,
--   * anon nie wywola funkcji.
--
-- Seed (jutro, Pod Dębem 10-16, Bella + Kasztan): Joanna Wrona (konto 99999999...) z zapisem Anny
-- o 11; Karol Jasny (bez konta) nie pracuje. Nad Rzeką: Piotr u Tomasza Lisa (bez konta) o 10.
-- Skrypt dokleja dzien sprzed 3 dni z zapisami Joanny i Karola; slot Joanny o 15 jest treningowy, a jezdzi
-- na nim pensjonariuszka Katarzyna Zając (Hrabia, pobyt od 90 dni, #114).
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/instructor_month_summary.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Podsumowanie miesiaca instruktora: setup (postgres) ==='

begin;

do $$
declare
  v_stable bigint;
  v_rzeka bigint;
  v_day bigint;
  v_joanna bigint;
  v_karol bigint;
  v_tomasz bigint;
  v_bella bigint;
  v_kasztan bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_rzeka from public.stables where owner_id = '22222222-2222-2222-2222-222222222222';
  select id into v_joanna from public.instructors
  where stable_id = v_stable and account_id = '99999999-9999-9999-9999-999999999999';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  select id into v_tomasz from public.instructors where stable_id = v_rzeka and name = 'Tomasz Lis';
  select id into v_bella from public.horses where stable_id = v_stable and name = 'Bella';
  select id into v_kasztan from public.horses where stable_id = v_stable and name = 'Kasztan';

  if v_joanna is null or v_karol is null or v_tomasz is null or v_bella is null
     or not exists (
       select 1 from public.bookings b join public.schedule_days sd on sd.id = b.schedule_day_id
       where b.instructor_id = v_joanna and sd.day = current_date + 1 and b.hour = 11 and b.status = 'active'
     ) then
    raise exception 'Brak danych seeda albo seed nieaktualny - uruchom npx supabase db reset';
  end if;
  if exists (select 1 from public.schedule_days where stable_id = v_stable and day = current_date - 3) then
    raise exception 'Dzien sprzed 3 dni juz istnieje (historia demo?) - uruchom npx supabase db reset';
  end if;

  -- Dzien sprzed 3 dni: Bella i Kasztan, Joanna i Karol po 1 miejscu w kazdej godzinie.
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, current_date - 3, 10, 16)
  returning id into v_day;
  insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
  values (v_day, v_bella, v_stable), (v_day, v_kasztan, v_stable);
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_joanna, v_stable), (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select v_day, i, h, 1 from unnest(array[v_joanna, v_karol]) i cross join generate_series(10, 15) h;
  update public.schedule_slots set kind = 'training'
  where schedule_day_id = v_day and instructor_id = v_joanna and hour = 15;

  -- Joanna: Anna o 10 na Belli, Piotr o 11 bez konia, odwolany Piotr o 12, zanonimizowany o 13.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, horse_id, status)
  values (v_day, v_joanna, 10, '33333333-3333-3333-3333-333333333333', v_bella, 'active'),
         (v_day, v_joanna, 11, '44444444-4444-4444-4444-444444444444', null, 'active'),
         (v_day, v_joanna, 13, '33333333-3333-3333-3333-333333333333', null, 'active');
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, cancelled_at, cancelled_by)
  values (v_day, v_joanna, 12, '44444444-4444-4444-4444-444444444444', 'cancelled', now(), 'rider');
  -- Jak po usunieciu profilu (ADR-0001): zapis zostaje, jezdzca juz nie ma.
  update public.bookings set rider_id = null
  where schedule_day_id = v_day and instructor_id = v_joanna and hour = 13;
  -- Joanna o 15 (slot treningowy): Katarzyna - kon pensjonatowy przydziela wyzwalacz (jedyny z pobytem).
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_joanna, 15, '12121212-1212-1212-1212-121212121212', 'active');
  -- Karol: Piotr o 14 na Kasztanie - slot innego instruktora tego samego osrodka.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, horse_id, status)
  values (v_day, v_karol, 14, '44444444-4444-4444-4444-444444444444', v_kasztan, 'active');

  -- Konto instruktora bez osrodka i konto Tomasza Lisa (instruktor innego osrodka).
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated',
          'authenticated', 'bez.osrodka@example.com', '{"role":"instructor","full_name":"Bez Osrodka"}', now(), now()),
         ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated',
          'authenticated', 'tomasz.lis@example.com', '{"role":"instructor","full_name":"Tomasz Lis"}', now(), now());
  update public.instructors set account_id = '66666666-6666-6666-6666-666666666666' where id = v_tomasz;

  perform set_config('app.joanna', v_joanna::text, true);
end $$;

\echo '=== Ksztalt wyniku: klucz jezdzca, bez danych instruktora ==='

do $$
declare
  v_columns text;
begin
  select string_agg(a.name, ',' order by a.ord) into v_columns
  from pg_proc p
  cross join lateral unnest(p.proargnames, p.proargmodes::text[]) with ordinality as a(name, mode, ord)
  where p.oid = 'public.get_my_month_bookings(date, date)'::regprocedure
    and a.mode = 't';
  if v_columns <> 'day,hour,rider_key,rider_name,horse_name,anonymised,boarder' then
    raise exception 'FAIL 0: get_my_month_bookings zwraca kolumny %', v_columns;
  end if;
  raise notice 'PASS 0: wynik to dzien, godzina, klucz i nazwa jezdzca, kon, znacznik anonimizacji i pensjonariusza';
end $$;

set local role authenticated;

\echo '=== Instruktorka Joanna: aktywne zapisy na jej sloty w zakresie dat ==='

set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_rows text;
  v int;
begin
  select string_agg(
           concat_ws('|', hour, coalesce(rider_key::text, '-'), coalesce(rider_name, '-'), coalesce(horse_name, '-'),
                     anonymised, boarder),
           ',' order by hour)
    into v_rows
  from public.get_my_month_bookings(current_date - 3, current_date - 3);
  if v_rows is distinct from
     '10|33333333-3333-3333-3333-333333333333|Anna Kowalska|Bella|f|f,'
     '11|44444444-4444-4444-4444-444444444444|Piotr Nowak|-|f|f,'
     '13|-|-|-|t|f,'
     '15|12121212-1212-1212-1212-121212121212|Katarzyna Zając|Hrabia|f|t' then
    raise exception 'FAIL 1: zapisy Joanny sprzed 3 dni: %', v_rows;
  end if;
  raise notice 'PASS 1: aktywne zapisy na moje sloty z kluczem jezdzca; zanonimizowany bez klucza, z flaga; pensjonariuszka z flaga boarder; bez odwolanych i bez slotow Karola';

  select count(*) into v from public.get_my_month_bookings(current_date - 3, current_date);
  if v <> 4 then
    raise exception 'FAIL 2a: zakres do dzis ma % wierszy (jutrzejszy zapis Anny poza zakresem)', v;
  end if;
  select count(*) into v from public.get_my_month_bookings(current_date - 3, current_date + 1);
  if v <> 5 then
    raise exception 'FAIL 2b: zakres do jutra ma % wierszy', v;
  end if;
  select count(*) into v from public.get_my_month_bookings(current_date - 2, current_date);
  if v <> 0 then
    raise exception 'FAIL 2c: zakres bez zapisow ma % wierszy', v;
  end if;
  raise notice 'PASS 2: granice zakresu dat wlacznie';
end $$;

\echo '=== Jezdziec, konto bez osrodka, wlasciciel bez slotow: zero wierszy ==='

do $$
declare
  v_sub text;
  v int;
begin
  foreach v_sub in array array[
    '33333333-3333-3333-3333-333333333333',
    '77777777-7777-7777-7777-777777777777',
    '11111111-1111-1111-1111-111111111111'
  ] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_sub, 'role', 'authenticated')::text, true);
    select count(*) into v from public.get_my_month_bookings(current_date - 30, current_date + 1);
    if v <> 0 then
      raise exception 'FAIL 3: konto % dostaje % wierszy', v_sub, v;
    end if;
  end loop;
  raise notice 'PASS 3: jezdziec, konto bez osrodka i wlasciciel bez slotow nie dostaja zapisow';
end $$;

\echo '=== Instruktor innego osrodka: tylko wlasne sloty ==='

set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

do $$
declare
  v_rows text;
begin
  select string_agg(concat_ws('|', hour, rider_name), ',') into v_rows
  from public.get_my_month_bookings(current_date - 30, current_date + 1);
  if v_rows is distinct from '10|Piotr Nowak' then
    raise exception 'FAIL 4: instruktor Nad Rzeką dostaje %', v_rows;
  end if;
  raise notice 'PASS 4: instruktor innego osrodka widzi tylko zapis na swoj slot, nic z Pod Dębem';
end $$;

\echo '=== Instruktorka zdezaktywowana: zero wierszy ==='

reset role;
update public.instructors set active = false where id = current_setting('app.joanna')::bigint;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.get_my_month_bookings(current_date - 30, current_date + 1);
  if v <> 0 then
    raise exception 'FAIL 5: zdezaktywowana instruktorka dostaje % wierszy', v;
  end if;
  raise notice 'PASS 5: zdezaktywowana instruktorka nie dostaje zapisow';
end $$;

\echo '=== Anonim: brak dostepu do funkcji ==='

reset role;
set local role anon;

do $$
begin
  perform public.get_my_month_bookings(current_date, current_date);
  raise exception 'FAIL 6: anon wywolal get_my_month_bookings';
exception when insufficient_privilege then
  raise notice 'PASS 6: anon nie wywola get_my_month_bookings';
end $$;

rollback;

\echo '=== Podsumowanie miesiaca instruktora: wszystkie asercje przeszly ==='
