-- Dowod reguly "zapisy nie gina ani nie wedruja" (S-02, faza 1).
--
-- Regula ma cztery przypadki: dwa odziedziczone po F-01 (odpiecie konia, usuniecie
-- dnia) i dwa dodane w S-02 (zawezenie godzin, zmiana daty). Skrypt sprawdza wszystkie
-- cztery plus dwie granice, ktore MUSZA przechodzic - inaczej straznik bylby za ciasny
-- i osrodek nie moglby wydluzyc dnia ani poprawic daty pustego grafiku.
--
-- Wymaga zaladowanego seeda (`npx supabase db reset`).
-- Uzycie:  docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/schedule_change_guardrails.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Ochrona zapisow przed zmiana grafiku ==='

begin;

do $$
declare
  v_day bigint;
  v_horse bigint;
  v_hour smallint;
  v_stable bigint;
  v_empty_day bigint;
  v_open smallint;
  v_close smallint;
  v_failures int := 0;
begin
  select b.schedule_day_id, b.horse_id, b.hour
    into v_day, v_horse, v_hour
  from public.bookings b
  where b.status = 'active'
  limit 1;

  if v_day is null then
    raise exception 'Brak danych demo - uruchom npx supabase db reset';
  end if;

  select sd.stable_id, sd.open_hour, sd.close_hour
    into v_stable, v_open, v_close
  from public.schedule_days sd
  where sd.id = v_day;

  raise notice 'setup: dzien=% godziny %-% aktywny zapis o %', v_day, v_open, v_close, v_hour;

  -- 1. Zawezenie godzin ponizej istniejacego zapisu musi odpasc.
  begin
    update public.schedule_days set close_hour = v_hour where id = v_day;
    raise notice 'FAIL 1: zawezenie godzin przeszlo mimo zapisu w odcietej godzinie';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB002' then
    raise notice 'PASS 1: zawezenie godzin pod zapisem odrzucone (SB002)';
  end;

  -- 2. GRANICA: rozszerzenie godzin musi przejsc - nikomu nie szkodzi.
  begin
    update public.schedule_days set open_hour = 8, close_hour = 20 where id = v_day;
    raise notice 'PASS 2: rozszerzenie godzin przy istniejacych zapisach przeszlo';
  exception when others then
    raise notice 'FAIL 2: rozszerzenie godzin odrzucone (%) - straznik jest za ciasny', sqlstate;
    v_failures := v_failures + 1;
  end;

  -- 3. Zmiana daty dnia z aktywnymi zapisami musi odpasc.
  begin
    update public.schedule_days set day = day + 7 where id = v_day;
    raise notice 'FAIL 3: zmiana daty przeszla, zapisy przewedrowalyby na inny termin';
    v_failures := v_failures + 1;
  exception when sqlstate 'SB001' then
    raise notice 'PASS 3: zmiana daty dnia z zapisami odrzucona (SB001)';
  end;

  -- 4. GRANICA: zmiana daty dnia BEZ zapisow musi przejsc.
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, current_date + 30, 9, 15)
  returning id into v_empty_day;

  begin
    update public.schedule_days set day = current_date + 31 where id = v_empty_day;
    raise notice 'PASS 4: zmiana daty pustego dnia przeszla';
  exception when others then
    raise notice 'FAIL 4: zmiana daty pustego dnia odrzucona (%) - straznik jest za ciasny', sqlstate;
    v_failures := v_failures + 1;
  end;

  -- 5. Odpiecie konia od dnia, w ktorym ma zapis (odziedziczone po F-01).
  begin
    delete from public.schedule_day_horses
     where schedule_day_id = v_day and horse_id = v_horse;
    raise notice 'FAIL 5: odpiecie konia z zapisem przeszlo';
    v_failures := v_failures + 1;
  exception when foreign_key_violation then
    raise notice 'PASS 5: odpiecie konia z zapisem odrzucone (23503)';
  end;

  -- 6. Usuniecie calego dnia z zapisami (odziedziczone po F-01, przez kaskade).
  begin
    delete from public.schedule_days where id = v_day;
    raise notice 'FAIL 6: usuniecie dnia z zapisami przeszlo';
    v_failures := v_failures + 1;
  exception when foreign_key_violation then
    raise notice 'PASS 6: usuniecie dnia z zapisami odrzucone (23503 przez kaskade)';
  end;

  if v_failures > 0 then
    raise exception '% asercji nie przeszlo', v_failures;
  end if;
  raise notice '--- WSZYSTKIE ASERCJE OCHRONY ZAPISOW PRZESZLY ---';
end $$;

rollback;
