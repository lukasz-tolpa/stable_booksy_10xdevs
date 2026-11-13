-- Dowod przydzialu konia i odwolania zapisu przez osrodek (#42, ADR-0002, GLOSSARY "Przydzial konia").
--
-- Osrodek przydziela, zmienia i cofa konia zwyklym UPDATE-em `horse_id` pod RLS; odwoluje
-- UPDATE-em statusu z `cancelled_by = 'stable'`. Reguly pilnuje baza:
--   * kon przy zapisie musi pracowac tego dnia                       -> 23503 bookings_assigned_horse_fkey
--   * kon ma najwyzej jeden aktywny zapis w godzinie dnia            -> 23505 bookings_horse_hour_key
--   * konia ma tylko zapis aktywny                                   -> 23514 bookings_horse_only_when_active_check
--   * przydzial nie ma progu czasu - dziala takze po terminie jazdy
--   * konia przydziela wylacznie osrodek: jezdziec nie przydzieli,
--     nie zmieni i nie cofnie przydzialu                             -> 42501 (wyzwalacz bookings_horse_assignment)
--   * osrodek wpisuje jako odwolujacego wylacznie siebie             -> 42501 (wyzwalacz bookings_cancellation)
--   * odwolanie przez osrodek zwalnia konia i miejsce - jezdziec zapisuje sie ponownie na ten slot
--   * wypisanie konia z przydzialem do aktywnego zapisu              -> SB004 (save_schedule_day)
--   * izolacja: osrodek przydziela i odwoluje tylko we wlasnej stadninie, jezdziec nie odwola
--     cudzego zapisu (RLS -> 0 wierszy).
-- Prog "godzina juz sie zaczela" dla odwolania zyje w aplikacji (src/pages/api/bookings/stable-cancel.ts).
--
-- Seed (jutro, Pod Dębem 10-16, Bella + Kasztan; Iskra ma wolne): Joanna Wrona 1 miejsce
-- w kazdej godzinie, Karol Jasny nie pracuje; zapis Anny u Joanny o 11. Nad Rzeką: Piotr
-- u Tomasza Lisa o 10.
--
-- Wymaga swiezego seeda (`npx supabase db reset` tego samego dnia).
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/stable_booking_actions.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Przydzial konia i odwolanie przez osrodek: setup (postgres) ==='

begin;

do $$
declare
  v_stable bigint;
  v_day bigint;
  v_past_day bigint;
  v_joanna bigint;
  v_karol bigint;
  v_bella bigint;
  v_kasztan bigint;
  v_iskra bigint;
  v_anna_booking bigint;
  v_piotr_booking bigint;
  v_karol_booking bigint;
  v_past_booking bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors where stable_id = v_stable and name = 'Joanna Wrona';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  select id into v_bella from public.horses where stable_id = v_stable and name = 'Bella';
  select id into v_kasztan from public.horses where stable_id = v_stable and name = 'Kasztan';
  select id into v_iskra from public.horses where stable_id = v_stable and name = 'Iskra';
  select id into v_anna_booking from public.bookings
  where schedule_day_id = v_day and instructor_id = v_joanna and hour = 11 and status = 'active'
    and rider_id = '33333333-3333-3333-3333-333333333333';
  select b.id into v_piotr_booking from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  where b.rider_id = '44444444-4444-4444-4444-444444444444' and sd.day = current_date + 1 and b.status = 'active';

  if v_day is null or v_karol is null or v_anna_booking is null or v_piotr_booking is null then
    raise exception 'Brak danych seeda albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Karol dochodzi do dnia jako postgres (regula sumy: 2 konie) z 1 miejscem o 11,
  -- a Piotr zapisuje sie do niego - druga jazda o 11 obok Anny u Joanny.
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select v_day, v_karol, h, case when h = 11 then 1 else 0 end from generate_series(10, 15) h;
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day, v_karol, 11, '44444444-4444-4444-4444-444444444444')
  returning id into v_karol_booking;

  -- Dzien miniony z jazda bez konia (grafiku na dzien miniony nie zapisze funkcja - postgres).
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, current_date - 3, 10, 12)
  returning id into v_past_day;
  insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
  values (v_past_day, v_bella, v_stable);
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_past_day, v_joanna, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  values (v_past_day, v_joanna, 10, 1), (v_past_day, v_joanna, 11, 0);
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_past_day, v_joanna, 10, '33333333-3333-3333-3333-333333333333')
  returning id into v_past_booking;

  perform set_config('app.day', v_day::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.bella', v_bella::text, true);
  perform set_config('app.kasztan', v_kasztan::text, true);
  perform set_config('app.iskra', v_iskra::text, true);
  perform set_config('app.anna_booking', v_anna_booking::text, true);
  perform set_config('app.piotr_booking', v_piotr_booking::text, true);
  perform set_config('app.karol_booking', v_karol_booking::text, true);
  perform set_config('app.past_booking', v_past_booking::text, true);
end $$;

set local role authenticated;

\echo '=== Osrodek Pod Dębem: przydzial konia (RLS) ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_bella bigint := current_setting('app.bella')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v_iskra bigint := current_setting('app.iskra')::bigint;
  v_anna bigint := current_setting('app.anna_booking')::bigint;
  v_karol_booking bigint := current_setting('app.karol_booking')::bigint;
  v_past bigint := current_setting('app.past_booking')::bigint;
  v_piotr_rzeka bigint := current_setting('app.piotr_booking')::bigint;
  v int;
  v_horse bigint;
  v_constraint text;
begin
  -- 1. Przydzial konia pracujacego tego dnia.
  update public.bookings set horse_id = v_bella where id = v_anna;
  get diagnostics v = row_count;
  select horse_id into v_horse from public.bookings where id = v_anna;
  if v = 1 and v_horse = v_bella then
    raise notice 'PASS 1: osrodek przydzielil konia do zapisu';
  else
    raise exception 'FAIL 1: row_count=% kon=%', v, v_horse;
  end if;

  -- 2. Zmiana przydzialu na innego konia.
  update public.bookings set horse_id = v_kasztan where id = v_anna;
  select horse_id into v_horse from public.bookings where id = v_anna;
  if v_horse = v_kasztan then
    raise notice 'PASS 2: osrodek zmienil przydzielonego konia';
  else
    raise exception 'FAIL 2: kon=%', v_horse;
  end if;

  -- 3. Kon niepracujacy tego dnia (Iskra) -> 23503.
  begin
    update public.bookings set horse_id = v_iskra where id = v_anna;
    raise exception 'FAIL 3: przydzielono konia, ktory nie pracuje tego dnia';
  exception when foreign_key_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'bookings_assigned_horse_fkey' then
      raise exception 'FAIL 3: 23503 na % zamiast bookings_assigned_horse_fkey', v_constraint;
    end if;
    raise notice 'PASS 3: kon spoza dnia odrzucony (23503)';
  end;

  -- 4. Kon zajety w tej godzinie: Kasztan ma Anne o 11, Piotr u Karola tez o 11 -> 23505.
  begin
    update public.bookings set horse_id = v_kasztan where id = v_karol_booking;
    raise exception 'FAIL 4: ten sam kon w dwoch aktywnych zapisach o tej samej godzinie';
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'bookings_horse_hour_key' then
      raise exception 'FAIL 4: 23505 na % zamiast bookings_horse_hour_key', v_constraint;
    end if;
    raise notice 'PASS 4: kon zajety w tej godzinie odrzucony (23505)';
  end;

  -- 5. ...a wolny kon w tej samej godzinie przechodzi.
  update public.bookings set horse_id = v_bella where id = v_karol_booking;
  raise notice 'PASS 5: drugi zapis tej godziny dostal innego konia';

  -- 6. Cofniecie przydzialu zostawia zapis aktywny, bez konia.
  update public.bookings set horse_id = null where id = v_karol_booking;
  select horse_id into v_horse from public.bookings where id = v_karol_booking;
  if v_horse is null then
    raise notice 'PASS 6: osrodek cofnal przydzial konia';
  else
    raise exception 'FAIL 6: kon=%', v_horse;
  end if;

  -- 7. Przydzial po terminie jazdy - baza nie ma progu czasu.
  update public.bookings set horse_id = v_bella where id = v_past;
  get diagnostics v = row_count;
  if v = 1 then
    raise notice 'PASS 7: przydzial konia po terminie jazdy przeszedl';
  else
    raise exception 'FAIL 7: przydzial po terminie dotknal % wierszy', v;
  end if;

  -- 8. Izolacja: zapis w cudzej stadninie (Piotr Nad Rzeką) jest niewidoczny dla UPDATE.
  update public.bookings set horse_id = v_bella where id = v_piotr_rzeka;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 8: osrodek przydzielil konia w cudzej stadninie (% wierszy)', v;
  end if;
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable'
  where id = v_piotr_rzeka;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 8: osrodek odwolal zapis w cudzej stadninie (% wierszy)', v;
  end if;
  raise notice 'PASS 8: osrodek nie przydzieli konia ani nie odwola zapisu w cudzej stadninie';
end $$;

\echo '=== Jezdziec Anna: przydzial konia nalezy do osrodka (RLS) ==='

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v_bella bigint := current_setting('app.bella')::bigint;
  v_anna bigint := current_setting('app.anna_booking')::bigint;
  v_karol_booking bigint := current_setting('app.karol_booking')::bigint;
  v int;
begin
  -- 9. Jezdziec nie zmieni przydzialu wlasnego zapisu (ma Kasztana) ani go nie cofnie.
  begin
    update public.bookings set horse_id = v_bella where id = v_anna;
    raise exception 'FAIL 9a: jezdziec zmienil przydzial konia';
  exception when insufficient_privilege then
    raise notice 'PASS 9a: jezdziec nie zmieni przydzialu konia (42501)';
  end;
  begin
    update public.bookings set horse_id = null where id = v_anna;
    raise exception 'FAIL 9b: jezdziec cofnal przydzial konia';
  exception when insufficient_privilege then
    raise notice 'PASS 9b: jezdziec nie cofnie przydzialu konia (42501)';
  end;

  -- 10. Jezdziec nie odwola cudzego zapisu (Piotr u Karola) - RLS daje 0 wierszy.
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
  where id = v_karol_booking;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 10: jezdziec odwolal cudzy zapis (% wierszy)', v;
  end if;
  raise notice 'PASS 10: jezdziec nie odwola cudzego zapisu';
end $$;

\echo '=== Osrodek Pod Dębem: odwolanie zapisu (RLS) ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v_anna bigint := current_setting('app.anna_booking')::bigint;
  v int;
  b record;
begin
  -- 11. Osrodek nie wpisze jezdzca jako odwolujacego.
  begin
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
    where id = v_anna;
    raise exception 'FAIL 11: osrodek wpisal jezdzca jako odwolujacego';
  exception when insufficient_privilege then
    raise notice 'PASS 11: osrodek nie wpisze jezdzca jako odwolujacego (42501)';
  end;

  -- 12. Odwolanie przez osrodek: zapamietuje osrodek i czysci przydzial konia (Anna miala Kasztana).
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable'
  where id = v_anna and status = 'active';
  get diagnostics v = row_count;
  select status, horse_id, cancelled_by into b from public.bookings where id = v_anna;
  if v = 1 and b.status = 'cancelled' and b.horse_id is null and b.cancelled_by = 'stable' then
    raise notice 'PASS 12: odwolanie przez osrodek zapamietuje osrodek i zwalnia konia';
  else
    raise exception 'FAIL 12: row_count=% status=% kon=% kto_odwolal=%', v, b.status, b.horse_id, b.cancelled_by;
  end if;

  -- 13. Konia ma tylko aktywny zapis: przydzial do odwolanego zapisu -> 23514.
  begin
    update public.bookings set horse_id = v_kasztan where id = v_anna;
    raise exception 'FAIL 13: kon przydzielony do odwolanego zapisu';
  exception when check_violation then
    raise notice 'PASS 13: przydzial konia do odwolanego zapisu odrzucony (23514)';
  end;
end $$;

\echo '=== Jezdziec Anna: ponowny zapis na zwolnione miejsce (RLS) ==='

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v_day bigint := current_setting('app.day')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
begin
  -- 14. Odwolanie przez osrodek zwolnilo miejsce (Joanna o 11 ma 1 miejsce) - Anna wraca na ten slot.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day, v_joanna, 11, '33333333-3333-3333-3333-333333333333');
  raise notice 'PASS 14: jezdziec odwolany przez osrodek zapisuje sie ponownie na ten sam slot';
end $$;

\echo '=== Osrodek Pod Dębem: wypisanie konia z przydzialem (save_schedule_day) ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_bella bigint := current_setting('app.bella')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v_iskra bigint := current_setting('app.iskra')::bigint;
  v_karol_booking bigint := current_setting('app.karol_booking')::bigint;
  v_karol bigint;
  v_seats jsonb;
  v_horse bigint;
begin
  select instructor_id into v_karol from public.bookings where id = v_karol_booking;
  -- Pelny dotychczasowy stan limitow: Joanna 1 miejsce w kazdej godzinie, Karol 1 o 11.
  v_seats := (
    select jsonb_agg(jsonb_build_object('instructor_id', v_joanna, 'hour', h, 'seats', 1))
    from generate_series(10, 15) h
  ) || jsonb_build_array(jsonb_build_object('instructor_id', v_karol, 'hour', 11, 'seats', 1));

  -- 15. Kasztan przydzielony do aktywnego zapisu Piotra -> wypisanie Kasztana odrzucone (SB004),
  --     nawet gdy Iskra wchodzi na jego miejsce.
  update public.bookings set horse_id = v_kasztan where id = v_karol_booking;
  begin
    perform public.save_schedule_day(current_date + 1, 10, 16, array[v_bella, v_iskra], array[v_joanna, v_karol], v_seats);
    raise exception 'FAIL 15: wypisano konia przydzielonego do aktywnego zapisu';
  exception when sqlstate 'SB004' then
    raise notice 'PASS 15: wypisanie konia z przydzialem odrzucone (SB004)';
  end;

  -- 16. Po cofnieciu przydzialu ten sam zapis grafiku przechodzi.
  update public.bookings set horse_id = null where id = v_karol_booking;
  perform public.save_schedule_day(current_date + 1, 10, 16, array[v_bella, v_iskra], array[v_joanna, v_karol], v_seats);
  select horse_id into v_horse from public.schedule_day_horses
  where schedule_day_id = current_setting('app.day')::bigint and horse_id = v_kasztan;
  if v_horse is null then
    raise notice 'PASS 16: po cofnieciu przydzialu kon daje sie wypisac z dnia';
  else
    raise exception 'FAIL 16: Kasztan nadal w dniu';
  end if;
end $$;

rollback;

\echo '--- WSZYSTKIE ASERCJE PRZYDZIALU KONIA I ODWOLANIA PRZEZ OSRODEK PRZESZLY ---'
