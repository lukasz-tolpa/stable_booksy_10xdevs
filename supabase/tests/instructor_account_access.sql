-- Dowod kont instruktorow (#72, ADR-0004, GLOSSARY "Instruktor", "Wlasciciel").
--
-- Gwarancje w bazie, nie w aplikacji:
--   * instruktor z kontem, ktory nie jest wlascicielem, czyta wylacznie swoje sloty, aktywne
--     zapisy na nie i nazwe swojego osrodka; slotow innych instruktorow, zapisow na nie,
--     koni, przydzialow koni do dnia ani niczego z innego osrodka nie czyta,
--   * imie i nazwisko jezdzca oraz przydzielonego konia czyta przez
--     public.get_my_slot_bookings - ograniczona do jego slotow, bez poluzowania RLS na profiles;
--     imie jezdzca widzi wylacznie instruktor slotu i wlasciciel,
--   * instruktor niczego w osrodku nie zmienia (odmowa albo 0 wierszy) i nie zapisuje sie na jazde,
--   * dezaktywacja instruktora przez wlasciciela odcina mu odczyt (kontekst private.current_instructor_id()
--     pusty), a ponowna aktywacja go przywraca (#73),
--   * jezdziec i wlasciciel czytaja jak dotad.
--
-- Persony: Joanna Wrona (99999999..., konto z seeda, Stadnina Pod Dębem), tymczasowe konto
-- Karola Jasnego (88888888..., tylko w transakcji), wlasciciele 1111.../2222..., jezdzcy
-- 3333.../4444.... Kazda persona we wlasnej transakcji z ROLLBACK.
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/instructor_account_access.sql

\set ON_ERROR_STOP on

-- Wspolne przygotowanie (jako postgres, wolane na poczatku kazdej transakcji): Karol pracuje
-- jutro z 1 miejscem o 15 i ma tam zapis Piotra; Piotr ma tez odwolany zapis u Joanny o 13;
-- zapis Anny u Joanny o 11 dostaje Belle. Suma limitow o 15: Joanna 1 + Karol 1 = 2 konie.
-- Funkcja w pg_temp zyje tylko w tej sesji psql.
create function pg_temp.instructor_setup() returns void
language plpgsql
as $$
declare
  v_stable bigint;
  v_stable_b bigint;
  v_day bigint;
  v_joanna bigint;
  v_karol bigint;
  v_bella bigint;
  v_kasztan bigint;
begin
  select id into v_stable from public.stables where name = 'Stadnina Pod Dębem';
  select id into v_stable_b from public.stables where name = 'Stajnia Nad Rzeką';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors where stable_id = v_stable and name = 'Joanna Wrona';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  select id into v_bella from public.horses where stable_id = v_stable and name = 'Bella';
  select id into v_kasztan from public.horses where stable_id = v_stable and name = 'Kasztan';
  if v_day is null or not exists (
    select 1 from public.instructors where id = v_joanna and account_id = '99999999-9999-9999-9999-999999999999'
  ) then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select v_day, v_karol, h, case when h = 15 then 1 else 0 end from generate_series(10, 15) h;

  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day, v_karol, 15, '44444444-4444-4444-4444-444444444444');
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, cancelled_at, cancelled_by)
  values (v_day, v_joanna, 13, '44444444-4444-4444-4444-444444444444', 'cancelled', now(), 'rider');
  update public.bookings set horse_id = v_bella
   where schedule_day_id = v_day and instructor_id = v_joanna and hour = 11 and status = 'active';

  perform set_config('app.stable_a', v_stable::text, true);
  perform set_config('app.stable_b', v_stable_b::text, true);
  perform set_config('app.day_a', v_day::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.karol', v_karol::text, true);
  perform set_config('app.bella', v_bella::text, true);
  perform set_config('app.kasztan', v_kasztan::text, true);
end;
$$;

\echo '=== Instruktor z kontem: czyta swoje sloty i aktywne zapisy na nie ==='

begin;
do $$ begin perform pg_temp.instructor_setup(); end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v int;
  v_foreign int;
  v_name text;
  v_horse text;
  v_hour int;
  v_day date;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_stable_a bigint := current_setting('app.stable_a')::bigint;
  v_stable_b bigint := current_setting('app.stable_b')::bigint;
begin
  select count(*), count(*) filter (where instructor_id <> v_joanna) into v, v_foreign from public.schedule_slots;
  if v <> 6 or v_foreign <> 0 then
    raise exception 'FAIL: instruktorka widzi % slotow (% cudzych) zamiast swoich 6', v, v_foreign;
  end if;
  raise notice 'PASS: instruktorka czyta wylacznie swoje sloty (6 godzin jutra)';

  select count(*) into v from public.bookings;
  select count(*) into v_foreign from public.bookings where status = 'active' and instructor_id = v_joanna and hour = 11;
  if v <> 1 or v_foreign <> 1 then
    raise exception 'FAIL: instruktorka widzi % zapisow zamiast 1 aktywnego na swoj slot', v;
  end if;
  raise notice 'PASS: instruktorka czyta aktywny zapis na swoj slot; zapisu u innego instruktora ani odwolanego nie';

  select count(*) into v from public.get_my_slot_bookings(current_date);
  select rider_name, horse_name, hour, day into v_name, v_horse, v_hour, v_day
  from public.get_my_slot_bookings(current_date);
  if v <> 1 or v_name is distinct from 'Anna Kowalska' or v_horse is distinct from 'Bella'
     or v_hour <> 11 or v_day <> current_date + 1 then
    raise exception 'FAIL: get_my_slot_bookings zwraca % wierszy (%, %, % %)', v, v_name, v_horse, v_day, v_hour;
  end if;
  raise notice 'PASS: imie i nazwisko jezdzca oraz kon przez get_my_slot_bookings (Anna Kowalska, Bella, 11:00)';

  select count(*) into v from public.get_my_slot_bookings(current_date + 2);
  if v <> 0 then
    raise exception 'FAIL: get_my_slot_bookings od pojutrza zwraca % wierszy', v;
  end if;
  raise notice 'PASS: get_my_slot_bookings pomija dni przed podana data';

  select count(*) into v from public.profiles where id <> '99999999-9999-9999-9999-999999999999';
  if v <> 0 then
    raise exception 'FAIL: instruktorka czyta % cudzych profili - RLS na profiles poluzowany', v;
  end if;
  raise notice 'PASS: profile jezdzcow niedostepne wprost (tylko przez funkcje)';

  select count(*) into v from public.stables;
  select count(*) into v_foreign from public.stables where id = v_stable_a and name = 'Stadnina Pod Dębem';
  if v <> 1 or v_foreign <> 1 then
    raise exception 'FAIL: instruktorka widzi % osrodkow zamiast swojego', v;
  end if;
  raise notice 'PASS: instruktorka czyta nazwe swojego osrodka i zadnego innego';

  select count(*) into v from public.horses;
  if v <> 0 then
    raise exception 'FAIL: instruktorka czyta % koni', v;
  end if;
  select count(*) into v from public.schedule_day_horses;
  if v <> 0 then
    raise exception 'FAIL: instruktorka czyta % koni pracujacych w dniach', v;
  end if;
  raise notice 'PASS: konie i konie dnia niedostepne';

  select count(*) into v from public.instructors where id <> v_joanna;
  if v <> 0 then
    raise exception 'FAIL: instruktorka czyta % innych instruktorow', v;
  end if;
  select count(*) into v from public.instructors where id = v_joanna;
  if v <> 1 then
    raise exception 'FAIL: instruktorka nie czyta wlasnego wiersza instruktora';
  end if;
  raise notice 'PASS: z instruktorow czyta wylacznie siebie';

  select count(*) into v from public.schedule_days;
  select count(*) into v_foreign from public.schedule_days where stable_id <> v_stable_a;
  if v <> 1 or v_foreign <> 0 then
    raise exception 'FAIL: instruktorka czyta % dni grafiku (% cudzych)', v, v_foreign;
  end if;
  select count(*) into v from public.schedule_day_instructors where instructor_id <> v_joanna;
  if v <> 0 then
    raise exception 'FAIL: instruktorka czyta % cudzych przypisan instruktorow do dnia', v;
  end if;
  raise notice 'PASS: z grafiku czyta tylko dni ze swoimi slotami';

  select count(*), count(*) filter (where instructor_id <> v_joanna)
    into v, v_foreign
  from public.get_slot_occupancy(v_stable_a, current_date + 1);
  if v <> 1 or v_foreign <> 0 then
    raise exception 'FAIL: zajetosc osrodka dla instruktorki: % wierszy, % cudzych', v, v_foreign;
  end if;
  select count(*) into v from public.get_slot_occupancy(v_stable_b, current_date + 1);
  if v <> 0 then
    raise exception 'FAIL: instruktorka widzi zajetosc cudzego osrodka (% wierszy)', v;
  end if;
  raise notice 'PASS: zajetosc slotow tylko dla wlasnych slotow';
end $$;

rollback;

\echo '=== Instruktor z kontem: niczego w osrodku nie zmienia ==='

begin;
do $$ begin perform pg_temp.instructor_setup(); end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v int;
  v_status text;
  v_horse text;
  v_stable_a bigint := current_setting('app.stable_a')::bigint;
  v_day_a bigint := current_setting('app.day_a')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v_bella bigint := current_setting('app.bella')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
begin
  begin
    perform public.save_schedule_day(current_date + 1, 10, 16, array[v_bella, v_kasztan], array[v_joanna], '[]'::jsonb);
    raise exception 'FAIL: instruktorka zapisala grafik dnia';
  exception when insufficient_privilege then
    raise notice 'PASS: grafik dnia przez save_schedule_day odrzucony (42501)';
  end;

  begin
    update public.schedule_slots set seats = 2 where instructor_id = v_joanna;
    raise exception 'FAIL: instruktorka zmienila swoj limit miejsc';
  exception when insufficient_privilege then
    raise notice 'PASS: bezposrednia zmiana limitu miejsc odrzucona (42501)';
  end;

  begin
    insert into public.horses (stable_id, name) values (v_stable_a, 'Podstawiony');
    raise exception 'FAIL: instruktorka dodala konia';
  exception when insufficient_privilege then
    raise notice 'PASS: dodanie konia odrzucone (42501)';
  end;

  update public.horses set active = false where id = v_bella;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: instruktorka zmienila % koni', v;
  end if;
  delete from public.horses where id = v_bella;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: instruktorka usunela % koni', v;
  end if;
  raise notice 'PASS: zmiana i usuniecie konia dotknely 0 wierszy';

  begin
    insert into public.instructors (stable_id, name) values (v_stable_a, 'Podstawiony');
    raise exception 'FAIL: instruktorka dodala instruktora';
  exception when insufficient_privilege then
    raise notice 'PASS: dodanie instruktora odrzucone (42501)';
  end;

  update public.instructors set active = false where id in (v_karol, v_joanna);
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: instruktorka zmienila stan % instruktorow', v;
  end if;
  raise notice 'PASS: (de)aktywacja instruktorow - takze siebie - dotknela 0 wierszy';

  update public.bookings set horse_id = v_kasztan where instructor_id = v_joanna and hour = 11;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: instruktorka zmienila przydzial konia w % zapisach', v;
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable'
   where instructor_id = v_joanna and hour = 11;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: instruktorka odwolala % zapisow', v;
  end if;

  select horse_name into v_horse from public.get_my_slot_bookings(current_date) where hour = 11;
  select status into v_status from public.bookings where instructor_id = v_joanna and hour = 11;
  if v_horse is distinct from 'Bella' or v_status is distinct from 'active' then
    raise exception 'FAIL: po probach zapis ma status % i konia %', v_status, v_horse;
  end if;
  raise notice 'PASS: przydzial konia i odwolanie zapisu dotknely 0 wierszy; zapis nietkniety';

  update public.stables set name = 'Przejeta' where id = v_stable_a;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: instruktorka zmienila dane osrodka';
  end if;
  raise notice 'PASS: zmiana danych osrodka dotknela 0 wierszy';

  -- Wolny slot (Joanna o 12), zeby jedyna odmowa byla brama roli, a nie wyzwalacz miejsc.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (v_day_a, v_joanna, 12, '99999999-9999-9999-9999-999999999999');
    raise exception 'FAIL: konto instruktora zapisalo sie na jazde';
  exception when insufficient_privilege then
    raise notice 'PASS: konto instruktora nie zapisuje sie na jazde (42501)';
  end;
end $$;

rollback;

\echo '=== Imie jezdzca widzi tylko instruktor slotu i wlasciciel ==='

begin;
do $$ begin perform pg_temp.instructor_setup(); end $$;

-- Karol dostaje konto na czas transakcji - drugi instruktor z kontem w tym samym osrodku.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888', 'authenticated',
        'authenticated', 'karol.jasny@example.com', '{"role":"instructor","full_name":"Karol Jasny"}', now(), now());
update public.instructors set account_id = '88888888-8888-8888-8888-888888888888'
 where id = current_setting('app.karol')::bigint;

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';

do $$
declare
  v int;
  v_name text;
begin
  select count(*) into v from public.get_my_slot_bookings(current_date);
  select rider_name into v_name from public.get_my_slot_bookings(current_date);
  if v <> 1 or v_name is distinct from 'Piotr Nowak' then
    raise exception 'FAIL: drugi instruktor dostaje % zapisow (%), a ma tylko Piotra', v, v_name;
  end if;

  select count(*) into v from public.profiles where full_name = 'Anna Kowalska';
  if v <> 0 then
    raise exception 'FAIL: drugi instruktor osrodka czyta profil jezdzczyni z cudzego slotu';
  end if;

  select count(*) into v from public.bookings where rider_id = '33333333-3333-3333-3333-333333333333';
  if v <> 0 then
    raise exception 'FAIL: drugi instruktor czyta zapis na slot Joanny';
  end if;
  raise notice 'PASS: drugi instruktor osrodka nie widzi jezdzcow ze slotow Joanny';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.profiles where full_name in ('Anna Kowalska', 'Piotr Nowak');
  if v <> 2 then
    raise exception 'FAIL: wlasciciel widzi % z 2 jezdzcow swojego osrodka', v;
  end if;

  select count(*) into v from public.bookings where status = 'active';
  if v <> 2 then
    raise exception 'FAIL: wlasciciel widzi % z 2 aktywnych zapisow osrodka', v;
  end if;

  select count(*) into v from public.schedule_slots where instructor_id = current_setting('app.karol')::bigint;
  if v <> 6 then
    raise exception 'FAIL: wlasciciel widzi % z 6 slotow Karola', v;
  end if;
  raise notice 'PASS: wlasciciel widzi jezdzcow, zapisy i sloty wszystkich swoich instruktorow';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.profiles where full_name = 'Anna Kowalska';
  if v <> 0 then
    raise exception 'FAIL: wlascicielka cudzego osrodka czyta profil Anny';
  end if;
  select count(*) into v from public.get_my_slot_bookings(current_date);
  if v <> 0 then
    raise exception 'FAIL: wlascicielka bez slotow dostaje % zapisow z get_my_slot_bookings', v;
  end if;
  raise notice 'PASS: wlascicielka cudzego osrodka nie widzi jezdzcow Pod Dębem';
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.get_my_slot_bookings(current_date);
  if v <> 0 then
    raise exception 'FAIL: jezdziec dostaje % zapisow z get_my_slot_bookings', v;
  end if;

  -- Katalog bez zmian: jezdziec czyta sloty, konie i dni wszystkich osrodkow.
  select count(*) into v from public.schedule_slots;
  if v <> 6 + 6 + 5 then
    raise exception 'FAIL: jezdziec widzi % slotow zamiast wszystkich 17', v;
  end if;
  select count(*) into v from public.horses;
  if v <> 5 then
    raise exception 'FAIL: jezdziec widzi % z 5 koni', v;
  end if;
  select count(*) into v from public.stables;
  if v < 2 then
    raise exception 'FAIL: jezdziec widzi % osrodkow', v;
  end if;
  raise notice 'PASS: jezdziec nie czyta przez funkcje instruktora, a katalog czyta jak dotad';
end $$;

rollback;

\echo '=== Dezaktywacja instruktora z kontem przez wlasciciela odcina mu odczyt; ponowna aktywacja go przywraca ==='

-- Ten sam UPDATE, ktory wysyla strona Instruktorzy, jako wlasciciel przez RLS - nie jako postgres.
-- Bez osobnej logiki: kontekst private.current_instructor_id()/current_stable_id() zdezaktywowanego
-- jest pusty, wiec kazda polityka i funkcja odczytu daje mu 0 wierszy (#73). Odmowe dezaktywacji
-- samego wlasciciela (SB012) dowodzi stable_owner_account.sql.

begin;
do $$ begin perform pg_temp.instructor_setup(); end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
begin
  update public.instructors set active = false
   where id = current_setting('app.joanna')::bigint and stable_id = current_setting('app.stable_a')::bigint;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL: wlasciciel nie zdezaktywowal instruktorki z kontem (% wierszy)', v;
  end if;
  raise notice 'PASS: wlasciciel dezaktywuje instruktorke z kontem';
end $$;

set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_slots int;
  v_days int;
  v_bookings int;
  v_named int;
  v_taken int;
  v_stables int;
  v_rows int;
  v_active boolean;
begin
  select count(*) into v_slots from public.schedule_slots;
  select count(*) into v_days from public.schedule_days;
  select count(*) into v_bookings from public.bookings;
  select count(*) into v_named from public.get_my_slot_bookings(current_date);
  select count(*) into v_taken
  from public.get_slot_occupancy(current_setting('app.stable_a')::bigint, current_date + 1);
  select count(*) into v_stables from public.stables;
  if v_slots + v_days + v_bookings + v_named + v_taken + v_stables <> 0 then
    raise exception 'FAIL: zdezaktywowana instruktorka czyta sloty %, dni %, zapisy %, jezdzcow %, oblozenie %, osrodki %',
      v_slots, v_days, v_bookings, v_named, v_taken, v_stables;
  end if;
  raise notice 'PASS: zdezaktywowana instruktorka nie czyta slotow, dni, zapisow, jezdzcow, oblozenia ani osrodka';

  -- Swoj wiersz instruktora widzi dalej: po nim aplikacja rozpoznaje nieaktywne konto.
  select count(*), bool_and(active) into v_rows, v_active
  from public.instructors where account_id = '99999999-9999-9999-9999-999999999999';
  if v_rows <> 1 or v_active is distinct from false then
    raise exception 'FAIL: zdezaktywowana instruktorka widzi % swoich wierszy (active=%)', v_rows, v_active;
  end if;
  raise notice 'PASS: zdezaktywowana instruktorka widzi swoj wiersz z active=false (ekran nieaktywnego konta)';
end $$;

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
begin
  update public.instructors set active = true
   where id = current_setting('app.joanna')::bigint and stable_id = current_setting('app.stable_a')::bigint;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL: wlasciciel nie aktywowal ponownie instruktorki (% wierszy)', v;
  end if;
  raise notice 'PASS: wlasciciel aktywuje instruktorke ponownie';
end $$;

set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_slots int;
  v_bookings int;
  v_name text;
  v_named int;
  v_stables int;
  v_joanna bigint := current_setting('app.joanna')::bigint;
begin
  select count(*) into v_slots from public.schedule_slots where instructor_id = v_joanna;
  select count(*) into v_bookings from public.bookings
   where status = 'active' and instructor_id = v_joanna and hour = 11;
  select count(*), min(rider_name) into v_named, v_name from public.get_my_slot_bookings(current_date);
  select count(*) into v_stables from public.stables where id = current_setting('app.stable_a')::bigint;
  if v_slots <> 6 or v_bookings <> 1 or v_named <> 1 or v_name is distinct from 'Anna Kowalska' or v_stables <> 1 then
    raise exception 'FAIL: po ponownej aktywacji sloty %, zapisy %, jezdzcy % (%), osrodek %',
      v_slots, v_bookings, v_named, v_name, v_stables;
  end if;
  raise notice 'PASS: ponowna aktywacja przywraca odczyt slotow, zapisow, jezdzcow i osrodka bez nowego zaproszenia';
end $$;

rollback;
