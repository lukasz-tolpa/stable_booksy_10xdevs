-- Dowod przydzialu konia przez instruktora (#81, spec #77, GLOSSARY "Przydzial konia", ADR-0002).
--
-- Gwarancje w bazie, nie w aplikacji:
--   * aktywny instruktor z kontem przydziela, zmienia i zdejmuje konia przy aktywnym zapisie
--     na SWOJ slot - przez public.assign_my_slot_horse(booking, horse); bez progu czasu,
--   * odmowa 42501 przy zapisie na cudzy slot (takze innego osrodka), dla instruktora
--     nieaktywnego i dla jezdzca; zapis odwolany -> 23514,
--   * instruktor nie zmienia w zapisie niczego poza koniem: bezposredni UPDATE zapisu
--     (status, kon) trafia w 0 wierszy (RLS bez zmian), funkcja pisze wylacznie horse_id,
--   * reguly konia obowiazuja takze instruktora: kon spoza dnia -> 23503, kon zajety o tej
--     godzinie (takze na slocie innego instruktora) -> 23505,
--   * przydzial jest jeden, bez autora: wlasciciel zmienia przydzial instruktora i odwrotnie
--     (wyzwalacz bookings_horse_assignment dopuszcza wlasciciela albo instruktora slotu),
--   * lista koni do wyboru public.get_my_slot_horse_options(from): dla kazdego aktywnego zapisu
--     na moj slot konie pracujace tego dnia ze znacznikiem "zajety o tej godzinie", bez danych
--     jezdzca ani instruktora zajmujacego konia; pusta dla jezdzca i instruktora nieaktywnego,
--   * get_my_slot_bookings zwraca identyfikator zapisu i przydzielonego konia (formularz wyboru).
--
-- Seed (jutro, Pod Dębem 10-16, Bella + Kasztan; Iskra ma wolne): Joanna Wrona (konto
-- 99999999...) 1 miejsce w kazdej godzinie, zapis Anny u Joanny o 11 bez konia; Karol Jasny
-- (bez konta) nie pracuje. Nad Rzeką: Piotr u Tomasza Lisa o 10.
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/instructor_horse_assignment.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Przydzial konia przez instruktora: setup (postgres) ==='

begin;

do $$
declare
  v_stable bigint;
  v_day bigint;
  v_joanna bigint;
  v_karol bigint;
  v_bella bigint;
  v_kasztan bigint;
  v_iskra bigint;
  v_anna_booking bigint;
  v_karol_booking bigint;
  v_cancelled_booking bigint;
  v_rzeka_booking bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors
  where stable_id = v_stable and account_id = '99999999-9999-9999-9999-999999999999';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  select id into v_bella from public.horses where stable_id = v_stable and name = 'Bella';
  select id into v_kasztan from public.horses where stable_id = v_stable and name = 'Kasztan';
  select id into v_iskra from public.horses where stable_id = v_stable and name = 'Iskra';
  select id into v_anna_booking from public.bookings
  where schedule_day_id = v_day and instructor_id = v_joanna and hour = 11 and status = 'active'
    and rider_id = '33333333-3333-3333-3333-333333333333';
  select b.id into v_rzeka_booking from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  where b.rider_id = '44444444-4444-4444-4444-444444444444' and sd.day = current_date + 1 and b.status = 'active';

  if v_day is null or v_joanna is null or v_karol is null or v_anna_booking is null or v_rzeka_booking is null then
    raise exception 'Brak danych seeda albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Karol pracuje o 11 (1 miejsce; suma o 11: Joanna 1 + Karol 1 = 2 konie) i ma tam Piotra na Belli.
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select v_day, v_karol, h, case when h = 11 then 1 else 0 end from generate_series(10, 15) h;
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, horse_id, status)
  values (v_day, v_karol, 11, '44444444-4444-4444-4444-444444444444', v_bella, 'active')
  returning id into v_karol_booking;

  -- Odwolany zapis Piotra u Joanny o 10.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, cancelled_at, cancelled_by)
  values (v_day, v_joanna, 10, '44444444-4444-4444-4444-444444444444', 'cancelled', now(), 'rider')
  returning id into v_cancelled_booking;

  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.bella', v_bella::text, true);
  perform set_config('app.kasztan', v_kasztan::text, true);
  perform set_config('app.iskra', v_iskra::text, true);
  perform set_config('app.anna_booking', v_anna_booking::text, true);
  perform set_config('app.karol_booking', v_karol_booking::text, true);
  perform set_config('app.cancelled_booking', v_cancelled_booking::text, true);
  perform set_config('app.rzeka_booking', v_rzeka_booking::text, true);
end $$;

\echo '=== Lista koni do wyboru: bez danych jezdzca ani instruktora (katalog) ==='

do $$
declare
  v_columns text;
begin
  select string_agg(a.name, ',' order by a.ord) into v_columns
  from pg_proc p
  cross join lateral unnest(p.proargnames, p.proargmodes::text[]) with ordinality as a(name, mode, ord)
  where p.oid = 'public.get_my_slot_horse_options(date)'::regprocedure
    and a.mode = 't';
  if v_columns <> 'booking_id,horse_id,horse_name,taken' then
    raise exception 'FAIL 0: get_my_slot_horse_options zwraca kolumny %', v_columns;
  end if;
  raise notice 'PASS 0: lista koni do wyboru ma tylko zapis, konia, nazwe konia i znacznik zajety';
end $$;

set local role authenticated;

\echo '=== Instruktorka Joanna: lista koni do wyboru ==='

set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_anna bigint := current_setting('app.anna_booking')::bigint;
  v_karol_booking bigint := current_setting('app.karol_booking')::bigint;
  v_cancelled bigint := current_setting('app.cancelled_booking')::bigint;
  v_rows text;
  v int;
begin
  select string_agg(horse_name || ':' || taken::text, ',' order by horse_name) into v_rows
  from public.get_my_slot_horse_options(current_date)
  where booking_id = v_anna;
  -- Bella jest o 11 u Piotra na slocie Karola - zajeta; Kasztan wolny; Iskra nie pracuje.
  if v_rows is distinct from 'Bella:true,Kasztan:false' then
    raise exception 'FAIL 1: konie do wyboru dla zapisu Anny: %', v_rows;
  end if;
  raise notice 'PASS 1: konie pracujace tego dnia, zajety na cudzym slocie oznaczony';

  select count(*) into v from public.get_my_slot_horse_options(current_date)
  where booking_id in (v_karol_booking, v_cancelled);
  if v <> 0 then
    raise exception 'FAIL 2: lista koni obejmuje zapis na cudzy slot albo odwolany (% wierszy)', v;
  end if;
  select count(*) into v from public.get_my_slot_horse_options(current_date + 2);
  if v <> 0 then
    raise exception 'FAIL 2: lista koni od pojutrza ma % wierszy', v;
  end if;
  raise notice 'PASS 2: lista koni tylko dla aktywnych zapisow na moje sloty od podanego dnia';
end $$;

\echo '=== Instruktorka Joanna: przydziela, zmienia i zdejmuje konia na swoim slocie ==='

do $$
declare
  v_anna bigint := current_setting('app.anna_booking')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v_bella bigint := current_setting('app.bella')::bigint;
  v_iskra bigint := current_setting('app.iskra')::bigint;
  v_horse bigint;
  v_horse_name text;
  v_booking bigint;
  v_constraint text;
begin
  -- 3. Przydzial wolnego konia.
  perform public.assign_my_slot_horse(v_anna, v_kasztan);
  select booking_id, horse_id, horse_name into v_booking, v_horse, v_horse_name
  from public.get_my_slot_bookings(current_date) where hour = 11;
  if v_booking is distinct from v_anna or v_horse is distinct from v_kasztan or v_horse_name is distinct from 'Kasztan' then
    raise exception 'FAIL 3: po przydziale zapis=% kon=% (%)', v_booking, v_horse, v_horse_name;
  end if;
  raise notice 'PASS 3: instruktorka przydzielila konia (widac go w get_my_slot_bookings)';

  -- 4. Przydzielony kon nie jest "zajety" dla wlasnego zapisu.
  if exists (
    select 1 from public.get_my_slot_horse_options(current_date)
    where booking_id = v_anna and horse_id = v_kasztan and taken
  ) then
    raise exception 'FAIL 4: kon przydzielony temu zapisowi oznaczony jako zajety';
  end if;
  raise notice 'PASS 4: kon tego zapisu nie jest oznaczony jako zajety';

  -- 5. Kon zajety o tej godzinie na slocie innego instruktora -> 23505.
  begin
    perform public.assign_my_slot_horse(v_anna, v_bella);
    raise exception 'FAIL 5: instruktorka przydzielila konia zajetego o tej godzinie';
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'bookings_horse_hour_key' then
      raise exception 'FAIL 5: 23505 na % zamiast bookings_horse_hour_key', v_constraint;
    end if;
    raise notice 'PASS 5: kon zajety o tej godzinie odrzucony takze dla instruktora (23505)';
  end;

  -- 6. Kon, ktory nie pracuje tego dnia -> 23503.
  begin
    perform public.assign_my_slot_horse(v_anna, v_iskra);
    raise exception 'FAIL 6: instruktorka przydzielila konia spoza dnia';
  exception when foreign_key_violation then
    raise notice 'PASS 6: kon spoza dnia odrzucony (23503)';
  end;

  -- 7. Zdjecie konia - zapis zostaje aktywny, bez konia.
  perform public.assign_my_slot_horse(v_anna, null);
  select horse_id into v_horse from public.get_my_slot_bookings(current_date) where hour = 11;
  if v_horse is not null then
    raise exception 'FAIL 7: po zdjeciu konia zapis ma konia %', v_horse;
  end if;
  raise notice 'PASS 7: instruktorka zdjela konia z zapisu';

  -- 8. Zmiana przydzialu.
  perform public.assign_my_slot_horse(v_anna, v_kasztan);
  raise notice 'PASS 8: instruktorka przydzielila konia ponownie';
end $$;

\echo '=== Instruktorka Joanna: odmowy ==='

do $$
declare
  v_anna bigint := current_setting('app.anna_booking')::bigint;
  v_karol_booking bigint := current_setting('app.karol_booking')::bigint;
  v_cancelled bigint := current_setting('app.cancelled_booking')::bigint;
  v_rzeka bigint := current_setting('app.rzeka_booking')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v int;
begin
  -- 9. Zapis na cudzy slot w tym samym osrodku i w innym osrodku -> 42501.
  begin
    perform public.assign_my_slot_horse(v_karol_booking, null);
    raise exception 'FAIL 9a: instruktorka zmienila konia przy zapisie na slot innego instruktora';
  exception when insufficient_privilege then
    raise notice 'PASS 9a: zapis na slot innego instruktora odrzucony (42501)';
  end;
  begin
    perform public.assign_my_slot_horse(v_rzeka, null);
    raise exception 'FAIL 9b: instruktorka zmienila konia w innym osrodku';
  exception when insufficient_privilege then
    raise notice 'PASS 9b: zapis w innym osrodku odrzucony (42501)';
  end;

  -- 10. Zapis odwolany -> 23514.
  begin
    perform public.assign_my_slot_horse(v_cancelled, v_kasztan);
    raise exception 'FAIL 10: kon przydzielony do odwolanego zapisu';
  exception when check_violation then
    raise notice 'PASS 10: odwolany zapis odrzucony (23514)';
  end;

  -- 11. Instruktorka nie zmienia innych pol zapisu ani konia z pominieciem funkcji (RLS -> 0 wierszy).
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable' where id = v_anna;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 11a: instruktorka odwolala zapis na swoj slot (% wierszy)', v;
  end if;
  update public.bookings set horse_id = null where id in (v_anna, v_karol_booking);
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 11b: instruktorka zmienila konia bezposrednim UPDATE (% wierszy)', v;
  end if;
  raise notice 'PASS 11: instruktorka nie zmienia zapisu poza funkcja przydzialu konia';
end $$;

\echo '=== Wlasciciel i instruktor: jeden przydzial, bez autora ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_anna bigint := current_setting('app.anna_booking')::bigint;
  v_karol_booking bigint := current_setting('app.karol_booking')::bigint;
  v_bella bigint := current_setting('app.bella')::bigint;
  v int;
begin
  -- 12. Wlasciciel zdejmuje Belle z zapisu Karola i daje ja Annie (zastepujac Kasztana od Joanny).
  update public.bookings set horse_id = null where id = v_karol_booking;
  update public.bookings set horse_id = v_bella where id = v_anna;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 12: wlasciciel nie zmienil przydzialu instruktorki (% wierszy)', v;
  end if;
  raise notice 'PASS 12: wlasciciel zmienia przydzial zrobiony przez instruktorke';
end $$;

set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_anna bigint := current_setting('app.anna_booking')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v_horse text;
begin
  -- 13. ...a instruktorka zmienia przydzial wlasciciela.
  perform public.assign_my_slot_horse(v_anna, v_kasztan);
  select horse_name into v_horse from public.get_my_slot_bookings(current_date) where hour = 11;
  if v_horse is distinct from 'Kasztan' then
    raise exception 'FAIL 13: po zmianie przez instruktorke kon=%', v_horse;
  end if;
  raise notice 'PASS 13: instruktorka zmienia przydzial zrobiony przez wlasciciela';
end $$;

\echo '=== Jezdziec Anna: konia nie przydzieli ==='

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v_anna bigint := current_setting('app.anna_booking')::bigint;
  v int;
  v_horse text;
begin
  begin
    perform public.assign_my_slot_horse(v_anna, null);
    raise exception 'FAIL 14a: jezdziec zdjal konia przez funkcje instruktora';
  exception when insufficient_privilege then
    raise notice 'PASS 14a: jezdziec nie przydziela konia przez funkcje instruktora (42501)';
  end;
  select count(*) into v from public.get_my_slot_horse_options(current_date);
  if v <> 0 then
    raise exception 'FAIL 14b: jezdziec dostaje % wierszy listy koni do wyboru', v;
  end if;
  raise notice 'PASS 14b: jezdziec nie czyta listy koni do wyboru';

  -- 15. Jezdziec widzi konia przydzielonego przez instruktora przy swoim zapisie.
  select h.name into v_horse from public.bookings b join public.horses h on h.id = b.horse_id where b.id = v_anna;
  if v_horse is distinct from 'Kasztan' then
    raise exception 'FAIL 15: jezdziec widzi przy zapisie konia %', v_horse;
  end if;
  raise notice 'PASS 15: jezdziec widzi konia przydzielonego przez instruktora';
end $$;

\echo '=== Instruktorka nieaktywna: konia nie przydzieli ==='

reset role;
update public.instructors set active = false where id = current_setting('app.joanna')::bigint;
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_anna bigint := current_setting('app.anna_booking')::bigint;
  v int;
begin
  begin
    perform public.assign_my_slot_horse(v_anna, null);
    raise exception 'FAIL 16a: nieaktywna instruktorka zdjela konia';
  exception when insufficient_privilege then
    raise notice 'PASS 16a: nieaktywna instruktorka nie przydziela konia (42501)';
  end;
  select count(*) into v from public.get_my_slot_horse_options(current_date);
  if v <> 0 then
    raise exception 'FAIL 16b: nieaktywna instruktorka dostaje % wierszy listy koni', v;
  end if;
  raise notice 'PASS 16b: nieaktywna instruktorka nie czyta listy koni do wyboru';
end $$;

\echo '=== Anonim: brak dostepu do funkcji ==='

reset role;
set local role anon;

do $$
begin
  begin
    perform public.assign_my_slot_horse(1, null);
    raise exception 'FAIL 17a: anon wywolal assign_my_slot_horse';
  exception when insufficient_privilege then
    raise notice 'PASS 17a: anon nie wywola assign_my_slot_horse';
  end;
  begin
    perform public.get_my_slot_horse_options(current_date);
    raise exception 'FAIL 17b: anon wywolal get_my_slot_horse_options';
  exception when insufficient_privilege then
    raise notice 'PASS 17b: anon nie wywola get_my_slot_horse_options';
  end;
end $$;

rollback;

\echo '=== Przydzial konia przez instruktora: wszystkie asercje przeszly ==='
