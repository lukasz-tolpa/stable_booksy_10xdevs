-- Dowod zajetosci placow (#116, spec #112, GLOSSARY „Zajetosc placow”, „Pensjonariusz”).
--
-- Gwarancje w bazie (migracja 20261203090000_place_occupancy.sql):
--   * public.get_place_occupancy(stable, day) zwraca dla slotow dnia (plac x godzina x instruktor) liczbe
--     aktywnych zapisow, instruktora i rodzaj slotu - wylacznie liczby, bez jezdzcow i koni,
--   * slot bez miejsc i bez zapisow nie jest zajetoscia placu (pusta godzina zostaje pusta),
--   * dostep: wlasciciel osrodka i pensjonariusz osrodka, ktorego kon ma pobyt obejmujacy dzien;
--     jezdziec rekreacyjny, instruktor bez praw wlasciciela, inny osrodek, pensjonariusz innego osrodka
--     i pensjonariusz w dniu poza pobytem - odmowa SB054; anon - brak uprawnienia (42501).
--
-- Dzien scenariusza: 15. dzien miesiaca po nastepnym (pobyt Katarzyny Zając trwa od 90 dni bez wyjazdu).
-- Persony z seeda: wlasciciel Pod Dębem (1111...), wlascicielka Nad Rzeką (2222...), Joanna Wrona
-- (9999..., instruktorka z kontem), Anna (3333...), Piotr (4444...), Katarzyna Zając (1212...).
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/place_occupancy.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Zajetosc placow: setup (postgres) ==='

begin;

do $$
declare
  v_debem bigint;
  v_day date := ((date_trunc('month', current_date) + interval '2 months')::date + 14);
begin
  select id into v_debem from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  if v_debem is null or not exists (select 1 from public.horses where stable_id = v_debem and name = 'Hrabia') then
    raise exception 'Brak danych seeda (Hrabia) - uruchom npx supabase db reset';
  end if;

  perform set_config('app.debem', v_debem::text, true);
  perform set_config('app.rzeka', (select id::text from public.stables where owner_id = '22222222-2222-2222-2222-222222222222'), true);
  perform set_config('app.day', v_day::text, true);
  perform set_config('app.joanna', (select id::text from public.instructors where stable_id = v_debem and name = 'Joanna Wrona'), true);
  perform set_config('app.karol', (select id::text from public.instructors where stable_id = v_debem and name = 'Karol Jasny'), true);
  perform set_config('app.marek', (select id::text from public.instructors where stable_id = v_debem and name = 'Marek Dębowski'), true);
  perform set_config('app.hala', (select id::text from public.places where stable_id = v_debem and name = 'Hala'), true);
  perform set_config('app.duzy', (select id::text from public.places where stable_id = v_debem and name = 'Duży plac'), true);
  perform set_config('app.bella', (select id::text from public.horses where stable_id = v_debem and name = 'Bella'), true);
  perform set_config('app.kasztan', (select id::text from public.horses where stable_id = v_debem and name = 'Kasztan'), true);
end $$;

\echo '=== Wlasciciel uklada dzien: Hala - Joanna (rekreacyjny), Duzy plac - Karol (rekreacyjny) i Marek (treningowy) ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
begin
  perform set_config('app.day_id', public.save_schedule_day(
    current_setting('app.day')::date, 10, 12,
    array[current_setting('app.bella')::bigint, current_setting('app.kasztan')::bigint],
    array[current_setting('app.joanna')::bigint, current_setting('app.karol')::bigint, current_setting('app.marek')::bigint],
    jsonb_build_array(
      jsonb_build_object('instructor_id', current_setting('app.joanna')::bigint, 'hour', 10, 'seats', 1,
                         'place_id', current_setting('app.hala')::bigint),
      jsonb_build_object('instructor_id', current_setting('app.karol')::bigint, 'hour', 10, 'seats', 1,
                         'place_id', current_setting('app.duzy')::bigint),
      jsonb_build_object('instructor_id', current_setting('app.marek')::bigint, 'hour', 10, 'seats', 2,
                         'place_id', current_setting('app.duzy')::bigint, 'kind', 'training'),
      jsonb_build_object('instructor_id', current_setting('app.karol')::bigint, 'hour', 11, 'seats', 1,
                         'place_id', current_setting('app.duzy')::bigint)
    )
  )::text, true);
end $$;

reset role;

\echo '=== Zapisy (postgres): Anna u Joanny, Piotr u Karola, Katarzyna u Marka; Anna o 11 odwolana ==='

do $$
declare
  v_day_id bigint := current_setting('app.day_id')::bigint;
  v_cancelled bigint;
begin
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status) values
    (v_day_id, current_setting('app.joanna')::bigint, 10, '33333333-3333-3333-3333-333333333333', 'active'),
    (v_day_id, current_setting('app.karol')::bigint, 10, '44444444-4444-4444-4444-444444444444', 'active'),
    (v_day_id, current_setting('app.marek')::bigint, 10, '12121212-1212-1212-1212-121212121212', 'active');

  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day_id, current_setting('app.karol')::bigint, 11, '33333333-3333-3333-3333-333333333333', 'active')
  returning id into v_cancelled;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable'
  where id = v_cancelled;
end $$;

\echo '=== Wynik: same liczby ==='

do $$
declare
  v_result text;
begin
  select pg_get_function_result(p.oid) into v_result
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_place_occupancy';
  if v_result is distinct from
     'TABLE(place_id bigint, hour smallint, instructor_id bigint, instructor_name text, kind text, taken integer)' then
    raise exception 'FAIL 1: wynik funkcji %', v_result;
  end if;
  raise notice 'PASS 1: wynik to plac, godzina, instruktor, rodzaj slotu i liczba - bez jezdzcow i koni';
end $$;


\echo '=== Wlasciciel osrodka ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_text text := (
    select coalesce(string_agg(
      p.name || '@' || o.hour || ' ' || o.instructor_name || ' ' || o.kind || '=' || o.taken,
      ', ' order by p.name, o.hour, o.instructor_name), '(brak)')
    from public.get_place_occupancy(current_setting('app.debem')::bigint, current_setting('app.day')::date) o
    join public.places p on p.id = o.place_id
  );
begin
  -- Odwolany zapis o 11 sie nie liczy; slot Karola o 11 ma miejsce, wiec zostaje z zerem. Sloty bez miejsc
  -- (Joanna i Marek o 11) nie sa zajetoscia placu.
  if v_text is distinct from
     'Duży plac@10 Karol Jasny recreation=1, Duży plac@10 Marek Dębowski training=1, Duży plac@11 Karol Jasny recreation=0, Hala@10 Joanna Wrona recreation=1' then
    raise exception 'FAIL 2: zajetosc wlasciciela %', v_text;
  end if;
  raise notice 'PASS 2: wlasciciel widzi zajetosc placow swojego osrodka (aktywne zapisy, instruktor, rodzaj)';
end $$;

\echo '=== Pensjonariuszka osrodka (pobyt obejmuje dzien) ==='

set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

do $$
declare
  v_text text := (
    select coalesce(string_agg(
      p.name || '@' || o.hour || ' ' || o.instructor_name || ' ' || o.kind || '=' || o.taken,
      ', ' order by p.name, o.hour, o.instructor_name), '(brak)')
    from public.get_place_occupancy(current_setting('app.debem')::bigint, current_setting('app.day')::date) o
    join public.places p on p.id = o.place_id
  );
begin
  if v_text is distinct from
     'Duży plac@10 Karol Jasny recreation=1, Duży plac@10 Marek Dębowski training=1, Duży plac@11 Karol Jasny recreation=0, Hala@10 Joanna Wrona recreation=1' then
    raise exception 'FAIL 3: zajetosc pensjonariuszki %', v_text;
  end if;
  raise notice 'PASS 3: pensjonariuszka widzi te sama zajetosc';

  -- Dzien przed przyjazdem konia (pobyt od 90 dni) - poza pobytem.
  begin
    perform public.get_place_occupancy(current_setting('app.debem')::bigint, current_date - 100);
    raise exception 'FAIL 4: pensjonariuszka dostala zajetosc dnia sprzed pobytu';
  exception when sqlstate 'SB054' then
    raise notice 'PASS 4: dzien poza pobytem konia - odmowa (SB054)';
  end;

  -- Inny osrodek - jej kon tam nie stoi.
  begin
    perform public.get_place_occupancy(current_setting('app.rzeka')::bigint, current_setting('app.day')::date);
    raise exception 'FAIL 5: pensjonariuszka dostala zajetosc innego osrodka';
  exception when sqlstate 'SB054' then
    raise notice 'PASS 5: pensjonariusz innego osrodka - odmowa (SB054)';
  end;
end $$;

\echo '=== Odmowy: jezdziec rekreacyjny, instruktorka bez praw wlasciciela, inny osrodek ==='

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('33333333-3333-3333-3333-333333333333', 'jezdziec rekreacyjny (Anna)'),
      ('44444444-4444-4444-4444-444444444444', 'jezdziec rekreacyjny (Piotr)'),
      ('99999999-9999-9999-9999-999999999999', 'instruktorka bez praw wlasciciela (Joanna)'),
      ('22222222-2222-2222-2222-222222222222', 'wlascicielka innego osrodka')
    ) as t(sub, who)
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.sub, 'role', 'authenticated')::text, true);
    begin
      perform public.get_place_occupancy(current_setting('app.debem')::bigint, current_setting('app.day')::date);
      raise exception 'FAIL 6: % dostal zajetosc placow', r.who;
    exception when sqlstate 'SB054' then
      raise notice 'PASS 6: % - odmowa (SB054)', r.who;
    end;
  end loop;
end $$;

\echo '=== anon ==='

reset role;
set local role anon;

do $$
begin
  perform public.get_place_occupancy(current_setting('app.debem')::bigint, current_setting('app.day')::date);
  raise exception 'FAIL 7: anon wywolal get_place_occupancy';
exception when insufficient_privilege then
  raise notice 'PASS 7: anon - brak uprawnienia (42501)';
end $$;

rollback;
