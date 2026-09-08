-- Dowod reguly "zapisy nie gina ani nie wedruja" (PRD, Open Question #2, rozstrzygniete
-- 2026-08-11 i doprecyzowane 2026-09-08).
--
-- Zmiana grafiku kolidujaca z zapisem jest odrzucana, a zapis zostaje nietkniety.
-- Regula ma cztery przypadki: dwa odziedziczone po F-01 (odpiecie konia, usuniecie dnia -
-- FK ON DELETE RESTRICT, 23503) i dwa dodane w S-02 (zawezenie godzin SB002, zmiana daty
-- SB001 - trigger schedule_days_protect_bookings). Skrypt sprawdza wszystkie cztery,
-- po kazdej odmowie CZYTA ZAPIS PONOWNIE, a do tego trzy granice, ktore MUSZA przechodzic
-- (rozszerzenie godzin, zmiana daty pustego dnia, zawezenie nad odwolanym zapisem) -
-- inaczej straznik bylby za ciasny.
--
-- Odwolane zapisy (decyzja 2026-09-08, utrwalona tutaj i w PRD):
--   * NIE blokuja zawezenia godzin ani zmiany daty (trigger liczy tylko status = 'active'),
--   * ALE przypinaja konia do dnia: przydzial (dzien, kon), do ktorego odnosi sie
--     jakikolwiek zapis - aktywny czy odwolany - nie moze zostac usuniety (FK RESTRICT nie
--     filtruje po statusie). Historia zapisow zostaje przy koniu. Zmiana tego zachowania
--     wymaga zmiany schematu i przypadku 8 ponizej.
--
-- Jako kto: mutacje ida przez RLS jako wlasciciel "Stadniny Pod Debem" (sub 1111...),
-- bo tylko tak test dowodzi, ze wlasciciel w ogole dociera do triggera (przy zlym `sub`
-- UPDATE dotyka 0 wierszy i wyglada jak odmowa). Przygotowanie danych idzie jako
-- postgres; na koniec jedna proba jako obcy wlasciciel (2222...) musi dotknac 0 wierszy.
--
-- Wymaga swiezego seeda (`npx supabase db reset` tego samego dnia - dni z seeda musza byc na jutro).
-- Uzycie:  npm run test:db   (wszystkie dowody; runner sam dobiera psql z hosta albo z kontenera)
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/schedule_change_guardrails.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Ochrona zapisow przed zmiana grafiku: setup (postgres) ==='

begin;

do $$
declare
  v_stable bigint;
  v_day bigint;
  v_bella bigint;
  v_kasztan bigint;
  v_booking bigint;
  v_cancelled bigint;
begin
  -- Deterministyczny wybor: dzien Pod Debem na jutro, po owner_id z seeda.
  select s.id into v_stable
  from public.stables s
  where s.owner_id = '11111111-1111-1111-1111-111111111111';

  select sd.id into v_day
  from public.schedule_days sd
  where sd.stable_id = v_stable and sd.day = current_date + 1;

  select h.id into v_bella from public.horses h where h.stable_id = v_stable and h.name = 'Bella';
  select h.id into v_kasztan from public.horses h where h.stable_id = v_stable and h.name = 'Kasztan';

  select b.id into v_booking
  from public.bookings b
  where b.schedule_day_id = v_day and b.horse_id = v_bella and b.hour = 11
    and b.status = 'active'
    and b.rider_id = '33333333-3333-3333-3333-333333333333';

  if v_stable is null or v_day is null or v_bella is null or v_kasztan is null or v_booking is null then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Odwolany zapis Anny na Kasztanie o 12: potrzebny do granicy 7 i przypadku 8.
  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id, status, cancelled_at)
  values (v_day, v_kasztan, 12, '33333333-3333-3333-3333-333333333333', 'cancelled', now())
  returning id into v_cancelled;

  -- Id-y przekazujemy do blokow wlasciciela przez GUC transakcji (widoczne po set role).
  perform set_config('app.stable', v_stable::text, true);
  perform set_config('app.day', v_day::text, true);
  perform set_config('app.bella', v_bella::text, true);
  perform set_config('app.kasztan', v_kasztan::text, true);
  perform set_config('app.booking', v_booking::text, true);
  perform set_config('app.cancelled', v_cancelled::text, true);

  raise notice 'setup: dzien=% (%), Bella@11 aktywny id=%, Kasztan@12 odwolany id=%',
    v_day, current_date + 1, v_booking, v_cancelled;
end $$;

\echo '=== Ochrona zapisow przed zmiana grafiku: wlasciciel Pod Debem (RLS) ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_stable bigint := current_setting('app.stable')::bigint;
  v_day bigint := current_setting('app.day')::bigint;
  v_bella bigint := current_setting('app.bella')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v_booking bigint := current_setting('app.booking')::bigint;
  v_cancelled bigint := current_setting('app.cancelled')::bigint;
  v_empty_day bigint;
  v int;
  v_failures int := 0;
  b record;
  d record;
begin
  -- 1. Zawezenie godzin ponizej istniejacego zapisu musi odpasc...
  begin
    update public.schedule_days set close_hour = 11 where id = v_day;
    raise notice 'FAIL 1: zawezenie godzin przeszlo mimo zapisu w odcietej godzinie';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB002' then
    raise notice 'PASS 1: zawezenie godzin pod zapisem odrzucone (SB002)';
  end;

  -- ...a zapis i dzien maja zostac dokladnie takie, jakie byly.
  select status, hour, schedule_day_id, horse_id into b from public.bookings where id = v_booking;
  select open_hour, close_hour into d from public.schedule_days where id = v_day;
  if b.status = 'active' and b.hour = 11 and b.schedule_day_id = v_day and b.horse_id = v_bella
     and d.open_hour = 10 and d.close_hour = 16 then
    raise notice 'PASS 1b: po odmowie zapis nietkniety (active, 11), dzien nadal 10-16';
  else
    raise notice 'FAIL 1b: po odmowie zapis lub dzien zmienione: status=% hour=% dzien=%-%', b.status, b.hour, d.open_hour, d.close_hour;
    v_failures := v_failures + 1;
  end if;

  -- 2. GRANICA: rozszerzenie godzin musi przejsc - i musi realnie dotknac wiersza
  --    (row_count = 1 dowodzi, ze RLS wpuscilo wlasciciela do UPDATE).
  begin
    update public.schedule_days set open_hour = 8, close_hour = 20 where id = v_day;
    get diagnostics v = row_count;
    if v = 1 then
      raise notice 'PASS 2: rozszerzenie godzin przy istniejacych zapisach przeszlo (row_count=1)';
    else
      raise notice 'FAIL 2: rozszerzenie godzin dotknelo % wierszy - RLS nie wpuscilo wlasciciela', v;
      v_failures := v_failures + 1;
    end if;
    update public.schedule_days set open_hour = 10, close_hour = 16 where id = v_day;
  exception when others then
    raise notice 'FAIL 2: rozszerzenie godzin odrzucone (%) - straznik jest za ciasny', sqlstate;
    v_failures := v_failures + 1;
  end;

  -- 3. Zmiana daty dnia z aktywnymi zapisami musi odpasc; zapis zostaje na swoim dniu.
  begin
    update public.schedule_days set day = day + 7 where id = v_day;
    raise notice 'FAIL 3: zmiana daty przeszla, zapisy przewedrowalyby na inny termin';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB001' then
    raise notice 'PASS 3: zmiana daty dnia z zapisami odrzucona (SB001)';
  end;
  select day into d from public.schedule_days where id = v_day;
  if d.day = current_date + 1 then
    raise notice 'PASS 3b: po odmowie dzien nadal na jutro';
  else
    raise notice 'FAIL 3b: po odmowie data dnia zmieniona na %', d.day;
    v_failures := v_failures + 1;
  end if;

  -- 4. GRANICA: zmiana daty dnia BEZ zapisow musi przejsc (insert jako wlasciciel).
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

  -- 5. Odpiecie konia od dnia, w ktorym ma aktywny zapis (FK RESTRICT z F-01).
  begin
    delete from public.schedule_day_horses where schedule_day_id = v_day and horse_id = v_bella;
    raise notice 'FAIL 5: odpiecie konia z zapisem przeszlo';
    v_failures := v_failures + 1;
  exception when foreign_key_violation then
    raise notice 'PASS 5: odpiecie konia z aktywnym zapisem odrzucone (23503)';
  end;
  select count(*) into v from public.schedule_day_horses where schedule_day_id = v_day and horse_id = v_bella;
  select status into b from public.bookings where id = v_booking;
  if v = 1 and b.status = 'active' then
    raise notice 'PASS 5b: po odmowie przydzial i zapis nietkniete';
  else
    raise notice 'FAIL 5b: po odmowie przydzial=% zapis=%', v, b.status;
    v_failures := v_failures + 1;
  end if;

  -- 6. Usuniecie calego dnia z zapisami (kaskada -> schedule_day_horses -> RESTRICT).
  begin
    delete from public.schedule_days where id = v_day;
    raise notice 'FAIL 6: usuniecie dnia z zapisami przeszlo';
    v_failures := v_failures + 1;
  exception when foreign_key_violation then
    raise notice 'PASS 6: usuniecie dnia z zapisami odrzucone (23503 przez kaskade)';
  end;

  -- 7. GRANICA: odwolany zapis NIE blokuje zawezenia godzin. close_hour = 12 odcina tylko
  --    odwolany Kasztan@12; aktywny Bella@11 zostaje w zakresie -> musi przejsc.
  begin
    update public.schedule_days set close_hour = 12 where id = v_day;
    get diagnostics v = row_count;
    select status, hour into b from public.bookings where id = v_cancelled;
    if v = 1 and b.status = 'cancelled' and b.hour = 12 then
      raise notice 'PASS 7: zawezenie nad odwolanym zapisem przeszlo, odwolany zapis nietkniety';
    else
      raise notice 'FAIL 7: zawezenie nad odwolanym zapisem: row_count=% status=% hour=%', v, b.status, b.hour;
      v_failures := v_failures + 1;
    end if;
    update public.schedule_days set close_hour = 16 where id = v_day;
  exception when others then
    raise notice 'FAIL 7: zawezenie nad odwolanym zapisem odrzucone (%) - trigger liczy odwolane', sqlstate;
    v_failures := v_failures + 1;
  end;

  -- 8. Odwolany zapis PRZYPINA konia do dnia (decyzja 2026-09-08): przydzial Kasztana ma
  --    tylko odwolany zapis, a mimo to nie da sie go usunac - historia zostaje przy koniu.
  begin
    delete from public.schedule_day_horses where schedule_day_id = v_day and horse_id = v_kasztan;
    raise notice 'FAIL 8: odpiecie konia z odwolanym zapisem przeszlo - zmieniono semantyke FK RESTRICT';
    v_failures := v_failures + 1;
  exception when foreign_key_violation then
    raise notice 'PASS 8: odpiecie konia z samym odwolanym zapisem odrzucone (23503, historia zostaje przy koniu)';
  end;
  select status into b from public.bookings where id = v_cancelled;
  if b.status = 'cancelled' then
    raise notice 'PASS 8b: odwolany zapis nietkniety';
  else
    raise notice 'FAIL 8b: odwolany zapis zmienil status na %', b.status;
    v_failures := v_failures + 1;
  end if;

  if v_failures > 0 then
    raise exception '% asercji nie przeszlo', v_failures;
  end if;
  raise notice '--- WSZYSTKIE ASERCJE OCHRONY ZAPISOW (WLASCICIEL) PRZESZLY ---';
end $$;

\echo '=== Ochrona zapisow przed zmiana grafiku: obcy wlasciciel (RLS) ==='

-- Ta sama transakcja, inna persona: wlasciciel Stajni Nad Rzeka probuje zmienic dzien
-- Pod Debem. RLS filtruje wiersz PRZED triggerem: 0 wierszy i zaden wyjatek.
-- Celowo ROZSZERZENIE godzin (trigger je przepuszcza), zeby asercja mierzyla wylacznie RLS:
-- z wylaczonym RLS UPDATE przeszedlby (row_count = 1) i to jest FAIL, a nie odmowa triggera.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_day bigint := current_setting('app.day')::bigint;
  v int;
begin
  update public.schedule_days set open_hour = 9 where id = v_day;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 9: obcy wlasciciel zmienil % wierszy cudzego dnia - RLS nie filtruje', v;
  end if;
  raise notice 'PASS 9: obcy wlasciciel dotknal 0 wierszy cudzego dnia (RLS filtruje przed triggerem)';
end $$;

rollback;

\echo '--- WSZYSTKIE ASERCJE OCHRONY ZAPISOW PRZESZLY ---'
