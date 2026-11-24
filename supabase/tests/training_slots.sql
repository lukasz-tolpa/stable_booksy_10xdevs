-- Dowod slotu treningowego i zapisu pensjonariusza na wlasnym koniu (#115, spec #112, ADR 0005,
-- GLOSSARY „Slot treningowy”, „Pensjonariusz”, „Przydzial konia”, „Limit miejsc”).
--
-- Gwarancje w bazie (migracja 20261202090000_training_slots.sql):
--   * slot ma rodzaj; istniejace sloty sa rekreacyjne; save_schedule_day zapisuje rodzaj z wpisu
--     limitow, brak rodzaju zostawia rodzaj slotu,
--   * suma limitow miejsc w godzinie liczy tylko sloty rekreacyjne (SB007); treningowe jej nie zuzywaja,
--   * zmiana rodzaju slotu z aktywnymi zapisami: SB048 (DETAIL hour, bookings),
--   * zapis: pensjonariusz nie na slot rekreacyjny (SB049), nie-pensjonariusz nie na treningowy (SB050),
--     jezdziec nie wybiera konia przy slocie rekreacyjnym (42501),
--   * kon przy slocie treningowym: jedyny przydzielony od razu, przy kilku wybor (bez wyboru SB052),
--     cudzy / kon osrodka / bez pobytu w dniu jazdy SB051, zaden kon w dniu jazdy SB053,
--   * przydzial (wlasciciel, instruktor slotu): przy treningowym tylko konie tego samego pensjonariusza
--     z pobytem (SB051), przy rekreacyjnym tylko konie pracujace dnia (23503 bookings_assigned_horse_fkey);
--     konie do wyboru instruktora przy treningowym - konie pensjonariusza.
--   * zapis na slot treningowy zawsze ma konia: zdjecie konia przez wlasciciela albo instruktora - SB063
--     (#112, migracja 20261207090000); funkcje wyzwalaczy koni pensjonatowych bez prawa wykonania.
--
-- Dzien scenariusza: 15. dzien miesiaca po nastepnym - pobyty „przyjazd dzien po jezdzie” zostaja
-- w tym samym miesiacu. Persony z seeda: wlasciciel Pod Dębem (1111...), Joanna Wrona (9999...,
-- instruktorka z kontem), Anna (3333..., jezdziec rekreacyjny), Piotr (4444...), Katarzyna Zając
-- (1212..., pensjonariuszka, Hrabia w pobycie od 90 dni).
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/training_slots.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Sloty treningowe: setup (postgres) ==='

begin;

do $$
declare
  v_debem bigint;
  v_day date := ((date_trunc('month', current_date) + interval '2 months')::date + 14);
  v_baron bigint;
  v_cudzy bigint;
begin
  select id into v_debem from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  if v_debem is null or not exists (select 1 from public.horses where stable_id = v_debem and name = 'Hrabia') then
    raise exception 'Brak danych seeda (Hrabia) - uruchom npx supabase db reset';
  end if;

  if exists (select 1 from public.schedule_slots where kind <> 'recreation'
             and schedule_day_id in (select id from public.schedule_days where day = current_date + 1)) then
    raise exception 'FAIL 0: jutrzejsze sloty seeda nie sa rekreacyjne';
  end if;
  raise notice 'PASS 0: sloty dnia seeda sa rekreacyjne';

  -- Baron: kon Katarzyny, ktory wyjechal dzis - jego pobyt nie obejmuje dnia scenariusza.
  insert into public.horses (stable_id, name, kind) values (v_debem, 'Baron', 'boarding') returning id into v_baron;
  insert into public.horse_owners (horse_id, stable_id, rider_id) values (v_baron, v_debem, '12121212-1212-1212-1212-121212121212');
  insert into public.horse_stays (horse_id, stable_id, arrival_day, departure_day, departure_set_by)
  values (v_baron, v_debem, current_date - 60, current_date, 'stable');

  -- Cudzy: kon Piotra, przyjezdza dzien po jezdzie - Piotr jest pensjonariuszem w tym miesiacu,
  -- ale zaden jego kon nie stoi w osrodku w dniu jazdy.
  insert into public.horses (stable_id, name, kind) values (v_debem, 'Cudzy', 'boarding') returning id into v_cudzy;
  insert into public.horse_owners (horse_id, stable_id, rider_id) values (v_cudzy, v_debem, '44444444-4444-4444-4444-444444444444');
  insert into public.horse_stays (horse_id, stable_id, arrival_day) values (v_cudzy, v_debem, v_day + 1);

  perform set_config('app.debem', v_debem::text, true);
  perform set_config('app.day', v_day::text, true);
  perform set_config('app.joanna', (select id::text from public.instructors where stable_id = v_debem and name = 'Joanna Wrona'), true);
  perform set_config('app.karol', (select id::text from public.instructors where stable_id = v_debem and name = 'Karol Jasny'), true);
  perform set_config('app.bella', (select id::text from public.horses where stable_id = v_debem and name = 'Bella'), true);
  perform set_config('app.kasztan', (select id::text from public.horses where stable_id = v_debem and name = 'Kasztan'), true);
  perform set_config('app.hrabia', (select id::text from public.horses where stable_id = v_debem and name = 'Hrabia'), true);
  perform set_config('app.baron', v_baron::text, true);
  perform set_config('app.cudzy', v_cudzy::text, true);
end $$;

\echo '=== Wlasciciel uklada dzien ze slotami treningowymi ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_day date := current_setting('app.day')::date;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v_horses bigint[] := array[current_setting('app.bella')::bigint, current_setting('app.kasztan')::bigint];
  v_day_id bigint;
  v_detail text;
  v_kinds text;
begin
  -- 1. Suma limitow: 2 konie; Karol 2 rekreacyjne + Joanna 2 treningowe o 10 - przechodzi.
  v_day_id := public.save_schedule_day(v_day, 10, 12, v_horses, array[v_joanna, v_karol], jsonb_build_array(
    jsonb_build_object('instructor_id', v_karol, 'hour', 10, 'seats', 2, 'kind', 'recreation'),
    jsonb_build_object('instructor_id', v_karol, 'hour', 11, 'seats', 2),
    jsonb_build_object('instructor_id', v_joanna, 'hour', 10, 'seats', 2, 'kind', 'training'),
    jsonb_build_object('instructor_id', v_joanna, 'hour', 11, 'seats', 1, 'kind', 'training')
  ));
  select string_agg(i.name || '@' || s.hour || '=' || s.kind, ',' order by i.name, s.hour) into v_kinds
  from public.schedule_slots s join public.instructors i on i.id = s.instructor_id
  where s.schedule_day_id = v_day_id;
  if v_kinds is distinct from 'Joanna Wrona@10=training,Joanna Wrona@11=training,Karol Jasny@10=recreation,Karol Jasny@11=recreation' then
    raise exception 'FAIL 1: rodzaje slotow %', v_kinds;
  end if;
  raise notice 'PASS 1: sloty treningowe nie zuzywaja sumy limitow; nowy slot bez rodzaju - rekreacyjny';

  -- 2. Ta sama suma ze slotem rekreacyjnym Joanny - odmowa SB007 z suma samych rekreacyjnych.
  begin
    perform public.save_schedule_day(v_day, 10, 12, v_horses, array[v_joanna, v_karol], jsonb_build_array(
      jsonb_build_object('instructor_id', v_karol, 'hour', 10, 'seats', 2),
      jsonb_build_object('instructor_id', v_joanna, 'hour', 10, 'seats', 1, 'kind', 'recreation'),
      jsonb_build_object('instructor_id', v_joanna, 'hour', 11, 'seats', 3)
    ));
    raise exception 'FAIL 2: suma limitow slotow rekreacyjnych ponad konie przeszla';
  exception when sqlstate 'SB007' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail::jsonb <> '{"hour": 10, "seats": 3, "horses": 2}'::jsonb then
      raise exception 'FAIL 2: DETAIL %', v_detail;
    end if;
    raise notice 'PASS 2: SB007 liczy tylko sloty rekreacyjne (Joanna o 11: 3 miejsca treningowe bez odmowy)';
  end;

  -- 3. Zapis bez rodzaju zostawia rodzaj slotu.
  perform public.save_schedule_day(v_day, 10, 12, v_horses, array[v_joanna, v_karol], jsonb_build_array(
    jsonb_build_object('instructor_id', v_karol, 'hour', 10, 'seats', 2),
    jsonb_build_object('instructor_id', v_karol, 'hour', 11, 'seats', 2),
    jsonb_build_object('instructor_id', v_joanna, 'hour', 10, 'seats', 2),
    jsonb_build_object('instructor_id', v_joanna, 'hour', 11, 'seats', 1)
  ));
  if (select count(*) from public.schedule_slots where schedule_day_id = v_day_id and kind = 'training') <> 2 then
    raise exception 'FAIL 3: zapis bez rodzaju zmienil rodzaj slotow';
  end if;

  -- 3b. Nieznany rodzaj - 22023.
  begin
    perform public.save_schedule_day(v_day, 10, 12, v_horses, array[v_joanna, v_karol], jsonb_build_array(
      jsonb_build_object('instructor_id', v_joanna, 'hour', 10, 'seats', 1, 'kind', 'dressage')));
    raise exception 'FAIL 3b: nieznany rodzaj slotu przeszedl';
  exception when sqlstate '22023' then
    raise notice 'PASS 3: brak rodzaju zostawia rodzaj slotu, nieznany rodzaj - 22023';
  end;

  perform set_config('app.day_id', v_day_id::text, true);
end $$;

\echo '=== Zapis: pensjonariuszka z jednym koniem w dniu jazdy ==='

set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

do $$
declare
  v_day_id bigint := current_setting('app.day_id')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v_horse bigint;
  v_id bigint;
begin
  -- 4. Pensjonariuszka na slot rekreacyjny - odmowa.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (v_day_id, v_karol, 10, '12121212-1212-1212-1212-121212121212');
    raise exception 'FAIL 4: pensjonariuszka zapisala sie na slot rekreacyjny';
  exception when sqlstate 'SB049' then
    raise notice 'PASS 4: pensjonariusz na slot rekreacyjny odmawiany (SB049)';
  end;

  -- 5. Jedyny kon w dniu jazdy (Hrabia; Baron wyjechal) - przydzielony od razu.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day_id, v_joanna, 11, '12121212-1212-1212-1212-121212121212')
  returning id, horse_id into v_id, v_horse;
  if v_horse is distinct from current_setting('app.hrabia')::bigint then
    raise exception 'FAIL 5: przy jedynym koniu przydzielono %', v_horse;
  end if;
  raise notice 'PASS 5: jedyny kon pensjonariuszki przydzielony od razu';
  perform set_config('app.kasia_11', v_id::text, true);
end $$;

reset role;

do $$
declare
  v_hrabina bigint;
begin
  insert into public.horses (stable_id, name, kind)
  values (current_setting('app.debem')::bigint, 'Hrabina', 'boarding') returning id into v_hrabina;
  insert into public.horse_owners (horse_id, stable_id, rider_id)
  values (v_hrabina, current_setting('app.debem')::bigint, '12121212-1212-1212-1212-121212121212');
  insert into public.horse_stays (horse_id, stable_id, arrival_day)
  values (v_hrabina, current_setting('app.debem')::bigint, current_date - 10);
  perform set_config('app.hrabina', v_hrabina::text, true);
end $$;

\echo '=== Zapis: pensjonariuszka z dwoma konmi w dniu jazdy ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

do $$
declare
  v_day_id bigint := current_setting('app.day_id')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_horse bigint;
  v_id bigint;
  r record;
begin
  -- 6. Dwa konie (Hrabia, Hrabina) bez wyboru - odmowa.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (v_day_id, v_joanna, 10, '12121212-1212-1212-1212-121212121212');
    raise exception 'FAIL 6: zapis bez wyboru konia przy dwoch koniach przeszedl';
  exception when sqlstate 'SB052' then
    raise notice 'PASS 6: przy kilku koniach trzeba wybrac (SB052)';
  end;

  -- 7. Kon cudzy, kon osrodka, kon bez pobytu w dniu jazdy - odmowa.
  for r in
    select * from (values
      ('cudzy kon pensjonatowy', current_setting('app.cudzy')::bigint),
      ('kon osrodka', current_setting('app.bella')::bigint),
      ('kon, ktory wyjechal', current_setting('app.baron')::bigint)
    ) as t(what, horse)
  loop
    begin
      insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, horse_id)
      values (v_day_id, v_joanna, 10, '12121212-1212-1212-1212-121212121212', r.horse);
      raise exception 'FAIL 7: zapis na slot treningowy z koniem: % przeszedl', r.what;
    exception when sqlstate 'SB051' then
      raise notice 'PASS 7: % odmawiany (SB051)', r.what;
    end;
  end loop;

  -- 8. Wybrany wlasny kon z pobytem.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, horse_id)
  values (v_day_id, v_joanna, 10, '12121212-1212-1212-1212-121212121212', current_setting('app.hrabina')::bigint)
  returning id, horse_id into v_id, v_horse;
  if v_horse is distinct from current_setting('app.hrabina')::bigint then
    raise exception 'FAIL 8: kon zapisu %', v_horse;
  end if;
  raise notice 'PASS 8: pensjonariuszka zapisala sie na wybranym koniu';
  perform set_config('app.kasia_10', v_id::text, true);
end $$;

\echo '=== Zapis: jezdziec rekreacyjny i pensjonariusz bez konia w dniu jazdy ==='

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v_day_id bigint := current_setting('app.day_id')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v_id bigint;
begin
  -- 9. Jezdziec rekreacyjny na slot treningowy - odmowa.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (v_day_id, v_joanna, 10, '33333333-3333-3333-3333-333333333333');
    raise exception 'FAIL 9: jezdziec rekreacyjny zapisal sie na slot treningowy';
  exception when sqlstate 'SB050' then
    raise notice 'PASS 9: nie-pensjonariusz na slot treningowy odmawiany (SB050)';
  end;

  -- 10. Jezdziec nie wybiera konia przy slocie rekreacyjnym.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, horse_id)
    values (v_day_id, v_karol, 11, '33333333-3333-3333-3333-333333333333', current_setting('app.bella')::bigint);
    raise exception 'FAIL 10: jezdziec wybral konia przy slocie rekreacyjnym';
  exception when insufficient_privilege then
    raise notice 'PASS 10: konia jazdy rekreacyjnej nie wybiera jezdziec (42501)';
  end;

  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day_id, v_karol, 10, '33333333-3333-3333-3333-333333333333')
  returning id into v_id;
  perform set_config('app.anna_10', v_id::text, true);
  raise notice 'PASS 10b: jezdziec rekreacyjny zapisal sie na slot rekreacyjny jak dotad';
end $$;

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

do $$
begin
  -- 11. Piotr jest pensjonariuszem w miesiacu jazdy, ale jego kon przyjezdza dzien pozniej.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day_id')::bigint, current_setting('app.joanna')::bigint, 10, '44444444-4444-4444-4444-444444444444');
  raise exception 'FAIL 11: zapis pensjonariusza bez konia w dniu jazdy przeszedl';
exception when sqlstate 'SB053' then
  raise notice 'PASS 11: zaden kon pensjonariusza nie stoi w osrodku w dniu jazdy (SB053)';
end $$;

\echo '=== Przydzial konia przez wlasciciela ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Zapisy jezdzcow czekaja na przyjecie (#124); konia przydziela sie zapisowi aktywnemu.
do $$
begin
  perform public.accept_booking(current_setting(k)::bigint)
  from unnest(array['app.kasia_10', 'app.kasia_11', 'app.anna_10']) k;
end $$;

do $$
declare
  v_kasia bigint := current_setting('app.kasia_10')::bigint;
  v_anna bigint := current_setting('app.anna_10')::bigint;
  v_constraint text;
  v_horse bigint;
  r record;
begin
  -- 12. Slot treningowy: tylko konie tej samej pensjonariuszki z pobytem w dniu jazdy.
  for r in
    select * from (values
      ('kon osrodka', current_setting('app.bella')::bigint),
      ('cudzy kon pensjonatowy', current_setting('app.cudzy')::bigint),
      ('kon, ktory wyjechal', current_setting('app.baron')::bigint)
    ) as t(what, horse)
  loop
    begin
      update public.bookings set horse_id = r.horse where id = v_kasia;
      raise exception 'FAIL 12: wlasciciel przydzielil na slot treningowy: %', r.what;
    exception when sqlstate 'SB051' then
      raise notice 'PASS 12: przydzial na slot treningowy: % odmawiany (SB051)', r.what;
    end;
  end loop;

  update public.bookings set horse_id = current_setting('app.hrabina')::bigint where id = v_kasia;
  select horse_id into v_horse from public.bookings where id = v_kasia;
  if v_horse is distinct from current_setting('app.hrabina')::bigint then
    raise exception 'FAIL 12b: kon po przydziale %', v_horse;
  end if;
  raise notice 'PASS 12b: wlasciciel zmienia kon na innego konia tej samej pensjonariuszki';

  -- 12c (#112). Zapis na slot treningowy zawsze ma konia pensjonariusza - "bez konia" odmawiane.
  begin
    update public.bookings set horse_id = null where id = v_kasia;
    raise exception 'FAIL 12c: wlasciciel zdjal konia z zapisu na slot treningowy';
  exception when sqlstate 'SB063' then
    raise notice 'PASS 12c: wlasciciel nie zostawia zapisu na slot treningowy bez konia (SB063)';
  end;

  -- 13. Slot rekreacyjny: tylko konie pracujace dnia.
  begin
    update public.bookings set horse_id = current_setting('app.hrabia')::bigint where id = v_anna;
    raise exception 'FAIL 13: kon pensjonatowy przydzielony do jazdy rekreacyjnej';
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'bookings_assigned_horse_fkey' then
      raise exception 'FAIL 13: 23503 na % zamiast bookings_assigned_horse_fkey', v_constraint;
    end if;
    raise notice 'PASS 13: przy slocie rekreacyjnym tylko kon pracujacy dnia (23503)';
  end;
  update public.bookings set horse_id = current_setting('app.bella')::bigint where id = v_anna;
end $$;

\echo '=== Przydzial konia przez instruktorke slotu ==='

set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_kasia bigint := current_setting('app.kasia_10')::bigint;
  v_names text;
  v_horse bigint;
begin
  -- 14. Konie do wyboru przy slocie treningowym - tylko konie pensjonariuszki z pobytem w dniu jazdy.
  select string_agg(horse_name, ',' order by horse_name) into v_names
  from public.get_my_slot_horse_options(current_setting('app.day')::date)
  where booking_id = v_kasia;
  if v_names is distinct from 'Hrabia,Hrabina' then
    raise exception 'FAIL 14: konie do wyboru przy slocie treningowym: %', v_names;
  end if;
  raise notice 'PASS 14: instruktorka wybiera wsrod koni pensjonariuszki z pobytem';

  begin
    perform public.assign_my_slot_horse(v_kasia, current_setting('app.kasztan')::bigint);
    raise exception 'FAIL 15: instruktorka przydzielila kon osrodka na slot treningowy';
  exception when sqlstate 'SB051' then
    null;
  end;
  perform public.assign_my_slot_horse(v_kasia, current_setting('app.hrabina')::bigint);
  select horse_id into v_horse from public.bookings where id = v_kasia;
  if v_horse is distinct from current_setting('app.hrabina')::bigint then
    raise exception 'FAIL 15: kon po przydziale instruktorki %', v_horse;
  end if;
  raise notice 'PASS 15: instruktorka przydziela tylko konia tej samej pensjonariuszki (SB051)';

  -- 15b (#112). Instruktorka tez nie zostawia zapisu na slot treningowy bez konia.
  begin
    perform public.assign_my_slot_horse(v_kasia, null);
    raise exception 'FAIL 15b: instruktorka zdjela konia z zapisu na slot treningowy';
  exception when sqlstate 'SB063' then
    raise notice 'PASS 15b: instruktorka nie zostawia zapisu na slot treningowy bez konia (SB063)';
  end;
end $$;

\echo '=== Zmiana rodzaju slotu z zapisami ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_day date := current_setting('app.day')::date;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v_horses bigint[] := array[current_setting('app.bella')::bigint, current_setting('app.kasztan')::bigint];
  v_detail text;
begin
  -- 16. Ponowny zapis dnia z zapisami na koniach pensjonatowych - bez SB004 (to nie konie pracujace).
  perform public.save_schedule_day(v_day, 10, 12, v_horses, array[v_joanna, v_karol], jsonb_build_array(
    jsonb_build_object('instructor_id', v_karol, 'hour', 10, 'seats', 2),
    jsonb_build_object('instructor_id', v_karol, 'hour', 11, 'seats', 2),
    jsonb_build_object('instructor_id', v_joanna, 'hour', 10, 'seats', 2),
    jsonb_build_object('instructor_id', v_joanna, 'hour', 11, 'seats', 1)
  ));
  raise notice 'PASS 16: dzien z zapisami treningowymi zapisuje sie bez zmian';

  -- 17. Slot treningowy z zapisem na rekreacyjny - odmowa z godzina i liczba zapisow.
  begin
    perform public.save_schedule_day(v_day, 10, 12, v_horses, array[v_joanna, v_karol], jsonb_build_array(
      jsonb_build_object('instructor_id', v_karol, 'hour', 10, 'seats', 2),
      jsonb_build_object('instructor_id', v_joanna, 'hour', 10, 'seats', 2),
      jsonb_build_object('instructor_id', v_joanna, 'hour', 11, 'seats', 1, 'kind', 'recreation')
    ));
    raise exception 'FAIL 17: zmiana rodzaju slotu z zapisem przeszla';
  exception when sqlstate 'SB048' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail::jsonb <> '{"hour": 11, "bookings": 1}'::jsonb then
      raise exception 'FAIL 17: DETAIL %', v_detail;
    end if;
    raise notice 'PASS 17: zmiana rodzaju slotu z zapisami odmawiana (SB048)';
  end;

  -- 18. Slot rekreacyjny z zapisem Anny na treningowy - tez odmowa.
  begin
    perform public.save_schedule_day(v_day, 10, 12, v_horses, array[v_joanna, v_karol], jsonb_build_array(
      jsonb_build_object('instructor_id', v_karol, 'hour', 10, 'seats', 2, 'kind', 'training'),
      jsonb_build_object('instructor_id', v_joanna, 'hour', 10, 'seats', 2),
      jsonb_build_object('instructor_id', v_joanna, 'hour', 11, 'seats', 1)
    ));
    raise exception 'FAIL 18: zmiana rodzaju slotu rekreacyjnego z zapisem przeszla';
  exception when sqlstate 'SB048' then
    raise notice 'PASS 18: slot rekreacyjny z zapisami nie zmienia sie w treningowy (SB048)';
  end;
end $$;

\echo '=== Funkcje wyzwalaczy bez prawa wykonania (#112) ==='

reset role;

do $$
declare
  r record;
begin
  -- 19. Kazda public.enforce_* koni pensjonatowych i slotow jest tylko dla wyzwalacza.
  for r in
    select * from (values
      ('public.enforce_working_horse_is_stable_horse()'),
      ('public.enforce_horse_kind_immutable()'),
      ('public.enforce_booking_slot_rules()')
    ) as t(fn)
  loop
    if has_function_privilege('authenticated', r.fn, 'execute') or has_function_privilege('anon', r.fn, 'execute') then
      raise exception 'FAIL 19: % wykonywalna dla anon/authenticated', r.fn;
    end if;
  end loop;
  raise notice 'PASS 19: funkcje wyzwalaczy bez prawa wykonania dla anon i authenticated';
end $$;

\echo '=== private.stay_covers_day jak stayCoversDay (src/lib/boarding/month.test.ts) ==='

do $$
begin
  -- 20 (#112). Te same przypadki co w month.test.ts („stayCoversDay — pobyt obejmuje dzień jazdy”).
  if not (
        not private.stay_covers_day('2026-11-10', '2026-11-12', '2026-11-09')
    and private.stay_covers_day('2026-11-10', '2026-11-12', '2026-11-10')
    and private.stay_covers_day('2026-11-10', '2026-11-12', '2026-11-12')
    and not private.stay_covers_day('2026-11-10', '2026-11-12', '2026-11-13')
    and private.stay_covers_day('2026-11-10', null, '2027-05-01')
  ) then
    raise exception 'FAIL 20: private.stay_covers_day rozjezdza sie z month.test.ts';
  end if;
  raise notice 'PASS 20: private.stay_covers_day jak stayCoversDay';
end $$;

rollback;
