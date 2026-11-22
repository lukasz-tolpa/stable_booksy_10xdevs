-- Dowod placow osrodka i placu przy slocie (#113, spec #112, GLOSSARY "Plac", "Slot").
--
-- Gwarancje w bazie (migracja 20261201090000_places.sql):
--   * kazdy osrodek ma plac, a kazdy slot - plac swojego osrodka; nowy osrodek dostaje plac od razu;
--     seed: Pod Dębem ma "Hala" i "Duży plac", Nad Rzeką jeden "Plac",
--   * wlasciciel zaklada, zmienia nazwe, dezaktywuje i aktywuje plac; nazwa unikalna w osrodku bez
--     wzgledu na wielkosc liter i spacje (23505); placu sie nie usuwa (42501); ostatni aktywny plac
--     zostaje aktywny (SB033),
--   * izolacja: inny osrodek placow nie widzi i nie zmienia; instruktor czyta place swojego osrodka,
--     ale ich nie zmienia; jezdziec czyta place (dzien osrodka), ale ich nie zaklada,
--   * save_schedule_day: plac w kazdym wpisie limitow; brak placu = plac slotu albo pierwszy aktywny;
--     plac spoza osrodka SB030; nieaktywny plac w dniu, ktory go nie uzywa, SB031 - w dniu, ktory juz
--     go uzywa, zostaje; zmiana placu slotu z aktywnymi zapisami SB032 (DETAIL hour, bookings).
--
-- Wymaga swiezego seeda (`npx supabase db reset` tego samego dnia).
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -q < supabase/tests/places.sql
--
-- Kazda persona we wlasnej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Place: stan po migracji i seedzie (postgres) ==='

begin;

do $$
declare
  v_stable bigint;
  v_new_stable bigint;
  v int;
begin
  select count(*) into v from public.stables s
  where not exists (select 1 from public.places p where p.stable_id = s.id and p.active);
  if v <> 0 then
    raise exception 'FAIL: % osrodkow bez aktywnego placu', v;
  end if;

  select count(*) into v
  from public.schedule_slots sl
  join public.schedule_days sd on sd.id = sl.schedule_day_id
  join public.places p on p.id = sl.place_id
  where p.stable_id <> sd.stable_id;
  if v <> 0 then
    raise exception 'FAIL: % slotow na placu cudzego osrodka', v;
  end if;
  raise notice 'PASS: kazdy osrodek ma aktywny plac, kazdy slot jest na placu swojego osrodka';

  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  if (select array_agg(name order by id) from public.places where stable_id = v_stable)
     is distinct from array['Hala', 'Duży plac'] then
    raise exception 'FAIL: place Pod Dębem w seedzie to % zamiast {Hala, Duży plac} - seed nieaktualny?',
      (select array_agg(name order by id) from public.places where stable_id = v_stable);
  end if;
  raise notice 'PASS: osrodek demo ma dwa place';

  -- Nowy osrodek (takze INSERT postgresa) dostaje plac od razu.
  insert into public.stables (owner_id, name, city)
  values ('33333333-3333-3333-3333-333333333333', 'Osrodek Testowy Placow', 'Testowo')
  returning id into v_new_stable;
  if (select array_agg(name) from public.places where stable_id = v_new_stable) is distinct from array['Plac'] then
    raise exception 'FAIL: nowy osrodek nie dostal placu "Plac"';
  end if;
  raise notice 'PASS: nowy osrodek ma plac "Plac"';
end $$;

rollback;

\echo '=== Place: wlasciciel Pod Dębem zarzadza katalogiem ==='

begin;

do $$
begin
  perform set_config('app.stable', (select id::text from public.stables where owner_id = '11111111-1111-1111-1111-111111111111'), true);
  perform set_config('app.stable_b', (select id::text from public.stables where owner_id = '22222222-2222-2222-2222-222222222222'), true);
  perform set_config('app.place_b', (
    select p.id::text from public.places p join public.stables s on s.id = p.stable_id
    where s.owner_id = '22222222-2222-2222-2222-222222222222' limit 1), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_stable bigint := current_setting('app.stable')::bigint;
  v_stable_b bigint := current_setting('app.stable_b')::bigint;
  v_place_b bigint := current_setting('app.place_b')::bigint;
  v_lonz bigint;
  v_hala bigint;
  v_duzy bigint;
  v int;
  v_name text;
  v_active boolean;
begin
  select id into v_hala from public.places where stable_id = v_stable and name = 'Hala';
  select id into v_duzy from public.places where stable_id = v_stable and name = 'Duży plac';

  -- 1. Dodanie placu.
  insert into public.places (stable_id, name) values (v_stable, 'Lonżownik') returning id into v_lonz;
  if v_lonz is null then
    raise exception 'FAIL 1: wlasciciel nie dodal placu';
  end if;
  raise notice 'PASS 1: wlasciciel dodal plac';

  -- 2. Nazwa zajeta w osrodku, bez wzgledu na wielkosc liter i spacje.
  begin
    insert into public.places (stable_id, name) values (v_stable, '  hala ');
    raise exception 'FAIL 2: druga "Hala" w osrodku przeszla';
  exception when unique_violation then
    raise notice 'PASS 2: powtorzona nazwa odrzucona (23505)';
  end;

  -- 3. Zmiana nazwy; na nazwe zajeta - odmowa.
  update public.places set name = 'Lonżownik mały' where id = v_lonz;
  get diagnostics v = row_count;
  select name into v_name from public.places where id = v_lonz;
  if v <> 1 or v_name <> 'Lonżownik mały' then
    raise exception 'FAIL 3: zmiana nazwy dotknela % wierszy, nazwa %', v, v_name;
  end if;
  begin
    update public.places set name = 'Duży Plac' where id = v_lonz;
    raise exception 'FAIL 3b: zmiana nazwy na zajeta przeszla';
  exception when unique_violation then
    raise notice 'PASS 3: zmiana nazwy dziala, na zajeta - odmowa (23505)';
  end;

  -- 4. Dezaktywacja i ponowna aktywacja.
  update public.places set active = false where id = v_lonz;
  select active into v_active from public.places where id = v_lonz;
  if v_active then
    raise exception 'FAIL 4: plac nie zostal dezaktywowany';
  end if;
  update public.places set active = true where id = v_lonz;
  select active into v_active from public.places where id = v_lonz;
  if not v_active then
    raise exception 'FAIL 4b: plac nie zostal aktywowany ponownie';
  end if;
  raise notice 'PASS 4: dezaktywacja i ponowna aktywacja';

  -- 5. Ostatni aktywny plac zostaje aktywny.
  update public.places set active = false where id in (v_lonz, v_duzy);
  begin
    update public.places set active = false where id = v_hala;
    raise exception 'FAIL 5: dezaktywacja ostatniego aktywnego placu przeszla';
  exception when sqlstate 'SB033' then
    raise notice 'PASS 5: ostatni aktywny plac zostaje aktywny (SB033)';
  end;
  update public.places set active = true where id in (v_lonz, v_duzy);

  -- 6. Placu sie nie usuwa.
  begin
    delete from public.places where id = v_lonz;
    raise exception 'FAIL 6: usuniecie placu przeszlo';
  exception when insufficient_privilege then
    raise notice 'PASS 6: placu sie nie usuwa (42501)';
  end;

  -- 7. Izolacja: place osrodka B niewidoczne, niezmienialne, bez dopisywania.
  select count(*) into v from public.places where stable_id = v_stable_b;
  if v <> 0 then
    raise exception 'FAIL 7: wlasciciel A widzi % placow osrodka B', v;
  end if;
  update public.places set name = 'Przejete' where id = v_place_b;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 7b: wlasciciel A zmienil plac osrodka B';
  end if;
  begin
    insert into public.places (stable_id, name) values (v_stable_b, 'Cudzy');
    raise exception 'FAIL 7c: wlasciciel A dopisal plac osrodkowi B';
  exception when insufficient_privilege then
    raise notice 'PASS 7: place osrodka B niewidoczne i nietykalne dla wlasciciela A';
  end;
end $$;

rollback;

\echo '=== Place: plac w zapisie grafiku dnia (wlasciciel Pod Dębem) ==='

begin;

do $$
declare
  v_stable bigint;
  v_day bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  if v_day is null then
    raise exception 'Seed nieaktualny - uruchom npx supabase db reset';
  end if;
  perform set_config('app.stable', v_stable::text, true);
  perform set_config('app.day', v_day::text, true);
  perform set_config('app.joanna', (select id::text from public.instructors where stable_id = v_stable and name = 'Joanna Wrona'), true);
  perform set_config('app.karol', (select id::text from public.instructors where stable_id = v_stable and name = 'Karol Jasny'), true);
  perform set_config('app.horses', (
    select array_agg(horse_id)::text from public.schedule_day_horses where schedule_day_id = v_day), true);
  perform set_config('app.hala', (select id::text from public.places where stable_id = v_stable and name = 'Hala'), true);
  perform set_config('app.duzy', (select id::text from public.places where stable_id = v_stable and name = 'Duży plac'), true);
  perform set_config('app.place_b', (
    select p.id::text from public.places p join public.stables s on s.id = p.stable_id
    where s.owner_id = '22222222-2222-2222-2222-222222222222' limit 1), true);
  -- Trzeci plac, od razu nieaktywny.
  insert into public.places (stable_id, name, active) values (v_stable, 'Lonżownik', false);
  perform set_config('app.lonz', (select id::text from public.places where stable_id = v_stable and name = 'Lonżownik'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_day bigint := current_setting('app.day')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v_horses bigint[] := current_setting('app.horses')::bigint[];
  v_hala bigint := current_setting('app.hala')::bigint;
  v_duzy bigint := current_setting('app.duzy')::bigint;
  v_lonz bigint := current_setting('app.lonz')::bigint;
  v_place_b bigint := current_setting('app.place_b')::bigint;
  v_tomorrow date := current_date + 1;
  v_far date := current_date + 9;
  v_seats jsonb;
  v_detail text;
  v int;
  v_place bigint;
begin
  -- Seed: Joanna 1 miejsce 10-15 na Hali, Anna u Joanny o 11. Karol dochodzi na Duzy plac
  -- z 1 miejscem o 13 (suma 2 = konie dnia); Joanna o 10 przechodzi na Duzy plac.
  v_seats := (
    select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h, 'seats', 1,
                                        'place_id', case when h = 10 then v_duzy else v_hala end))
    from generate_series(10, 15) h
  ) || jsonb_build_array(jsonb_build_object('instructor_id', v_karol, 'hour', 13, 'seats', 1, 'place_id', v_duzy));

  perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, array[v_joanna, v_karol], v_seats);

  select place_id into v_place from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_joanna and hour = 10;
  if v_place <> v_duzy then
    raise exception 'FAIL 1: slot Joanny o 10 na placu % zamiast Duzego placu', v_place;
  end if;
  select count(*) into v from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_karol and place_id = v_duzy;
  if v <> 1 then
    raise exception 'FAIL 1b: Karol ma % slotow na Duzym placu zamiast 1 (godzina bez wpisu dostaje pierwszy aktywny plac)', v;
  end if;
  select count(*) into v from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_karol and place_id = v_hala;
  if v <> 5 then
    raise exception 'FAIL 1c: Karol ma % slotow na Hali zamiast 5', v;
  end if;
  raise notice 'PASS 1: plac zapisany przy kazdym slocie; godzina bez placu - pierwszy aktywny plac';

  -- 2. Wpis bez place_id zostawia slot na jego placu.
  v_seats := (
    select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h, 'seats', 1))
    from generate_series(10, 15) h
  );
  perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, array[v_joanna, v_karol], v_seats);
  select place_id into v_place from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_joanna and hour = 10;
  if v_place <> v_duzy then
    raise exception 'FAIL 2: wpis bez placu przeniosl slot na plac %', v_place;
  end if;
  raise notice 'PASS 2: wpis bez placu zostawia slot na jego placu';

  -- 3. Plac spoza osrodka.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, array[v_joanna],
      (select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h, 'seats', 1,
                                           'place_id', case when h = 15 then v_place_b else v_hala end))
       from generate_series(10, 15) h));
    raise exception 'FAIL 3: plac osrodka B przeszedl';
  exception when sqlstate 'SB030' then
    raise notice 'PASS 3: plac spoza osrodka odrzucony (SB030)';
  end;

  -- 4. Nieaktywny plac w dniu, ktory go nie uzywa.
  begin
    perform public.save_schedule_day(v_far, 10, 12, v_horses, array[v_joanna],
      jsonb_build_array(jsonb_build_object('instructor_id', v_joanna, 'hour', 10, 'seats', 1, 'place_id', v_lonz)));
    raise exception 'FAIL 4: nieaktywny plac trafil do nowego dnia';
  exception when sqlstate 'SB031' then
    raise notice 'PASS 4: nieaktywny plac odrzucony w nowym dniu (SB031)';
  end;
  if exists (select 1 from public.schedule_days where day = v_far and stable_id = current_setting('app.stable')::bigint) then
    raise exception 'FAIL 4b: po odmowie dzien zostal zapisany';
  end if;

  -- 5. Plac zdezaktywowany po ulozeniu dnia zostaje w tym dniu (ponowny zapis przechodzi).
  update public.places set active = false where id = v_duzy;
  perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, array[v_joanna, v_karol],
    (select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h, 'seats', 1,
                                         'place_id', case when h = 10 then v_duzy else v_hala end))
     from generate_series(10, 15) h));
  select place_id into v_place from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_joanna and hour = 10;
  if v_place <> v_duzy then
    raise exception 'FAIL 5: slot zszedl z placu zdezaktywowanego po ulozeniu dnia';
  end if;
  raise notice 'PASS 5: nieaktywny plac zostaje w dniu juz ulozonym';
  update public.places set active = true where id = v_duzy;

  -- 6. Zmiana placu slotu z aktywnym zapisem (Anna u Joanny o 11).
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, array[v_joanna, v_karol],
      (select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h, 'seats', 1,
                                           'place_id', case when h in (10, 11) then v_duzy else v_hala end))
       from generate_series(10, 15) h));
    raise exception 'FAIL 6: zmiana placu slotu z zapisem przeszla';
  exception when sqlstate 'SB032' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail is null or v_detail::jsonb <> '{"hour": 11, "bookings": 1}'::jsonb then
      raise exception 'FAIL 6: DETAIL SB032 to % zamiast {"hour": 11, "bookings": 1}', v_detail;
    end if;
    raise notice 'PASS 6: zmiana placu slotu z aktywnym zapisem odrzucona (SB032), DETAIL: %', v_detail;
  end;
  select place_id into v_place from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_joanna and hour = 11;
  if v_place <> v_hala then
    raise exception 'FAIL 6b: po odmowie slot z zapisem na placu %', v_place;
  end if;

  -- 7. Ten sam plac przy slocie z zapisem nie jest zmiana - limit mozna podniesc.
  perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, array[v_joanna],
    (select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h, 'seats', case when h = 11 then 2 else 1 end,
                                         'place_id', case when h = 10 then v_duzy else v_hala end))
     from generate_series(10, 15) h));
  raise notice 'PASS 7: zapis bez zmiany placu slotu z zapisem przechodzi';
end $$;

rollback;

\echo '=== Place: kto czyta katalog ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v int;
begin
  -- Jezdziec widzi place przy slotach kazdego osrodka (dzien osrodka).
  select count(distinct stable_id) into v from public.places;
  if v < 2 then
    raise exception 'FAIL: jezdziec widzi place % osrodkow zamiast wszystkich', v;
  end if;
  begin
    insert into public.places (stable_id, name)
    values ((select id from public.stables where owner_id = '11111111-1111-1111-1111-111111111111'), 'Plac jezdzca');
    raise exception 'FAIL: jezdziec dodal plac';
  exception when insufficient_privilege then
    raise notice 'PASS: jezdziec czyta place, ale ich nie dodaje (42501)';
  end;
end $$;

rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_own int;
  v_foreign int;
  v int;
begin
  -- Instruktor bez praw wlasciciela: place swojego osrodka (plac przy jego slotach), nie cudze.
  select count(*) filter (where p.stable_id = i.stable_id),
         count(*) filter (where p.stable_id <> i.stable_id)
    into v_own, v_foreign
  from public.places p
  cross join (select stable_id from public.instructors where name = 'Joanna Wrona') i;
  if v_own < 2 or v_foreign <> 0 then
    raise exception 'FAIL: instruktor widzi % placow swojego osrodka i % cudzych', v_own, v_foreign;
  end if;
  update public.places set name = 'Zmienione przez instruktora';
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: instruktor zmienil % placow', v;
  end if;
  raise notice 'PASS: instruktor czyta place swojego osrodka, nie cudze, i ich nie zmienia';
end $$;

rollback;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v
  from public.places p
  where p.stable_id = (select id from public.stables where owner_id = '11111111-1111-1111-1111-111111111111');
  if v <> 0 then
    raise exception 'FAIL: wlasciciel B widzi % placow osrodka A', v;
  end if;
  raise notice 'PASS: wlasciciel B nie widzi placow osrodka A';
end $$;

rollback;
