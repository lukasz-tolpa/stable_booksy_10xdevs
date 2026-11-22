-- Dowod korzystania z uprawnienia do ukladania grafiku (#79, spec #77, ADR-0004,
-- GLOSSARY "Uprawnienie do układania grafiku", "Instruktor").
--
-- Gwarancje w bazie, nie w aplikacji:
--   * instruktor z uprawnieniem zapisuje grafik dnia swojego osrodka (public.save_schedule_day)
--     na tych samych zasadach co wlasciciel - takze regula sumy limitow (SB007) i kon spoza
--     osrodka (SB003); osrodek z sesji (private.schedule_stable_id()), nie z argumentu,
--   * bez uprawnienia, po jego odebraniu przez wlasciciela, po dezaktywacji i po ponownej
--     aktywacji - odmowa 42501,
--   * instruktor z uprawnieniem czyta to, czego potrzebuje formularz grafiku: dni grafiku z
--     godzinami, konie dnia, instruktorow dnia i ich sloty, konie i instruktorow osrodka, zajetosc
--     wszystkich slotow (public.get_slot_occupancy) - i nic z innego osrodka,
--   * nadal nie czyta zapisow na cudze sloty ani profili jezdzcow (statystyki), nie odwoluje
--     zapisow, nie zmienia koni ani instruktorow, nie widzi zaproszen ani kont instruktorow.
--
-- Persony: Joanna Wrona (99999999..., konto z seeda, Stadnina Pod Dębem) z uprawnieniem nadanym
-- jako postgres w transakcji, wlasciciel 1111..., jezdzcy 3333.../4444.... Kazdy scenariusz we
-- wlasnej transakcji z ROLLBACK.
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/schedule_arranging.sql

\set ON_ERROR_STOP on

-- Wspolne przygotowanie (jako postgres): Karol pracuje jutro z 1 miejscem o 15 i ma tam zapis
-- Piotra (suma o 15: Joanna 1 + Karol 1 = 2 konie). p_grant nadaje Joannie uprawnienie.
create function pg_temp.arranging_setup(p_grant boolean) returns void
language plpgsql
as $$
declare
  v_stable bigint;
  v_stable_b bigint;
  v_day bigint;
  v_joanna bigint;
  v_karol bigint;
begin
  select id into v_stable from public.stables where name = 'Stadnina Pod Dębem';
  select id into v_stable_b from public.stables where name = 'Stajnia Nad Rzeką';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors where stable_id = v_stable and name = 'Joanna Wrona';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  if v_day is null or not exists (
    select 1 from public.instructors
    where id = v_joanna and account_id = '99999999-9999-9999-9999-999999999999' and not arranges_schedule
  ) then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select v_day, v_karol, h, case when h = 15 then 1 else 0 end from generate_series(10, 15) h;
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day, v_karol, 15, '44444444-4444-4444-4444-444444444444');

  if p_grant then
    update public.instructors set arranges_schedule = true where id = v_joanna;
  end if;

  perform set_config('app.stable_a', v_stable::text, true);
  perform set_config('app.stable_b', v_stable_b::text, true);
  perform set_config('app.day_a', v_day::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.karol', v_karol::text, true);
  perform set_config('app.bella', (select id::text from public.horses where stable_id = v_stable and name = 'Bella'), true);
  perform set_config('app.kasztan', (select id::text from public.horses where stable_id = v_stable and name = 'Kasztan'), true);
  perform set_config('app.grom', (select id::text from public.horses where stable_id = v_stable_b and name = 'Grom'), true);
end;
$$;

-- Zapis jutra Pod Dębem: 10-16, Bella + Kasztan, Joanna i Karol; Joanna 1 miejsce w kazdej
-- godzinie poza p_hour (tam p_seats), Karol 1 miejsce o 15. Zwraca SQLSTATE odmowy albo NULL.
create function pg_temp.save_tomorrow(p_hour int, p_seats int, p_horses bigint[] default null) returns text
language plpgsql
as $$
declare
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v_state text;
begin
  perform public.save_schedule_day(
    current_date + 1, 10, 16,
    coalesce(p_horses, array[current_setting('app.bella')::bigint, current_setting('app.kasztan')::bigint]),
    array[v_joanna, v_karol],
    (select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h,
                                         'seats', case when h = p_hour then p_seats else 1 end))
     from generate_series(10, 15) h)
    || jsonb_build_array(jsonb_build_object('instructor_id', v_karol, 'hour', 15, 'seats', 1))
  );
  return null;
exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
  return v_state;
end;
$$;

\echo '=== Instruktor z uprawnieniem: zapisuje grafik dnia ==='

begin;
do $$ begin perform pg_temp.arranging_setup(true); end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_state text;
  v_seats int;
begin
  -- Joanna o 10 dostaje 1 miejsce wiecej: suma o 10 = 2 = liczba koni.
  v_state := pg_temp.save_tomorrow(10, 2);
  if v_state is not null then
    raise exception 'FAIL: instruktorka z uprawnieniem nie zapisala grafiku (odmowa %)', v_state;
  end if;
  select seats into v_seats from public.schedule_slots
   where schedule_day_id = current_setting('app.day_a')::bigint
     and instructor_id = current_setting('app.joanna')::bigint and hour = 10;
  if v_seats is distinct from 2 then
    raise exception 'FAIL: po zapisie limit Joanny o 10 wynosi % zamiast 2', v_seats;
  end if;
  raise notice 'PASS: instruktorka z uprawnieniem zapisuje grafik dnia swojego osrodka';

  v_state := pg_temp.save_tomorrow(15, 2);
  if v_state is distinct from 'SB007' then
    raise exception 'FAIL: suma limitow ponad liczbe koni - % zamiast SB007', coalesce(v_state, 'zapis');
  end if;
  raise notice 'PASS: ta sama regula sumy limitow co u wlasciciela (SB007)';

  v_state := pg_temp.save_tomorrow(10, 1, array[current_setting('app.grom')::bigint]);
  if v_state is distinct from 'SB003' then
    raise exception 'FAIL: kon innego osrodka - % zamiast SB003', coalesce(v_state, 'zapis');
  end if;
  raise notice 'PASS: kon innego osrodka odrzucony (SB003) - osrodek z sesji';
end $$;

rollback;

\echo '=== Instruktor z uprawnieniem: czyta to, czego potrzebuje formularz grafiku ==='

begin;
do $$ begin perform pg_temp.arranging_setup(true); end $$;

-- Stajnia Nad Rzeką ma w seedzie swoj jutrzejszy dzien z Gromem - jest czego nie widziec.
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v int;
  v_foreign int;
  v_stable_a bigint := current_setting('app.stable_a')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
begin
  select count(*), count(*) filter (where stable_id <> v_stable_a) into v, v_foreign from public.schedule_days;
  if v < 1 or v_foreign <> 0 then
    raise exception 'FAIL: dni grafiku - % (z innego osrodka %)', v, v_foreign;
  end if;
  select count(*) into v from public.schedule_days where stable_id = v_stable_a and day = current_date + 1
    and open_hour = 10 and close_hour = 16;
  if v <> 1 then
    raise exception 'FAIL: instruktorka nie czyta jutra swojego osrodka z godzinami';
  end if;
  raise notice 'PASS: dni grafiku swojego osrodka z godzinami, zadnego dnia innego osrodka';

  select count(*), count(*) filter (where stable_id <> v_stable_a) into v, v_foreign from public.schedule_day_horses;
  if v <> 2 or v_foreign <> 0 then
    raise exception 'FAIL: konie dnia - % (z innego osrodka %) zamiast Belli i Kasztana', v, v_foreign;
  end if;
  raise notice 'PASS: konie pracujace jutro (2), bez koni dnia innego osrodka';

  select count(*), count(*) filter (where stable_id <> v_stable_a) into v, v_foreign from public.horses;
  -- Bella, Kasztan, Iskra i kon pensjonatowy Hrabia (#114).
  if v <> 4 or v_foreign <> 0 then
    raise exception 'FAIL: konie osrodka - % (z innego osrodka %) zamiast 4', v, v_foreign;
  end if;
  raise notice 'PASS: wszystkie konie swojego osrodka (4), bez koni innego osrodka';

  select count(*), count(*) filter (where stable_id <> v_stable_a) into v, v_foreign from public.instructors;
  if v <> 3 or v_foreign <> 0 then
    raise exception 'FAIL: instruktorzy - % (z innego osrodka %) zamiast 3', v, v_foreign;
  end if;
  raise notice 'PASS: wszyscy instruktorzy swojego osrodka (3), bez instruktorow innego osrodka';

  select count(*), count(*) filter (where stable_id <> v_stable_a) into v, v_foreign from public.schedule_day_instructors;
  if v <> 2 or v_foreign <> 0 then
    raise exception 'FAIL: instruktorzy dnia - % (z innego osrodka %) zamiast Joanny i Karola', v, v_foreign;
  end if;
  select count(*), count(*) filter (where instructor_id = v_karol) into v, v_foreign from public.schedule_slots;
  if v <> 12 or v_foreign <> 6 then
    raise exception 'FAIL: sloty - % (Karola %) zamiast 12 (6)', v, v_foreign;
  end if;
  raise notice 'PASS: instruktorzy dnia i sloty wszystkich instruktorow (12), bez slotow innego osrodka';

  select taken into v from public.get_slot_occupancy(v_stable_a, current_date + 1)
   where instructor_id = v_karol and hour = 15;
  if v is distinct from 1 then
    raise exception 'FAIL: zajetosc slotu Karola o 15 - % zamiast 1', v;
  end if;
  select count(*) into v from public.get_slot_occupancy(current_setting('app.stable_b')::bigint, current_date + 1);
  if v <> 0 then
    raise exception 'FAIL: zajetosc slotow innego osrodka - % wierszy', v;
  end if;
  raise notice 'PASS: zajetosc wszystkich slotow swojego osrodka, innego osrodka - nie';
end $$;

rollback;

\echo '=== Instruktor z uprawnieniem: nie dostaje niczego poza grafikiem ==='

begin;
do $$ begin perform pg_temp.arranging_setup(true); end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v int;
  v_stable_a bigint := current_setting('app.stable_a')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
begin
  select count(*) into v from public.bookings where instructor_id = v_karol;
  if v <> 0 then
    raise exception 'FAIL: instruktorka czyta % zapisow na slot Karola', v;
  end if;
  select count(*) into v from public.profiles where id <> '99999999-9999-9999-9999-999999999999';
  if v <> 0 then
    raise exception 'FAIL: instruktorka czyta % profili jezdzcow', v;
  end if;
  raise notice 'PASS: zapisy na cudze sloty i profile jezdzcow (statystyki) niedostepne';

  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable'
   where status = 'active';
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: instruktorka odwolala % zapisow', v;
  end if;
  raise notice 'PASS: odwolanie zapisu - 0 wierszy (takze na wlasnym slocie)';

  update public.horses set active = false where stable_id = v_stable_a;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: instruktorka zmienila % koni', v;
  end if;
  begin
    insert into public.horses (stable_id, name) values (v_stable_a, 'Kon Instruktorki');
    raise exception 'FAIL: instruktorka dodala konia';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PASS: konie - zmiana 0 wierszy, dodanie 42501';

  update public.instructors set active = false where id = v_karol;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: instruktorka zmienila % instruktorow', v;
  end if;
  begin
    insert into public.instructors (stable_id, name) values (v_stable_a, 'Instruktor Instruktorki');
    raise exception 'FAIL: instruktorka dodala instruktora';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PASS: instruktorzy - zmiana 0 wierszy, dodanie 42501';

  begin
    perform public.list_instructor_invitations();
    raise exception 'FAIL: instruktorka czyta zaproszenia';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.list_instructor_accounts();
    raise exception 'FAIL: instruktorka czyta konta instruktorow';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.set_schedule_permission(v_karol, true);
    raise exception 'FAIL: instruktorka nadala uprawnienie';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PASS: zaproszenia, konta instruktorow i nadawanie uprawnien - 42501';
end $$;

rollback;

\echo '=== Bez uprawnienia, po odebraniu, po dezaktywacji i po aktywacji - odmowa 42501 ==='

begin;
do $$ begin perform pg_temp.arranging_setup(false); end $$;

set local role authenticated;

do $$
declare
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_state text;
  v int;

begin
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
  v_state := pg_temp.save_tomorrow(10, 2);
  if v_state is distinct from '42501' then
    raise exception 'FAIL: bez uprawnienia - % zamiast 42501', coalesce(v_state, 'zapis');
  end if;
  select count(*) into v from public.horses;
  if v <> 0 then
    raise exception 'FAIL: instruktorka bez uprawnienia czyta % koni', v;
  end if;
  raise notice 'PASS: instruktorka bez uprawnienia - odmowa 42501, konie osrodka niewidoczne';

  -- Wlasciciel nadaje i odbiera; instruktorka zapisuje miedzy jednym a drugim.
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  perform public.set_schedule_permission(v_joanna, true);
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
  v_state := pg_temp.save_tomorrow(10, 2);
  if v_state is not null then
    raise exception 'FAIL: po nadaniu przez wlasciciela - odmowa %', v_state;
  end if;

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  perform public.set_schedule_permission(v_joanna, false);
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
  v_state := pg_temp.save_tomorrow(10, 1);
  if v_state is distinct from '42501' then
    raise exception 'FAIL: po odebraniu - % zamiast 42501', coalesce(v_state, 'zapis');
  end if;
  raise notice 'PASS: po odebraniu uprawnienia przez wlasciciela - odmowa 42501';

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  perform public.set_schedule_permission(v_joanna, true);
  update public.instructors set active = false where id = v_joanna;
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
  v_state := pg_temp.save_tomorrow(10, 1);
  if v_state is distinct from '42501' then
    raise exception 'FAIL: po dezaktywacji - % zamiast 42501', coalesce(v_state, 'zapis');
  end if;
  raise notice 'PASS: po dezaktywacji - odmowa 42501';

  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
  update public.instructors set active = true where id = v_joanna;
  perform set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
  v_state := pg_temp.save_tomorrow(10, 1);
  if v_state is distinct from '42501' then
    raise exception 'FAIL: po ponownej aktywacji - % zamiast 42501', coalesce(v_state, 'zapis');
  end if;
  raise notice 'PASS: ponowna aktywacja nie przywraca uprawnienia - odmowa 42501';

  perform set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
  v_state := pg_temp.save_tomorrow(10, 1);
  if v_state is distinct from '42501' then
    raise exception 'FAIL: jezdziec - % zamiast 42501', coalesce(v_state, 'zapis');
  end if;
  raise notice 'PASS: jezdziec - odmowa 42501';
end $$;

rollback;
