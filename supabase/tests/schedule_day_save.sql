-- Dowod zapisu grafiku dnia przez funkcje public.save_schedule_day (#40, ADR-0002).
--
-- Gwarancje w bazie, nie w aplikacji:
--   * suma limitow miejsc w jednej godzinie nie przekracza liczby koni pracujacych tego dnia
--     (SB007, komunikat wskazuje godzine) - oceniana na STANIE KONCOWYM zapisu: dodanie konia
--     i podniesienie limitu w jednym wywolaniu przechodzi, wypisanie konia pod suma limitow nie,
--   * zapis udaje sie w calosci albo wcale (odmowa w polowie nie zostawia zmienionych godzin),
--   * nowo wskazany instruktor ma limit zero we wszystkich godzinach,
--   * nieaktywnego instruktora nie da sie dodac do dnia, w ktorym go nie bylo (SB006),
--     a zdezaktywowany po ulozeniu dnia zostaje w nim,
--   * kontrole przeniesione z aplikacji: kon spoza stadniny (SB003), wypisanie konia przydzielonego
--     do aktywnego zapisu (SB004); instruktor spoza stadniny (SB005); dzien miniony (SB008); zawezenie godzin pod
--     zapisem nadal SB002 (wyzwalacz z S-02),
--   * bezposredni zapis do tabel grafiku (dni, konie w dniu, instruktorzy w dniu, sloty) jest
--     odebrany - 42501 takze dla wlasciciela,
--   * izolacja: funkcja dziala wylacznie na stadninie wolajacego; jezdziec i niezalogowany jej
--     nie wywolaja.
--
-- Jako kto: przygotowanie danych jako postgres, wywolania jako wlasciciel "Stadniny Pod Debem"
-- (sub 1111...) przez role authenticated. Kazda persona we wlasnej transakcji z ROLLBACK.
--
-- Wymaga swiezego seeda (`npx supabase db reset` tego samego dnia - dni z seeda sa na jutro).
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/schedule_day_save.sql

\set ON_ERROR_STOP on

\echo '=== Zapis grafiku dnia: wlasciciel Pod Debem ==='

begin;

do $$
declare
  v_stable bigint;
  v_stable_b bigint;
  v_id bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_stable_b from public.stables where owner_id = '22222222-2222-2222-2222-222222222222';
  if v_stable is null or v_stable_b is null
     or not exists (select 1 from public.schedule_days where stable_id = v_stable and day = current_date + 1) then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  perform set_config('app.stable', v_stable::text, true);
  perform set_config('app.day', (select id::text from public.schedule_days where stable_id = v_stable and day = current_date + 1), true);
  perform set_config('app.bella', (select id::text from public.horses where stable_id = v_stable and name = 'Bella'), true);
  perform set_config('app.kasztan', (select id::text from public.horses where stable_id = v_stable and name = 'Kasztan'), true);
  perform set_config('app.iskra', (select id::text from public.horses where stable_id = v_stable and name = 'Iskra'), true);
  perform set_config('app.grom', (select id::text from public.horses where stable_id = v_stable_b and name = 'Grom'), true);

  insert into public.instructors (stable_id, name) values (v_stable, 'Ania Testowa') returning id into v_id;
  perform set_config('app.ania', v_id::text, true);

  -- Ania pracuje jutro (1 miejsce w kazdej godzinie), a seedowy zapis Anny przechodzi od Joanny
  -- do Ani o 11 z przydzielona Bella: przypadki ponizej wypisuja Joanne (bez zapisow - inaczej
  -- SB011) i probuja wypisac Belle (SB004) oraz zawezic dzien pod zapisem (SB002).
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (current_setting('app.day')::bigint, v_id, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select current_setting('app.day')::bigint, v_id, h, 1 from generate_series(10, 15) h;
  update public.schedule_slots set seats = 0
  where schedule_day_id = current_setting('app.day')::bigint
    and instructor_id = (select id from public.instructors where stable_id = v_stable and name = 'Joanna Wrona');
  update public.bookings
     set instructor_id = v_id, horse_id = current_setting('app.bella')::bigint
   where schedule_day_id = current_setting('app.day')::bigint and hour = 11 and status = 'active';
  insert into public.instructors (stable_id, name) values (v_stable, 'Basia Testowa') returning id into v_id;
  perform set_config('app.basia', v_id::text, true);
  insert into public.instructors (stable_id, name, active) values (v_stable, 'Ola Nieaktywna', false) returning id into v_id;
  perform set_config('app.ola', v_id::text, true);
  insert into public.instructors (stable_id, name) values (v_stable_b, 'Obcy Testowy') returning id into v_id;
  perform set_config('app.obcy', v_id::text, true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_day bigint := current_setting('app.day')::bigint;
  v_bella bigint := current_setting('app.bella')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v_iskra bigint := current_setting('app.iskra')::bigint;
  v_grom bigint := current_setting('app.grom')::bigint;
  v_ania bigint := current_setting('app.ania')::bigint;
  v_basia bigint := current_setting('app.basia')::bigint;
  v_ola bigint := current_setting('app.ola')::bigint;
  v_obcy bigint := current_setting('app.obcy')::bigint;
  v_tomorrow date := current_date + 1;
  v_ania_1 jsonb;
  v_seats jsonb;
  v_msg text;
  v int;
  v_open int;
  v_failures int := 0;
begin
  -- Ania: 1 miejsce w kazdej godzinie 10-15.
  select jsonb_agg(jsonb_build_object('instructor_id', v_ania, 'hour', h, 'seats', 1))
    into v_ania_1
  from generate_series(10, 15) h;

  -- 1. Zapis dnia z instruktorami i limitami; Basia bez limitow dostaje zero w kazdej godzinie.
  perform public.save_schedule_day(v_tomorrow, 10, 16, array[v_bella, v_kasztan], array[v_ania, v_basia], v_ania_1);
  select count(*) into v from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_ania and seats = 1;
  if v <> 6 then
    raise notice 'FAIL 1: Ania ma % slotow z limitem 1 zamiast 6', v;
    v_failures := v_failures + 1;
  end if;
  select count(*) into v from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_basia and seats = 0;
  if v <> 6 then
    raise notice 'FAIL 1b: nowo wskazana Basia ma % slotow z limitem 0 zamiast 6', v;
    v_failures := v_failures + 1;
  else
    raise notice 'PASS 1: dzien z instruktorami zapisany; nowo wskazany instruktor ma zero w kazdej godzinie';
  end if;

  -- 2. Suma limitow o 13 (Ania 1 + Basia 2) przekracza 2 konie -> SB007; DETAIL niesie godzine,
  --    sume i liczbe koni jako JSON (kontrakt z `scheduleErrorMessage`, migracja 20261116090000);
  --    to samo wywolanie zmienia godziny na 9-16 - po odmowie nic nie moze byc zmienione.
  v_seats := v_ania_1 || jsonb_build_array(jsonb_build_object('instructor_id', v_basia, 'hour', 13, 'seats', 2));
  begin
    perform public.save_schedule_day(v_tomorrow, 9, 16, array[v_bella, v_kasztan], array[v_ania, v_basia], v_seats);
    raise notice 'FAIL 2: suma limitow ponad liczbe koni przeszla';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB007' then
    get stacked diagnostics v_msg = pg_exception_detail;
    if v_msg is not null and v_msg ~ '^\s*\{' and v_msg::jsonb = '{"hour": 13, "seats": 3, "horses": 2}'::jsonb then
      raise notice 'PASS 2: suma limitow ponad liczbe koni odrzucona (SB007), DETAIL: %', v_msg;
    else
      raise notice 'FAIL 2: DETAIL SB007 to % zamiast {"hour": 13, "seats": 3, "horses": 2}', v_msg;
      v_failures := v_failures + 1;
    end if;
  end;
  select open_hour into v_open from public.schedule_days where id = v_day;
  select seats into v from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_basia and hour = 13;
  if v_open = 10 and v = 0 and not exists (select 1 from public.schedule_slots where schedule_day_id = v_day and hour = 9) then
    raise notice 'PASS 2b: po odmowie godziny i limity nietkniete (atomowosc)';
  else
    raise notice 'FAIL 2b: po odmowie open_hour=% Basia@13=%', v_open, v;
    v_failures := v_failures + 1;
  end if;

  -- 3. Stan koncowy: dodanie Iskry i podniesienie limitu w jednym wywolaniu przechodzi.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, array[v_bella, v_kasztan, v_iskra], array[v_ania, v_basia], v_seats);
    select seats into v from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_basia and hour = 13;
    if v = 2 then
      raise notice 'PASS 3: dodanie konia i podniesienie limitu w jednym zapisie przechodzi (stan koncowy)';
    else
      raise notice 'FAIL 3: Basia@13 = % zamiast 2', v;
      v_failures := v_failures + 1;
    end if;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    raise notice 'FAIL 3: zapis oceniany na krokach posrednich (%: %)', sqlstate, v_msg;
    v_failures := v_failures + 1;
  end;

  -- 4. Wypisanie Iskry: o 13 zostalyby 2 konie pod suma 3 -> SB007, Iskra zostaje.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, array[v_bella, v_kasztan], array[v_ania, v_basia], v_seats);
    raise notice 'FAIL 4: wypisanie konia ponizej sumy limitow przeszlo';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB007' then
    raise notice 'PASS 4: wypisanie konia ponizej sumy limitow odrzucone (SB007)';
  end;
  select count(*) into v from public.schedule_day_horses where schedule_day_id = v_day and horse_id = v_iskra;
  if v <> 1 then
    raise notice 'FAIL 4b: po odmowie Iskra wypisana';
    v_failures := v_failures + 1;
  end if;

  -- 5. Wypisanie konia przydzielonego do aktywnego zapisu (Bella przy zapisie Anny u Ani o 11) -> SB004.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, array[v_kasztan, v_iskra], array[v_ania], '[]'::jsonb);
    raise notice 'FAIL 5: wypisanie konia z zapisem przeszlo';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB004' then
    raise notice 'PASS 5: wypisanie konia przydzielonego do aktywnego zapisu odrzucone (SB004)';
  end;

  -- 6. Zawezenie godzin pod aktywnym zapisem nadal odrzucane (SB002, wyzwalacz z S-02).
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 11, array[v_bella, v_kasztan, v_iskra], array[v_ania], '[]'::jsonb);
    raise notice 'FAIL 6: zawezenie godzin pod zapisem przeszlo';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB002' then
    raise notice 'PASS 6: zawezenie godzin pod zapisem odrzucone (SB002)';
  end;

  -- 7. Nieaktywny instruktor, ktorego w dniu nie bylo -> SB006.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, array[v_bella, v_kasztan, v_iskra], array[v_ania, v_basia, v_ola], v_seats);
    raise notice 'FAIL 7: nieaktywny instruktor dodany do dnia';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB006' then
    raise notice 'PASS 7: nieaktywny instruktor nie wchodzi do dnia, w ktorym go nie bylo (SB006)';
  end;

  -- 8. Instruktor zdezaktywowany PO ulozeniu dnia zostaje w nim i da sie mu wyzerowac limity.
  update public.instructors set active = false where id = v_basia;
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, array[v_bella, v_kasztan, v_iskra], array[v_ania, v_basia], v_ania_1);
    select count(*) into v from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_basia and seats = 0;
    if v = 6 then
      raise notice 'PASS 8: zdezaktywowany po ulozeniu dnia instruktor zostaje w dniu, limity wyzerowane';
    else
      raise notice 'FAIL 8: Basia ma % wyzerowanych slotow zamiast 6', v;
      v_failures := v_failures + 1;
    end if;
  exception when others then
    raise notice 'FAIL 8: zapis dnia z instruktorem zdezaktywowanym po ulozeniu odrzucony (%)', sqlstate;
    v_failures := v_failures + 1;
  end;

  -- 9. Wypisanie instruktora (bez zapisow) usuwa jego sloty.
  perform public.save_schedule_day(v_tomorrow, 10, 16, array[v_bella, v_kasztan, v_iskra], array[v_ania], v_ania_1);
  select count(*) into v from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_basia;
  if v = 0 and not exists (select 1 from public.schedule_day_instructors where schedule_day_id = v_day and instructor_id = v_basia) then
    raise notice 'PASS 9: wypisany instruktor znika z dnia razem ze slotami';
  else
    raise notice 'FAIL 9: po wypisaniu Basia ma % slotow', v;
    v_failures := v_failures + 1;
  end if;

  -- 10. Cudzy kon (SB003) i cudzy instruktor (SB005).
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, array[v_bella, v_kasztan, v_iskra, v_grom], array[v_ania], v_ania_1);
    raise notice 'FAIL 10: cudzy kon dopisany do dnia';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB003' then
    raise notice 'PASS 10: cudzy kon odrzucony (SB003)';
  end;
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, array[v_bella, v_kasztan, v_iskra], array[v_ania, v_obcy], v_ania_1);
    raise notice 'FAIL 10b: cudzy instruktor dopisany do dnia';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB005' then
    raise notice 'PASS 10b: cudzy instruktor odrzucony (SB005)';
  end;

  -- 11. Dzien miniony (czas polski) -> SB008, nic nie powstaje.
  begin
    perform public.save_schedule_day((now() at time zone 'Europe/Warsaw')::date - 1, 10, 16, array[v_bella], array[]::bigint[], '[]'::jsonb);
    raise notice 'FAIL 11: grafik na dzien miniony zapisany';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB008' then
    raise notice 'PASS 11: grafik na dzien miniony odrzucony (SB008)';
  end;

  -- 12. Limit dla godziny poza zakresem dnia albo dla instruktora spoza dnia -> 22023.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, array[v_bella, v_kasztan, v_iskra], array[v_ania],
      jsonb_build_array(jsonb_build_object('instructor_id', v_ania, 'hour', 16, 'seats', 1)));
    raise notice 'FAIL 12: limit poza zakresem godzin przyjety';
    v_failures := v_failures + 1;
  exception when invalid_parameter_value then
    raise notice 'PASS 12: limit poza zakresem godzin odrzucony (22023)';
  end;

  -- 13. Bezposredni zapis do tabel grafiku - odebrany takze wlascicielowi.
  begin
    insert into public.schedule_days (stable_id, day, open_hour, close_hour)
    values (current_setting('app.stable')::bigint, current_date + 20, 8, 12);
    raise notice 'FAIL 13a: bezposredni insert dnia przeszedl';
    v_failures := v_failures + 1;
  exception when insufficient_privilege then null;
  end;
  begin
    update public.schedule_days set open_hour = 8 where id = v_day;
    raise notice 'FAIL 13b: bezposredni update dnia przeszedl';
    v_failures := v_failures + 1;
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.schedule_day_horses where schedule_day_id = v_day and horse_id = v_iskra;
    raise notice 'FAIL 13c: bezposrednie wypisanie konia przeszlo';
    v_failures := v_failures + 1;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
    values (v_day, v_basia, current_setting('app.stable')::bigint);
    raise notice 'FAIL 13d: bezposrednie dopisanie instruktora przeszlo';
    v_failures := v_failures + 1;
  exception when insufficient_privilege then null;
  end;
  begin
    update public.schedule_slots set seats = 50 where schedule_day_id = v_day;
    raise notice 'FAIL 13e: bezposrednia zmiana limitu przeszla';
    v_failures := v_failures + 1;
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.schedule_slots where schedule_day_id = v_day;
    raise notice 'FAIL 13f: bezposrednie usuniecie slotow przeszlo';
    v_failures := v_failures + 1;
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 13: bezposredni zapis do tabel grafiku odrzucony (42501)';

  if v_failures > 0 then
    raise exception '% asercji nie przeszlo', v_failures;
  end if;
  raise notice '--- WSZYSTKIE ASERCJE ZAPISU GRAFIKU (WLASCICIEL) PRZESZLY ---';
end $$;

rollback;

\echo '=== Zapis grafiku dnia: obcy wlasciciel ==='

begin;

do $$
begin
  perform set_config('app.day_a', (
    select sd.id::text from public.schedule_days sd join public.stables s on s.id = sd.stable_id
    where s.owner_id = '11111111-1111-1111-1111-111111111111' and sd.day = current_date + 1), true);
  perform set_config('app.grom', (
    select h.id::text from public.horses h join public.stables s on s.id = h.stable_id
    where s.owner_id = '22222222-2222-2222-2222-222222222222' and h.name = 'Grom'), true);
  perform set_config('app.tomasz', (
    select i.id::text from public.instructors i join public.stables s on s.id = i.stable_id
    where s.owner_id = '22222222-2222-2222-2222-222222222222' and i.name = 'Tomasz Lis'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_day_a bigint := current_setting('app.day_a')::bigint;
  v_grom bigint := current_setting('app.grom')::bigint;
  v_tomasz bigint := current_setting('app.tomasz')::bigint;
  v_open int;
  v_close int;
begin
  -- Funkcja nie przyjmuje stadniny z zewnatrz: wywolanie osrodka B na te sama date
  -- zmienia wylacznie dzien B, dzien A zostaje 10-16. Tomasz zostaje w dniu z miejscem o 10,
  -- bo ma tam aktywny zapis Piotra (inaczej SB010/SB011).
  perform public.save_schedule_day(current_date + 1, 8, 12, array[v_grom], array[v_tomasz],
    jsonb_build_array(jsonb_build_object('instructor_id', v_tomasz, 'hour', 10, 'seats', 1)));
  select open_hour, close_hour into v_open, v_close from public.schedule_days where id = v_day_a;
  if v_open <> 10 or v_close <> 16 then
    raise exception 'FAIL: wywolanie osrodka B zmienilo dzien A na %-%', v_open, v_close;
  end if;
  raise notice 'PASS: funkcja dziala wylacznie na stadninie wolajacego';
end $$;

rollback;

\echo '=== Zapis grafiku dnia: jezdziec i niezalogowany ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
begin
  begin
    perform public.save_schedule_day(current_date + 1, 8, 12, array[]::bigint[], array[]::bigint[], '[]'::jsonb);
    raise exception 'FAIL: jezdziec zapisal grafik dnia';
  exception when insufficient_privilege then
    raise notice 'PASS: jezdziec nie zapisze grafiku dnia (42501)';
  end;
end $$;

rollback;

begin;
set local role anon;

do $$
begin
  begin
    perform public.save_schedule_day(current_date + 1, 8, 12, array[]::bigint[], array[]::bigint[], '[]'::jsonb);
    raise exception 'FAIL: niezalogowany wywolal save_schedule_day';
  exception when insufficient_privilege then
    raise notice 'PASS: niezalogowany nie wywola save_schedule_day';
  end;
end $$;

rollback;

\echo '--- WSZYSTKIE ASERCJE ZAPISU GRAFIKU PRZESZLY ---'
