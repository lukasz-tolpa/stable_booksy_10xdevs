-- Dowod zapisu na miejsce u instruktora (#41, ADR-0002, GLOSSARY "Slot", "Limit miejsc").
--
-- Jezdziec zapisuje sie na slot (dzien grafiku, instruktor, godzina) zwyklym INSERT-em pod RLS;
-- reguly pilnuje baza:
--   * aktywnych zapisow w slocie nie wiecej niz limit miejsc        -> SB009 (wyzwalacz)
--   * slot z limitem zero jest pelny od poczatku                     -> SB009
--   * jeden aktywny zapis jezdzca na godzine dnia, takze u innego
--     instruktora                                                    -> 23505 bookings_rider_hour_key
--   * instruktor niepracujacy tego dnia (brak slotu)                 -> 23503
--   * godzina poza zakresem pracy dnia                               -> 23514
--   * "kto odwolal" istnieje wtedy i tylko wtedy, gdy zapis jest odwolany (CHECK), a jezdziec
--     moze wpisac tam wylacznie siebie                                -> 42501 z wyzwalacza
--   * odwolanie czysci przydzial konia; odwolanego zapisu nie da sie przywrocic
--   * jezdziec nie zmieni slotu ani konia istniejacego zapisu (uprawnienia kolumnowe, 42501)
--   * kon przy zapisie (opcjonalny) musi pracowac tego dnia i ma jeden aktywny zapis w godzinie.
-- Rownoleglosc zapisow na ostatnie miejsce: supabase/tests/concurrent_seat_booking.sh.
--
-- Seed (jutro, Pod Debem 10-16, Bella + Kasztan): Joanna Wrona 1 miejsce w kazdej godzinie,
-- Karol Jasny nie pracuje; zapis Anny u Joanny o 11.
--
-- Wymaga swiezego seeda (`npx supabase db reset` tego samego dnia).
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/booking_seats.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Zapis na miejsce: setup (postgres) ==='

begin;

do $$
declare
  v_stable bigint;
  v_day bigint;
  v_joanna bigint;
  v_karol bigint;
  v_kasztan bigint;
  v_iskra bigint;
  v_anna_booking bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors where stable_id = v_stable and name = 'Joanna Wrona';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  select id into v_kasztan from public.horses where stable_id = v_stable and name = 'Kasztan';
  select id into v_iskra from public.horses where stable_id = v_stable and name = 'Iskra';
  select id into v_anna_booking from public.bookings
  where schedule_day_id = v_day and instructor_id = v_joanna and hour = 11 and status = 'active'
    and rider_id = '33333333-3333-3333-3333-333333333333';

  if v_day is null or v_joanna is null or v_karol is null or v_anna_booking is null then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Karol dochodzi do dnia jako postgres (z pominieciem funkcji, ale z zachowaniem reguly
  -- sumy: 2 konie): 1 miejsce o 11, zero o 12, reszta godzin zero.
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select v_day, v_karol, h, case when h = 11 then 1 else 0 end from generate_series(10, 15) h;

  perform set_config('app.day', v_day::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.karol', v_karol::text, true);
  perform set_config('app.kasztan', v_kasztan::text, true);
  perform set_config('app.iskra', v_iskra::text, true);
  perform set_config('app.anna_booking', v_anna_booking::text, true);
end $$;

\echo '=== Zapis na miejsce: jezdziec Anna (RLS) ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  c_anna constant uuid := '33333333-3333-3333-3333-333333333333';
  v_day bigint := current_setting('app.day')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v_anna_booking bigint := current_setting('app.anna_booking')::bigint;
  v_id bigint;
  v int;
  b record;
  v_constraint text;
begin
  -- 1. Wolne miejsce: zapis przechodzi i nie ma konia.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day, v_joanna, 13, c_anna)
  returning id into v_id;
  select status, horse_id, cancelled_by into b from public.bookings where id = v_id;
  if b.status = 'active' and b.horse_id is null and b.cancelled_by is null then
    raise notice 'PASS 1: zapis na wolne miejsce przeszedl, bez konia';
  else
    raise exception 'FAIL 1: zapis status=% kon=% kto_odwolal=%', b.status, b.horse_id, b.cancelled_by;
  end if;
  perform set_config('app.anna_13', v_id::text, true);

  -- 2. Drugi zapis tego samego jezdzca na te sama godzine u INNEGO instruktora (Karol o 11,
  --    Anna ma juz Joanne o 11) -> 23505 na indeksie jezdziec x godzina.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (v_day, v_karol, 11, c_anna);
    raise exception 'FAIL 2: drugi zapis jezdzca na ta sama godzine przeszedl';
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'bookings_rider_hour_key' then
      raise exception 'FAIL 2: 23505 na % zamiast bookings_rider_hour_key', v_constraint;
    end if;
    raise notice 'PASS 2: drugi zapis na ta sama godzine u innego instruktora odrzucony (23505)';
  end;

  -- 3. Instruktor nie pracuje tego dnia o tej godzinie poza siatka: godzina poza zakresem -> 23514.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (v_day, v_joanna, 16, c_anna);
    raise exception 'FAIL 3: zapis poza godzinami pracy przeszedl';
  exception when check_violation then
    raise notice 'PASS 3: zapis poza godzinami pracy odrzucony (23514)';
  end;

  -- 4. Odwolanie przez jezdzca z wpisanym osrodkiem jako odwolujacym -> 42501.
  begin
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable'
    where id = v_anna_booking;
    raise exception 'FAIL 4: jezdziec wpisal osrodek jako odwolujacego';
  exception when insufficient_privilege then
    raise notice 'PASS 4: jezdziec nie wpisze osrodka jako odwolujacego (42501)';
  end;

  -- 5. Odwolanie bez "kto odwolal" -> CHECK spojnosci (23514).
  begin
    update public.bookings set status = 'cancelled', cancelled_at = now() where id = v_anna_booking;
    raise exception 'FAIL 5: odwolanie bez pola "kto odwolal" przeszlo';
  exception when check_violation then
    raise notice 'PASS 5: odwolanie bez pola "kto odwolal" odrzucone (23514)';
  end;

  -- 6. Odwolanie przez jezdzca zapisuje jezdzca...
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
  where id = v_anna_booking;
  get diagnostics v = row_count;
  select status, cancelled_by into b from public.bookings where id = v_anna_booking;
  if v = 1 and b.status = 'cancelled' and b.cancelled_by = 'rider' then
    raise notice 'PASS 6: odwolanie przez jezdzca zapisuje jezdzca';
  else
    raise exception 'FAIL 6: row_count=% status=% kto_odwolal=%', v, b.status, b.cancelled_by;
  end if;

  -- 7. ...i zwalnia godzine: zapis u innego instruktora o 11 przechodzi.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day, v_karol, 11, c_anna);
  raise notice 'PASS 7: po odwolaniu jezdziec zapisuje sie ponownie na te godzine';

  -- 8. Odwolanego zapisu nie da sie przywrocic ani przepisac odwolujacego.
  begin
    update public.bookings set status = 'active', cancelled_at = null, cancelled_by = null
    where id = v_anna_booking;
    raise exception 'FAIL 8: odwolany zapis przywrocony';
  exception when insufficient_privilege then
    raise notice 'PASS 8: odwolanego zapisu nie da sie przywrocic (42501)';
  end;

  -- 9. Jezdziec nie przeniesie zapisu na inny slot ani nie wskaze konia (uprawnienia kolumnowe).
  begin
    update public.bookings set hour = 14 where id = current_setting('app.anna_13')::bigint;
    raise exception 'FAIL 9: jezdziec przeniosl zapis na inna godzine';
  exception when insufficient_privilege then
    raise notice 'PASS 9a: jezdziec nie zmieni godziny zapisu (42501)';
  end;
  begin
    update public.bookings set horse_id = current_setting('app.kasztan')::bigint
    where id = current_setting('app.anna_13')::bigint;
    raise exception 'FAIL 9: jezdziec przydzielil sobie konia';
  exception when insufficient_privilege then
    raise notice 'PASS 9b: jezdziec nie przydzieli sobie konia (42501)';
  end;

  -- 10. Jezdziec nie wstawi od razu odwolanego zapisu (polityka INSERT wymaga aktywnego).
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, cancelled_at, cancelled_by)
    values (v_day, v_joanna, 14, c_anna, 'cancelled', now(), 'rider');
    raise exception 'FAIL 10: jezdziec wstawil odwolany zapis';
  exception when insufficient_privilege then
    raise notice 'PASS 10: wstawienie odwolanego zapisu odrzucone przez RLS';
  end;
end $$;

\echo '=== Zapis na miejsce: jezdziec Piotr (RLS) ==='

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

do $$
declare
  c_piotr constant uuid := '44444444-4444-4444-4444-444444444444';
  v_day bigint := current_setting('app.day')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
  v int;
begin
  -- 11. Slot pelny: Joanna o 13 ma 1 miejsce, zajete przez Anne -> SB009.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (v_day, v_joanna, 13, c_piotr);
    raise exception 'FAIL 11: zapis ponad limit miejsc przeszedl';
  exception when sqlstate 'SB009' then
    raise notice 'PASS 11: zapis ponad limit miejsc odrzucony (SB009)';
  end;

  -- 12. Slot z limitem zero (Karol o 12) -> SB009.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (v_day, v_karol, 12, c_piotr);
    raise exception 'FAIL 12: zapis na slot z limitem zero przeszedl';
  exception when sqlstate 'SB009' then
    raise notice 'PASS 12: zapis na slot z limitem zero odrzucony (SB009)';
  end;

  -- 13. Instruktor niepracujacy tego dnia: Tomasz Lis (Nad Rzeka) nie ma slotu w dniu Pod Debem.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    select v_day, i.id, 13, c_piotr from public.instructors i where i.name = 'Tomasz Lis';
    raise exception 'FAIL 13: zapis do instruktora niepracujacego tego dnia przeszedl';
  exception when foreign_key_violation then
    raise notice 'PASS 13: zapis do instruktora niepracujacego tego dnia odrzucony (23503)';
  end;

  -- 14. Wolne miejsce u Joanny o 12 - limit nie blokuje innych slotow.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day, v_joanna, 12, c_piotr);
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 14: zapis na wolny slot dotknal % wierszy', v;
  end if;
  raise notice 'PASS 14: zapis na wolny slot innego jezdzca przeszedl';
end $$;

\echo '=== Zapis na miejsce: kon przy zapisie i spojnosc pol (postgres) ==='

reset role;
-- Bez claims private.current_role() jest NULL - jak dla migracji i danych demo.
set local request.jwt.claims = '';

do $$
declare
  v_day bigint := current_setting('app.day')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v_iskra bigint := current_setting('app.iskra')::bigint;
  v_anna_13 bigint := current_setting('app.anna_13')::bigint;
  v_piotr_12 bigint;
  v_constraint text;
  b record;
begin
  select id into v_piotr_12 from public.bookings
  where schedule_day_id = v_day and instructor_id = v_joanna and hour = 12 and status = 'active';

  -- 15. Kon musi pracowac tego dnia: Iskra ma wolne -> 23503.
  begin
    update public.bookings set horse_id = v_iskra where id = v_anna_13;
    raise exception 'FAIL 15: przydzielono konia, ktory nie pracuje tego dnia';
  exception when foreign_key_violation then
    raise notice 'PASS 15: kon niepracujacy tego dnia odrzucony (23503)';
  end;

  -- 16. Kon ma jeden aktywny zapis w godzinie - przy dwoch godzinach przydzial przechodzi.
  update public.bookings set horse_id = v_kasztan where id in (v_anna_13, v_piotr_12);
  raise notice 'PASS 16: ten sam kon w dwoch roznych godzinach';

  -- 16b. ...ale nie dwa razy w tej samej godzinie: o 11 Anna jest u Karola, Piotr u Joanny.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, horse_id)
  values (v_day, v_joanna, 11, '44444444-4444-4444-4444-444444444444', v_kasztan);
  begin
    update public.bookings set horse_id = v_kasztan
    where schedule_day_id = v_day and hour = 11 and status = 'active'
      and rider_id = '33333333-3333-3333-3333-333333333333';
    raise exception 'FAIL 16b: ten sam kon w dwoch zapisach o tej samej godzinie';
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'bookings_horse_hour_key' then
      raise exception 'FAIL 16b: 23505 na % zamiast bookings_horse_hour_key', v_constraint;
    end if;
    raise notice 'PASS 16b: kon ma najwyzej jeden aktywny zapis w godzinie (23505)';
  end;

  -- 17. "Kto odwolal" przy aktywnym zapisie -> CHECK.
  begin
    update public.bookings set cancelled_by = 'rider' where id = v_piotr_12;
    raise exception 'FAIL 17: aktywny zapis z polem "kto odwolal"';
  exception when check_violation then
    get stacked diagnostics v_constraint = constraint_name;
    raise notice 'PASS 17: aktywny zapis z polem "kto odwolal" odrzucony (23514, %)', v_constraint;
  end;

  -- 18. Wartosc spoza slownika -> CHECK.
  begin
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'system'
    where id = v_piotr_12;
    raise exception 'FAIL 18: "kto odwolal" spoza slownika';
  exception when check_violation then
    raise notice 'PASS 18: "kto odwolal" spoza slownika odrzucone (23514)';
  end;

  -- 19. Odwolanie przez osrodek czysci przydzial konia.
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable'
  where id = v_anna_13;
  select status, horse_id, cancelled_by into b from public.bookings where id = v_anna_13;
  if b.status = 'cancelled' and b.horse_id is null and b.cancelled_by = 'stable' then
    raise notice 'PASS 19: odwolanie czysci przydzial konia i pamieta osrodek';
  else
    raise exception 'FAIL 19: status=% kon=% kto_odwolal=%', b.status, b.horse_id, b.cancelled_by;
  end if;

  -- 20. Odwolanie zwolnilo miejsce: Joanna o 13 znow przyjmuje zapis.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (v_day, v_joanna, 13, '44444444-4444-4444-4444-444444444444');
  raise notice 'PASS 20: odwolanie zwolnilo miejsce w slocie';
end $$;

rollback;

\echo '--- WSZYSTKIE ASERCJE ZAPISU NA MIEJSCE PRZESZLY ---'
