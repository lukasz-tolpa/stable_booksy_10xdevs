-- Dowod: zmiana grafiku odrzuca zapisy oczekujace (#127, spec #122, ADR 0002, ADR 0006, GLOSSARY
-- „Odrzucenie zapisu”).
--
-- Gwarancje (wszystko przez public.save_schedule_day jako wlasciciel - jedyna droga zapisu grafiku):
--   * zapis oczekujacy nie blokuje zmiany grafiku: odmowy SB002, SB010, SB011, SB032, SB048 licza tylko zapisy
--     aktywne (DETAIL bez oczekujacych), a po odmowie zapis oczekujacy zostaje oczekujacy
--   * gdy slot znika (instruktor wypisany z dnia, dzien skrocony), dostaje limit zero albo zmienia rodzaj lub
--     plac, zapisy oczekujace na ten slot staja sie odrzucone z powodem „Ośrodek zmienił grafik” i zrodlem
--     schedule_change, w tej samej transakcji; kon pensjonatowy zapisu zwolniony; jezdziec widzi powod
--   * zapisy odwolane i aktywne zmiana grafiku nie sa odrzucane; zapisy oczekujace na inne sloty zostaja
--   * zmniejszenie limitu (powyzej zera) nie dotyka zapisow oczekujacych, takze gdy czeka ich wiecej niz miejsc
--   * zapis oczekujacy na slot, ktory juz sie zaczal (wygasly), zostaje wygasly - zmiana grafiku go nie odrzuca
--
-- Seed (jutro, Pod Dębem 10-16, Bella + Kasztan): Joanna Wrona 1 miejsce w kazdej godzinie na Hali, Anna
-- (aktywny) u Joanny o 11; pensjonariuszka Katarzyna (Hrabia). Wymaga swiezego seeda (`npx supabase db reset`).
-- Kazdy przypadek dziala na tym samym stanie po setupie (blok z wyjatkiem cofa swoje zmiany). Calosc w jednej
-- transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Zmiana grafiku a zapisy oczekujace: setup (postgres) ==='

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
  c_zofia constant uuid := 'abababab-abab-abab-abab-abababababab';
  c_celina constant uuid := 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd';
  c_piotr constant uuid := '44444444-4444-4444-4444-444444444444';
  c_katarzyna constant uuid := '12121212-1212-1212-1212-121212121212';
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_stable bigint;
  v_day bigint;
  v_today_day bigint;
  v_joanna bigint;
  v_karol bigint;
  v_hala bigint;
  v_bella bigint;
  v_id bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors where stable_id = v_stable and name = 'Joanna Wrona';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  select id into v_hala from public.places where stable_id = v_stable and name = 'Hala';
  select id into v_bella from public.horses where stable_id = v_stable and name = 'Bella';
  if v_day is null or v_joanna is null or v_karol is null or v_hala is null or v_bella is null then
    raise exception 'Brak danych seeda albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Joanna o 11 i 12 ma 2 miejsca. Karol pracuje jutro na Hali: o 14 slot rekreacyjny z 1 miejscem, o 15 slot
  -- treningowy z 1 miejscem, w innych godzinach bez miejsc (suma limitow rekreacyjnych <= 2 konie). Postgres
  -- pisze grafik wprost, jak seed.
  update public.schedule_slots set seats = 2
  where schedule_day_id = v_day and instructor_id = v_joanna and hour in (11, 12);
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id, kind)
  select v_day, v_karol, h,
         case when h in (14, 15) then 1 else 0 end,
         v_hala,
         case when h = 15 then 'training' else 'recreation' end
  from generate_series(10, 15) h;

  -- Zapisy oczekujace (wstawia postgres; wyzwalacze limitu i rodzaju slotu dzialaja jak dla jezdzca).
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_karol, 14, c_zofia, 'pending') returning id into v_id;
  perform set_config('app.zofia_karol14', v_id::text, true);
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_karol, 15, c_katarzyna, 'pending') returning id into v_id;
  perform set_config('app.katarzyna_karol15', v_id::text, true);
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_joanna, 15, c_zofia, 'pending') returning id into v_id;
  perform set_config('app.zofia_j15', v_id::text, true);
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_joanna, 13, c_celina, 'pending') returning id into v_id;
  perform set_config('app.celina_j13', v_id::text, true);
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_joanna, 10, c_celina, 'pending') returning id into v_id;
  perform set_config('app.celina_j10', v_id::text, true);
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_joanna, 14, c_celina, 'pending') returning id into v_id;
  perform set_config('app.celina_j14', v_id::text, true);
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_joanna, 12, c_zofia, 'pending') returning id into v_id;
  perform set_config('app.zofia_j12', v_id::text, true);
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_joanna, 12, c_piotr, 'pending') returning id into v_id;
  perform set_config('app.piotr_j12', v_id::text, true);
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_joanna, 11, c_zofia, 'pending') returning id into v_id;
  perform set_config('app.zofia_j11', v_id::text, true);

  -- Piotr ma zapis aktywny u Karola o 14 (jedyne miejsce; Zofia czeka na nie).
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_karol, 14, c_piotr, 'active') returning id into v_id;
  perform set_config('app.piotr_karol14', v_id::text, true);

  -- Dzis (czas polski) 0-1: Joanna o 0 z 1 miejscem, Bella pracuje. Slot o 0 juz sie zaczal - zapis
  -- oczekujacy Zofii na niego jest wygasly.
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, v_today, 0, 1)
  returning id into v_today_day;
  insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
  values (v_today_day, v_bella, v_stable);
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_today_day, v_joanna, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id)
  values (v_today_day, v_joanna, 0, 1, v_hala);
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_today_day, v_joanna, 0, c_zofia, 'pending') returning id into v_id;
  perform set_config('app.zofia_today0', v_id::text, true);

  perform set_config('app.day', v_day::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.karol', v_karol::text, true);
  perform set_config('app.bella', v_bella::text, true);
  perform set_config('app.kasztan', (select id::text from public.horses
                                     where stable_id = v_stable and name = 'Kasztan'), true);
  perform set_config('app.duzy_plac', (select id::text from public.places
                                       where stable_id = v_stable and name = 'Duży plac'), true);
  perform set_config('app.anna_j11', (select b.id::text from public.bookings b
                                      where b.schedule_day_id = v_day and b.instructor_id = v_joanna
                                        and b.hour = 11 and b.status = 'active'), true);
end $$;

-- Stan zapisu w jednym slowie: status, a przy odrzuconym - zrodlo i powod.
create function pg_temp.booking_state(p_id bigint)
returns text
language sql
stable
as $$
  select b.status || coalesce(' ' || b.rejection_source || ' ' || b.rejection_reason, '')
  from public.bookings b where b.id = p_id;
$$;

\echo '=== Zmiana grafiku a zapisy oczekujace: wlasciciel Pod Dębem (save_schedule_day) ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  c_rejected constant text := 'rejected schedule_change Ośrodek zmienił grafik';
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v_duzy_plac bigint := current_setting('app.duzy_plac')::bigint;
  v_tomorrow date := current_date + 1;
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_horses bigint[] := array[current_setting('app.bella')::bigint, current_setting('app.kasztan')::bigint];
  v_staff bigint[];
  v_full jsonb;
  v_pending text[] := array['zofia_karol14', 'katarzyna_karol15', 'zofia_j15', 'celina_j13', 'celina_j10',
                            'celina_j14', 'zofia_j12', 'piotr_j12', 'zofia_j11', 'zofia_today0'];
  v_detail text;
  v_failures int := 0;
  v_before int;
  v_name text;
  v_state text;
  v_expected_rejected text[];
  v_horse bigint;
  -- Kod konczacy przypadek: wyjatek cofa zmiany przypadku, nastepny startuje ze stanu po setupie.
  c_case_done constant text := 'TC127';
begin
  v_staff := array[v_joanna, v_karol];
  -- Stan dnia z setupu: Joanna 1 miejsce (o 11 i 12 - 2), Karol o 14 (rekreacyjny) i 15 (treningowy).
  v_full := (
    select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h,
                                        'seats', case when h in (11, 12) then 2 else 1 end))
    from generate_series(10, 15) h
  ) || jsonb_build_array(
    jsonb_build_object('instructor_id', v_karol, 'hour', 14, 'seats', 1),
    jsonb_build_object('instructor_id', v_karol, 'hour', 15, 'seats', 1)
  );

  v_before := v_failures;
  -- 1. Zapis grafiku bez zmian nie dotyka zapisow oczekujacych.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, v_staff, v_full);
    foreach v_name in array v_pending loop
      v_state := pg_temp.booking_state(current_setting('app.' || v_name)::bigint);
      if v_state <> 'pending' then
        raise notice 'FAIL 1: % po zapisie grafiku bez zmian jest %', v_name, v_state;
        v_failures := v_failures + 1;
      end if;
    end loop;
    if v_failures = v_before then
      raise notice 'PASS 1: zapis grafiku bez zmian - wszystkie zapisy oczekujace czekaja dalej';
    end if;
    raise exception using errcode = c_case_done;
  exception when sqlstate 'TC127' then null;
  end;

  -- 2. Zapis aktywny blokuje wypisanie instruktora jak dotad (SB011, DETAIL liczy tylko aktywne);
  --    zapisy oczekujace na jego sloty zostaja oczekujace.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, array[v_joanna],
      (select jsonb_agg(e) from jsonb_array_elements(v_full) e where e ->> 'instructor_id' = v_joanna::text));
    raise notice 'FAIL 2: wypisanie instruktora z aktywnym zapisem przeszlo';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB011' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail::jsonb = '{"bookings": 1}'::jsonb
       and pg_temp.booking_state(current_setting('app.zofia_karol14')::bigint) = 'pending'
       and pg_temp.booking_state(current_setting('app.katarzyna_karol15')::bigint) = 'pending' then
      raise notice 'PASS 2: wypisanie Karola z aktywnym zapisem odrzucone (SB011 %), oczekujace czekaja dalej', v_detail;
    else
      raise notice 'FAIL 2: DETAIL SB011 % (oczekiwane {"bookings": 1}) albo zmieniony zapis oczekujacy', v_detail;
      v_failures := v_failures + 1;
    end if;
  end;

  v_before := v_failures;
  -- 3. Instruktor wypisany z dnia (aktywny zapis odwolany wczesniej): jego zapisy oczekujace odrzucone
  --    „Ośrodek zmienił grafik”, kon pensjonatowy zwolniony; odwolany zapis zostaje odwolany, a zapisy
  --    oczekujace u Joanny czekaja dalej. Jezdziec widzi powod przy swoim zapisie.
  begin
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable'
    where id = current_setting('app.piotr_karol14')::bigint;
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, array[v_joanna],
      (select jsonb_agg(e) from jsonb_array_elements(v_full) e where e ->> 'instructor_id' = v_joanna::text));
    v_expected_rejected := array['zofia_karol14', 'katarzyna_karol15'];
    foreach v_name in array v_pending loop
      v_state := pg_temp.booking_state(current_setting('app.' || v_name)::bigint);
      if v_state <> (case when v_name = any (v_expected_rejected) then c_rejected else 'pending' end) then
        raise notice 'FAIL 3: po wypisaniu Karola % jest %', v_name, v_state;
        v_failures := v_failures + 1;
      end if;
    end loop;
    select horse_id into v_horse from public.bookings where id = current_setting('app.katarzyna_karol15')::bigint;
    if v_horse is not null then
      raise notice 'FAIL 3: odrzucony zapis Katarzyny nadal ma konia %', v_horse;
      v_failures := v_failures + 1;
    end if;
    if pg_temp.booking_state(current_setting('app.piotr_karol14')::bigint) <> 'cancelled' then
      raise notice 'FAIL 3: odwolany zapis Piotra zmieniony na %',
        pg_temp.booking_state(current_setting('app.piotr_karol14')::bigint);
      v_failures := v_failures + 1;
    end if;
    -- Zofia widzi swoj zapis odrzucony z powodem (polityka „wlasny wiersz”).
    perform set_config('request.jwt.claims',
                       '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}', true);
    select b.status || ': ' || b.rejection_reason into v_state
    from public.bookings b where b.id = current_setting('app.zofia_karol14')::bigint;
    perform set_config('request.jwt.claims',
                       '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
    if v_state is distinct from 'rejected: Ośrodek zmienił grafik' then
      raise notice 'FAIL 3: Zofia widzi swoj zapis jako %', v_state;
      v_failures := v_failures + 1;
    end if;
    if v_failures = v_before then
      raise notice 'PASS 3: wypisanie Karola odrzucilo jego zapisy oczekujace';
    end if;
    raise exception using errcode = c_case_done;
  exception when sqlstate 'TC127' then null;
  end;

  v_before := v_failures;
  -- 4. Dzien skrocony do 10-15: zapisy oczekujace o 15 (Joanna i Karol) odrzucone, reszta czeka.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 15, v_horses, v_staff,
      (select jsonb_agg(e) from jsonb_array_elements(v_full) e where e ->> 'hour' <> '15'));
    v_expected_rejected := array['zofia_j15', 'katarzyna_karol15'];
    foreach v_name in array v_pending loop
      v_state := pg_temp.booking_state(current_setting('app.' || v_name)::bigint);
      if v_state <> (case when v_name = any (v_expected_rejected) then c_rejected else 'pending' end) then
        raise notice 'FAIL 4: po skroceniu dnia % jest %', v_name, v_state;
        v_failures := v_failures + 1;
      end if;
    end loop;
    if v_failures = v_before then
      raise notice 'PASS 4: skrocenie dnia odrzucilo zapisy oczekujace w odcietej godzinie';
    end if;
    raise exception using errcode = c_case_done;
  exception when sqlstate 'TC127' then null;
  end;

  v_before := v_failures;
  -- 5. Limit zero (godzina pominieta w p_seats): zapis oczekujacy u Joanny o 13 odrzucony, reszta czeka.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, v_staff,
      (select jsonb_agg(e) from jsonb_array_elements(v_full) e
       where not (e ->> 'instructor_id' = v_joanna::text and e ->> 'hour' = '13')));
    v_expected_rejected := array['celina_j13'];
    foreach v_name in array v_pending loop
      v_state := pg_temp.booking_state(current_setting('app.' || v_name)::bigint);
      if v_state <> (case when v_name = any (v_expected_rejected) then c_rejected else 'pending' end) then
        raise notice 'FAIL 5: po limicie zero o 13 % jest %', v_name, v_state;
        v_failures := v_failures + 1;
      end if;
    end loop;
    if v_failures = v_before then
      raise notice 'PASS 5: limit zero odrzucil zapis oczekujacy na slot';
    end if;
    raise exception using errcode = c_case_done;
  exception when sqlstate 'TC127' then null;
  end;

  v_before := v_failures;
  -- 6. Zmiana placu slotu Joanny o 10 (Hala -> Duży plac) bez aktywnych zapisow: przechodzi, zapis
  --    oczekujacy odrzucony.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, v_staff,
      (select jsonb_agg(case when e ->> 'instructor_id' = v_joanna::text and e ->> 'hour' = '10'
                             then e || jsonb_build_object('place_id', v_duzy_plac) else e end)
       from jsonb_array_elements(v_full) e));
    v_expected_rejected := array['celina_j10'];
    foreach v_name in array v_pending loop
      v_state := pg_temp.booking_state(current_setting('app.' || v_name)::bigint);
      if v_state <> (case when v_name = any (v_expected_rejected) then c_rejected else 'pending' end) then
        raise notice 'FAIL 6: po zmianie placu o 10 % jest %', v_name, v_state;
        v_failures := v_failures + 1;
      end if;
    end loop;
    if v_failures = v_before then
      raise notice 'PASS 6: zmiana placu odrzucila zapis oczekujacy zamiast odmowy SB032';
    end if;
    raise exception using errcode = c_case_done;
  exception when sqlstate 'TC127' then null;
  end;

  v_before := v_failures;
  -- 7. Zmiana rodzaju slotu Joanny o 14 (rekreacyjny -> treningowy) bez aktywnych zapisow: przechodzi,
  --    zapis oczekujacy odrzucony.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, v_staff,
      (select jsonb_agg(case when e ->> 'instructor_id' = v_joanna::text and e ->> 'hour' = '14'
                             then e || jsonb_build_object('kind', 'training') else e end)
       from jsonb_array_elements(v_full) e));
    v_expected_rejected := array['celina_j14'];
    foreach v_name in array v_pending loop
      v_state := pg_temp.booking_state(current_setting('app.' || v_name)::bigint);
      if v_state <> (case when v_name = any (v_expected_rejected) then c_rejected else 'pending' end) then
        raise notice 'FAIL 7: po zmianie rodzaju o 14 % jest %', v_name, v_state;
        v_failures := v_failures + 1;
      end if;
    end loop;
    if v_failures = v_before then
      raise notice 'PASS 7: zmiana rodzaju odrzucila zapis oczekujacy zamiast odmowy SB048';
    end if;
    raise exception using errcode = c_case_done;
  exception when sqlstate 'TC127' then null;
  end;

  v_before := v_failures;
  -- 8. Zmniejszenie limitu powyzej zera (Joanna o 12: 2 -> 1, czeka dwoch): nikt nie odrzucony.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, v_staff,
      (select jsonb_agg(case when e ->> 'instructor_id' = v_joanna::text and e ->> 'hour' = '12'
                             then e || jsonb_build_object('seats', 1) else e end)
       from jsonb_array_elements(v_full) e));
    foreach v_name in array v_pending loop
      v_state := pg_temp.booking_state(current_setting('app.' || v_name)::bigint);
      if v_state <> 'pending' then
        raise notice 'FAIL 8: po zmniejszeniu limitu o 12 % jest %', v_name, v_state;
        v_failures := v_failures + 1;
      end if;
    end loop;
    if v_failures = v_before then
      raise notice 'PASS 8: zmniejszenie limitu powyzej zera nie dotknelo zapisow oczekujacych';
    end if;
    raise exception using errcode = c_case_done;
  exception when sqlstate 'TC127' then null;
  end;

  -- 9. Zapisy aktywne (Anna u Joanny o 11, Piotr u Karola o 14) blokuja zmiany jak dotad; DETAIL liczy tylko
  --    aktywne, a zapisy oczekujace (Zofia na ten sam slot o 11) zostaja oczekujace.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, v_staff,
      (select jsonb_agg(case when e ->> 'instructor_id' = v_joanna::text and e ->> 'hour' = '11'
                             then e || jsonb_build_object('place_id', v_duzy_plac) else e end)
       from jsonb_array_elements(v_full) e));
    raise notice 'FAIL 9a: zmiana placu slotu z aktywnym zapisem przeszla';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB032' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail::jsonb = '{"hour": 11, "bookings": 1}'::jsonb then
      raise notice 'PASS 9a: zmiana placu pod aktywnym zapisem odrzucona (SB032 %)', v_detail;
    else
      raise notice 'FAIL 9a: DETAIL SB032 % zamiast {"hour": 11, "bookings": 1}', v_detail;
      v_failures := v_failures + 1;
    end if;
  end;

  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, v_staff,
      (select jsonb_agg(case when e ->> 'instructor_id' = v_joanna::text and e ->> 'hour' = '11'
                             then e || jsonb_build_object('kind', 'training') else e end)
       from jsonb_array_elements(v_full) e));
    raise notice 'FAIL 9b: zmiana rodzaju slotu z aktywnym zapisem przeszla';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB048' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail::jsonb = '{"hour": 11, "bookings": 1}'::jsonb then
      raise notice 'PASS 9b: zmiana rodzaju pod aktywnym zapisem odrzucona (SB048 %)', v_detail;
    else
      raise notice 'FAIL 9b: DETAIL SB048 % zamiast {"hour": 11, "bookings": 1}', v_detail;
      v_failures := v_failures + 1;
    end if;
  end;

  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_horses, v_staff,
      (select jsonb_agg(e) from jsonb_array_elements(v_full) e
       where not (e ->> 'instructor_id' = v_joanna::text and e ->> 'hour' = '11')));
    raise notice 'FAIL 9c: limit zero pod aktywnym zapisem przeszedl';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB010' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail::jsonb = '{"hour": 11, "seats": 0, "bookings": 1}'::jsonb then
      raise notice 'PASS 9c: limit zero pod aktywnym zapisem odrzucony (SB010 %)', v_detail;
    else
      raise notice 'FAIL 9c: DETAIL SB010 % zamiast {"hour": 11, "seats": 0, "bookings": 1}', v_detail;
      v_failures := v_failures + 1;
    end if;
  end;

  begin
    perform public.save_schedule_day(v_tomorrow, 10, 11, v_horses, v_staff,
      (select jsonb_agg(e) from jsonb_array_elements(v_full) e where e ->> 'hour' = '10'));
    raise notice 'FAIL 9d: skrocenie dnia pod aktywnym zapisem przeszlo';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB002' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail::jsonb = '{"bookings": 2}'::jsonb then
      raise notice 'PASS 9d: skrocenie dnia pod aktywnym zapisem odrzucone (SB002 %), oczekujace nie licza sie', v_detail;
    else
      raise notice 'FAIL 9d: DETAIL SB002 % zamiast {"bookings": 2}', v_detail;
      v_failures := v_failures + 1;
    end if;
  end;

  v_before := v_failures;
  foreach v_name in array v_pending loop
    v_state := pg_temp.booking_state(current_setting('app.' || v_name)::bigint);
    if v_state <> 'pending' then
      raise notice 'FAIL 9e: po odmowach % jest %', v_name, v_state;
      v_failures := v_failures + 1;
    end if;
  end loop;
  if pg_temp.booking_state(current_setting('app.anna_j11')::bigint) <> 'active' then
    raise notice 'FAIL 9e: zapis aktywny Anny zmieniony';
    v_failures := v_failures + 1;
  end if;
  if v_failures = v_before then
    raise notice 'PASS 9e: po odmowach zapisy oczekujace czekaja, zapis Anny aktywny';
  end if;

  -- 10. Dzisiejszy slot o 0 juz sie zaczal: wypisanie Joanny z dnia nie odrzuca wygaslego zapisu Zofii.
  begin
    perform public.save_schedule_day(v_today, 0, 1, array[current_setting('app.bella')::bigint], '{}', '[]');
    v_state := pg_temp.booking_state(current_setting('app.zofia_today0')::bigint);
    if v_state = 'pending' then
      raise notice 'PASS 10: zapis oczekujacy na slot, ktory sie zaczal, zostal wygasly (nie odrzucony)';
    else
      raise notice 'FAIL 10: wygasly zapis Zofii po zmianie grafiku jest %', v_state;
      v_failures := v_failures + 1;
    end if;
    raise exception using errcode = c_case_done;
  exception when sqlstate 'TC127' then null;
  end;

  if v_failures > 0 then
    raise exception '% asercji nie przeszlo', v_failures;
  end if;
  raise notice '--- WSZYSTKIE ASERCJE ZMIANY GRAFIKU Z ZAPISAMI OCZEKUJACYMI PRZESZLY ---';
end $$;

reset role;

rollback;

\echo '--- WSZYSTKIE ASERCJE ZMIANY GRAFIKU Z ZAPISAMI OCZEKUJACYMI PRZESZLY ---'
