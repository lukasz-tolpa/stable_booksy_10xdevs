-- Dowod reguly "zapisy nie gina ani nie wedruja" (PRD, Open Question #2; ADR-0002 dla #41).
--
-- Zmiana grafiku kolidujaca z AKTYWNYM zapisem jest odrzucana, a zapis zostaje nietkniety.
-- System nie wybiera, kogo odwolac - odmawia, dopoki osrodek sam nie odwola kolidujacych zapisow.
-- Grafik zapisuje wylacznie public.save_schedule_day, wiec przypadki osiagalne z aplikacji ida
-- przez funkcje jako wlasciciel:
--   * zawezenie godzin ponizej aktywnego zapisu                 -> SB002 (wyzwalacz z S-02)
--   * limit miejsc ponizej liczby aktywnych zapisow w slocie    -> SB010
--   * wypisanie z dnia instruktora z aktywnym zapisem           -> SB011
--   * wypisanie konia przydzielonego do aktywnego zapisu        -> SB004
-- Funkcja nie zmienia daty dnia ani go nie usuwa. Te dwa straznicy tabeli (SB001 z wyzwalacza,
-- 23503 z FK RESTRICT zapisu do dnia) dzialaja dla kazdego piszacego, wiec ich dowod idzie jako
-- postgres - jedyna rola, ktora jeszcze pisze do tabel wprost (migracje, dane demo).
--
-- Zapisy odwolane (ADR-0002): nie blokuja zadnej zmiany grafiku i PRZETRWAJA ja - po wypisaniu
-- instruktora z dnia albo skroceniu dnia odwolany zapis istnieje dalej z dniem, instruktorem
-- i godzina. Odwolanie czysci przydzial konia, wiec odwolany zapis nie przypina tez konia do dnia
-- (dawny przypadek 8 - "odwolany zapis przypina konia" - zmienil znaczenie w #41).
--
-- Stan dnia Pod Debem na jutro po setupie: 10-16, Bella + Kasztan; Joanna 1 miejsce w kazdej
-- godzinie, Karol 1 miejsce o 14 i 15. Aktywny: Anna u Joanny o 11 z Bella. Odwolane: Piotr
-- u Karola o 14, Piotr u Joanny o 15 (odwolany po przydziale Kasztana).
--
-- Wymaga swiezego seeda (`npx supabase db reset` tego samego dnia - dni z seeda musza byc na jutro).
-- Uzycie:  npm run test:db   (wszystkie dowody; runner sam dobiera psql z hosta albo z kontenera)
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/schedule_change_guardrails.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Ochrona zapisow przed zmiana grafiku: setup i straznicy tabeli (postgres) ==='

begin;

do $$
declare
  c_piotr constant uuid := '44444444-4444-4444-4444-444444444444';
  v_stable bigint;
  v_day bigint;
  v_bella bigint;
  v_kasztan bigint;
  v_joanna bigint;
  v_karol bigint;
  v_booking bigint;
  v_cancelled_karol bigint;
  v_cancelled_hour bigint;
  v_empty_day bigint;
  v_detail text;
  v int;
  v_failures int := 0;
  d record;
begin
  select s.id into v_stable from public.stables s where s.owner_id = '11111111-1111-1111-1111-111111111111';
  select sd.id into v_day from public.schedule_days sd where sd.stable_id = v_stable and sd.day = current_date + 1;
  select h.id into v_bella from public.horses h where h.stable_id = v_stable and h.name = 'Bella';
  select h.id into v_kasztan from public.horses h where h.stable_id = v_stable and h.name = 'Kasztan';
  select i.id into v_joanna from public.instructors i where i.stable_id = v_stable and i.name = 'Joanna Wrona';
  select i.id into v_karol from public.instructors i where i.stable_id = v_stable and i.name = 'Karol Jasny';

  select b.id into v_booking
  from public.bookings b
  where b.schedule_day_id = v_day and b.instructor_id = v_joanna and b.hour = 11
    and b.status = 'active' and b.rider_id = '33333333-3333-3333-3333-333333333333';

  if v_day is null or v_bella is null or v_kasztan is null or v_joanna is null or v_karol is null or v_booking is null then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Karol dochodzi do dnia (1 miejsce o 14 i 15; suma 2 = liczba koni).
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select v_day, v_karol, h, case when h in (14, 15) then 1 else 0 end from generate_series(10, 15) h;

  -- Przydzial Belli do aktywnego zapisu Anny.
  update public.bookings set horse_id = v_bella where id = v_booking;

  -- Odwolany zapis Piotra u Karola o 14 (przetrwa wypisanie Karola).
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day, v_karol, 14, c_piotr)
  returning id into v_cancelled_karol;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
  where id = v_cancelled_karol;

  -- Odwolany zapis Piotra u Joanny o 15, z Kasztanem przed odwolaniem (przetrwa skrocenie dnia,
  -- a odwolanie zwalnia Kasztana).
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, horse_id)
  values (v_day, v_joanna, 15, c_piotr, v_kasztan)
  returning id into v_cancelled_hour;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
  where id = v_cancelled_hour;

  -- 3. Zmiana daty dnia z aktywnymi zapisami musi odpasc; zapis zostaje na swoim dniu.
  begin
    update public.schedule_days set day = day + 7 where id = v_day;
    raise notice 'FAIL 3: zmiana daty przeszla, zapisy przewedrowalyby na inny termin';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB001' then
    -- Liczba aktywnych zapisow idzie w DETAIL jako JSON (kontrakt z `scheduleErrorMessage`).
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail is not null and v_detail ~ '^\s*\{' and v_detail::jsonb = '{"bookings": 1}'::jsonb then
      raise notice 'PASS 3: zmiana daty dnia z zapisami odrzucona (SB001), DETAIL: %', v_detail;
    else
      raise notice 'FAIL 3: DETAIL SB001 to % zamiast {"bookings": 1}', v_detail;
      v_failures := v_failures + 1;
    end if;
  end;
  select day into d from public.schedule_days where id = v_day;
  if d.day = current_date + 1 then
    raise notice 'PASS 3b: po odmowie dzien nadal na jutro';
  else
    raise notice 'FAIL 3b: po odmowie data dnia zmieniona na %', d.day;
    v_failures := v_failures + 1;
  end if;

  -- 4. GRANICA: zmiana daty dnia BEZ zapisow musi przejsc.
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, current_date + 30, 9, 15)
  returning id into v_empty_day;

  begin
    update public.schedule_days set day = current_date + 31 where id = v_empty_day;
    get diagnostics v = row_count;
    if v = 1 then
      raise notice 'PASS 4: zmiana daty pustego dnia przeszla';
    else
      raise notice 'FAIL 4: zmiana daty pustego dnia dotknela % wierszy', v;
      v_failures := v_failures + 1;
    end if;
  exception when others then
    raise notice 'FAIL 4: zmiana daty pustego dnia odrzucona (%) - straznik jest za ciasny', sqlstate;
    v_failures := v_failures + 1;
  end;

  -- 6. Usuniecie calego dnia z zapisami (FK zapisu do dnia, RESTRICT).
  begin
    delete from public.schedule_days where id = v_day;
    raise notice 'FAIL 6: usuniecie dnia z zapisami przeszlo';
    v_failures := v_failures + 1;
  exception when foreign_key_violation then
    raise notice 'PASS 6: usuniecie dnia z zapisami odrzucone (23503)';
  end;

  if v_failures > 0 then
    raise exception '% asercji nie przeszlo', v_failures;
  end if;

  -- Id-y przekazujemy do blokow wlasciciela przez GUC transakcji (widoczne po set role).
  perform set_config('app.day', v_day::text, true);
  perform set_config('app.bella', v_bella::text, true);
  perform set_config('app.kasztan', v_kasztan::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.karol', v_karol::text, true);
  perform set_config('app.booking', v_booking::text, true);
  perform set_config('app.cancelled_karol', v_cancelled_karol::text, true);
  perform set_config('app.cancelled_hour', v_cancelled_hour::text, true);
end $$;

\echo '=== Ochrona zapisow przed zmiana grafiku: wlasciciel Pod Debem (save_schedule_day) ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_day bigint := current_setting('app.day')::bigint;
  v_bella bigint := current_setting('app.bella')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v_booking bigint := current_setting('app.booking')::bigint;
  v_cancelled_karol bigint := current_setting('app.cancelled_karol')::bigint;
  v_cancelled_hour bigint := current_setting('app.cancelled_hour')::bigint;
  v_tomorrow date := current_date + 1;
  v_both bigint[];
  v_staff bigint[];
  v_full jsonb;
  v_joanna_only jsonb;
  v_detail text;
  v int;
  v_failures int := 0;
  b record;
  d record;
begin
  v_both := array[v_bella, v_kasztan];
  v_staff := array[v_joanna, v_karol];
  -- Stan dnia z setupu: Joanna 1 miejsce w kazdej godzinie, Karol o 14 i 15.
  v_full := (
    select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h, 'seats', 1))
    from generate_series(10, 15) h
  ) || jsonb_build_array(
    jsonb_build_object('instructor_id', v_karol, 'hour', 14, 'seats', 1),
    jsonb_build_object('instructor_id', v_karol, 'hour', 15, 'seats', 1)
  );

  -- 1. Zawezenie godzin ponizej aktywnego zapisu (Joanna o 11) musi odpasc...
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 11, v_both, v_staff,
      jsonb_build_array(jsonb_build_object('instructor_id', v_joanna, 'hour', 10, 'seats', 1)));
    raise notice 'FAIL 1: zawezenie godzin przeszlo mimo zapisu w odcietej godzinie';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB002' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail is not null and v_detail ~ '^\s*\{' and v_detail::jsonb = '{"bookings": 1}'::jsonb then
      raise notice 'PASS 1: zawezenie godzin pod aktywnym zapisem odrzucone (SB002), DETAIL: %', v_detail;
    else
      raise notice 'FAIL 1: DETAIL SB002 to % zamiast {"bookings": 1}', v_detail;
      v_failures := v_failures + 1;
    end if;
  end;

  -- ...a zapis i dzien maja zostac dokladnie takie, jakie byly.
  select status, hour, schedule_day_id, instructor_id, horse_id into b from public.bookings where id = v_booking;
  select open_hour, close_hour into d from public.schedule_days where id = v_day;
  if b.status = 'active' and b.hour = 11 and b.schedule_day_id = v_day and b.instructor_id = v_joanna
     and b.horse_id = v_bella and d.open_hour = 10 and d.close_hour = 16 then
    raise notice 'PASS 1b: po odmowie zapis nietkniety (active, Joanna 11, Bella), dzien nadal 10-16';
  else
    raise notice 'FAIL 1b: po odmowie zapis lub dzien zmienione: status=% hour=% dzien=%-%', b.status, b.hour, d.open_hour, d.close_hour;
    v_failures := v_failures + 1;
  end if;

  -- 2. GRANICA: rozszerzenie godzin musi przejsc - i realnie zmienic dzien wlasciciela.
  begin
    perform public.save_schedule_day(v_tomorrow, 8, 20, v_both, v_staff, v_full);
    select open_hour, close_hour into d from public.schedule_days where id = v_day;
    if d.open_hour = 8 and d.close_hour = 20 then
      raise notice 'PASS 2: rozszerzenie godzin przy istniejacych zapisach przeszlo';
    else
      raise notice 'FAIL 2: po rozszerzeniu dzien to %-%', d.open_hour, d.close_hour;
      v_failures := v_failures + 1;
    end if;
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_both, v_staff, v_full);
  exception when others then
    raise notice 'FAIL 2: rozszerzenie godzin odrzucone (%) - straznik jest za ciasny', sqlstate;
    v_failures := v_failures + 1;
  end;

  -- 3. Limit miejsc ponizej liczby aktywnych zapisow: Joanna o 11 na zero -> SB010.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_both, v_staff,
      (select jsonb_agg(e) from jsonb_array_elements(v_full) e
       where not (e ->> 'instructor_id' = v_joanna::text and e ->> 'hour' = '11')));
    raise notice 'FAIL 3: obnizenie limitu ponizej liczby zapisow przeszlo';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB010' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail is not null and v_detail ~ '^\s*\{'
       and v_detail::jsonb = '{"hour": 11, "seats": 0, "bookings": 1}'::jsonb then
      raise notice 'PASS 3: limit ponizej liczby aktywnych zapisow odrzucony (SB010), DETAIL: %', v_detail;
    else
      raise notice 'FAIL 3: DETAIL SB010 to % zamiast {"hour": 11, "seats": 0, "bookings": 1}', v_detail;
      v_failures := v_failures + 1;
    end if;
  end;
  select seats into v from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_joanna and hour = 11;
  if v = 1 then
    raise notice 'PASS 3b: po odmowie limit Joanny o 11 nadal 1';
  else
    raise notice 'FAIL 3b: po odmowie limit Joanny o 11 to %', v;
    v_failures := v_failures + 1;
  end if;

  -- 3c. GRANICA: zero w slocie bez aktywnych zapisow (Karol o 14 - zapis odwolany) przechodzi.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_both, v_staff,
      (select jsonb_agg(e) from jsonb_array_elements(v_full) e
       where not (e ->> 'instructor_id' = v_karol::text and e ->> 'hour' = '14')));
    raise notice 'PASS 3c: zerowanie slotu z samym odwolanym zapisem przeszlo';
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_both, v_staff, v_full);
  exception when others then
    raise notice 'FAIL 3c: zerowanie slotu bez aktywnych zapisow odrzucone (%)', sqlstate;
    v_failures := v_failures + 1;
  end;

  -- 4. Wypisanie instruktora z aktywnym zapisem (Joanna) -> SB011.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_both, array[v_karol],
      jsonb_build_array(jsonb_build_object('instructor_id', v_karol, 'hour', 14, 'seats', 1)));
    raise notice 'FAIL 4: wypisanie instruktora z aktywnym zapisem przeszlo';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB011' then
    get stacked diagnostics v_detail = pg_exception_detail;
    if v_detail is not null and v_detail ~ '^\s*\{' and v_detail::jsonb = '{"bookings": 1}'::jsonb then
      raise notice 'PASS 4: wypisanie instruktora z aktywnym zapisem odrzucone (SB011), DETAIL: %', v_detail;
    else
      raise notice 'FAIL 4: DETAIL SB011 to % zamiast {"bookings": 1}', v_detail;
      v_failures := v_failures + 1;
    end if;
  end;
  select count(*) into v from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_joanna;
  select status into b from public.bookings where id = v_booking;
  if v = 6 and b.status = 'active' then
    raise notice 'PASS 4b: po odmowie Joanna ma wszystkie sloty, zapis aktywny';
  else
    raise notice 'FAIL 4b: po odmowie slotow Joanny=% zapis=%', v, b.status;
    v_failures := v_failures + 1;
  end if;

  -- 5. Wypisanie instruktora z samym odwolanym zapisem (Karol) przechodzi, a odwolany zapis
  --    istnieje dalej z dniem, instruktorem i godzina.
  v_joanna_only := (
    select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h, 'seats', 1))
    from generate_series(10, 15) h
  );
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 16, v_both, array[v_joanna], v_joanna_only);
    select count(*) into v from public.schedule_day_instructors where schedule_day_id = v_day and instructor_id = v_karol;
    select status, schedule_day_id, instructor_id, hour into b from public.bookings where id = v_cancelled_karol;
    if v = 0 and b.status = 'cancelled' and b.schedule_day_id = v_day and b.instructor_id = v_karol and b.hour = 14 then
      raise notice 'PASS 5: Karol wypisany, odwolany zapis przetrwal (dzien, Karol, 14)';
    else
      raise notice 'FAIL 5: Karol w dniu=% odwolany zapis: status=% instruktor=% godzina=%', v, b.status, b.instructor_id, b.hour;
      v_failures := v_failures + 1;
    end if;
  exception when others then
    raise notice 'FAIL 5: wypisanie instruktora z samym odwolanym zapisem odrzucone (%)', sqlstate;
    v_failures := v_failures + 1;
  end;

  -- 6. Skrocenie dnia nad odwolanym zapisem (Joanna o 15) przechodzi; zapis przetrwal.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 15, v_both, array[v_joanna],
      (select jsonb_agg(e) from jsonb_array_elements(v_joanna_only) e where e ->> 'hour' <> '15'));
    select close_hour into d from public.schedule_days where id = v_day;
    select status, schedule_day_id, instructor_id, hour into b from public.bookings where id = v_cancelled_hour;
    if d.close_hour = 15 and b.status = 'cancelled' and b.schedule_day_id = v_day and b.instructor_id = v_joanna and b.hour = 15 then
      raise notice 'PASS 6: skrocenie nad odwolanym zapisem przeszlo, zapis przetrwal (dzien, Joanna, 15)';
    else
      raise notice 'FAIL 6: close=% odwolany zapis: status=% godzina=%', d.close_hour, b.status, b.hour;
      v_failures := v_failures + 1;
    end if;
  exception when others then
    raise notice 'FAIL 6: skrocenie nad odwolanym zapisem odrzucone (%) - wyzwalacz liczy odwolane', sqlstate;
    v_failures := v_failures + 1;
  end;

  -- 7. Wypisanie konia przydzielonego do aktywnego zapisu (Bella) -> SB004.
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 15, array[v_kasztan], array[v_joanna],
      (select jsonb_agg(e) from jsonb_array_elements(v_joanna_only) e where e ->> 'hour' <> '15'));
    raise notice 'FAIL 7: wypisanie konia z przydzialem przeszlo';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB004' then
    raise notice 'PASS 7: wypisanie konia przydzielonego do aktywnego zapisu odrzucone (SB004)';
  end;
  select count(*) into v from public.schedule_day_horses where schedule_day_id = v_day and horse_id = v_bella;
  select horse_id into b from public.bookings where id = v_booking;
  if v = 1 and b.horse_id = v_bella then
    raise notice 'PASS 7b: po odmowie Bella w dniu i przy zapisie';
  else
    raise notice 'FAIL 7b: po odmowie Bella w dniu=% kon zapisu=%', v, b.horse_id;
    v_failures := v_failures + 1;
  end if;

  -- 8. Kasztan byl przydzielony do zapisu, ktory potem odwolano - odwolanie zwolnilo konia,
  --    wiec wypisanie przechodzi (suma limitow 1 = liczba koni).
  begin
    perform public.save_schedule_day(v_tomorrow, 10, 15, array[v_bella], array[v_joanna],
      (select jsonb_agg(e) from jsonb_array_elements(v_joanna_only) e where e ->> 'hour' <> '15'));
    select count(*) into v from public.schedule_day_horses where schedule_day_id = v_day and horse_id = v_kasztan;
    select status, horse_id into b from public.bookings where id = v_cancelled_hour;
    if v = 0 and b.status = 'cancelled' and b.horse_id is null then
      raise notice 'PASS 8: kon z odwolanego zapisu wypisany, odwolany zapis bez konia przetrwal';
    else
      raise notice 'FAIL 8: Kasztan w dniu=% odwolany zapis status=% kon=%', v, b.status, b.horse_id;
      v_failures := v_failures + 1;
    end if;
  exception when others then
    raise notice 'FAIL 8: wypisanie konia z odwolanego zapisu odrzucone (%)', sqlstate;
    v_failures := v_failures + 1;
  end;

  if v_failures > 0 then
    raise exception '% asercji nie przeszlo', v_failures;
  end if;
  raise notice '--- WSZYSTKIE ASERCJE OCHRONY ZAPISOW (WLASCICIEL) PRZESZLY ---';
end $$;

\echo '=== Ochrona zapisow przed zmiana grafiku: obcy wlasciciel ==='

-- Ta sama transakcja, inna persona: wlasciciel Stajni Nad Rzeka probuje zmienic dzien
-- Pod Debem wprost. Bezposredni zapis do tabel grafiku jest odebrany (42501).
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_day bigint := current_setting('app.day')::bigint;
begin
  begin
    update public.schedule_days set open_hour = 9 where id = v_day;
    raise exception 'FAIL 9: obcy wlasciciel zmienil cudzy dzien';
  exception when insufficient_privilege then
    raise notice 'PASS 9: obcy wlasciciel nie zmieni cudzego dnia (42501)';
  end;
end $$;

rollback;

\echo '--- WSZYSTKIE ASERCJE OCHRONY ZAPISOW PRZESZLY ---'
