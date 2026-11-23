-- Dowod koni pensjonatowych i pobytow (#114, spec #112, ADR 0005, GLOSSARY „Koń pensjonatowy”, „Pobyt”).
--
-- Gwarancje w bazie, nie w aplikacji:
--   * rodzaj konia: istniejace konie to konie osrodka; wlasciciel nie doda wprost konia
--     pensjonatowego i nie zmieni rodzaju (42501),
--   * wlasciciela konia i pobyty widza tylko wlasciciel osrodka i sam pensjonariusz - inny jezdziec,
--     inny osrodek i instruktor bez praw wlasciciela: zero wierszy; zapis wprost: 42501,
--   * wyszukanie jezdzca po adresie e-mail: tylko konto jezdzca (SB040 dla braku konta i adresu
--     instruktora), tylko dla wlasciciela (42501),
--   * dzien wyjazdu ustawia kazda ze stron: nie pozniej niz dzis (SB043), nie wczesniej niz przyjazd
--     (SB044) ani ostatnia jazda konia w pobycie (SB045); kto ostatnio ustawil; cudzy pobyt SB041,
--   * pobyty jednego konia nie zachodza na siebie (SB042), nowy pobyt konia, ktory wrocil,
--   * kon pensjonatowy nigdy nie jest koniem pracujacym (SB046, takze postgres),
--   * „jezdziec mojego osrodka” dla pensjonariusza bez zapisu - od dnia przyjazdu (profil, koszt dodatkowy),
--   * regula „pensjonariusz w miesiacu” - te same przypadki co src/lib/boarding/month.test.ts.
--
-- „Dzis” liczy baza (private.warsaw_today()), nigdy skrypt na sztywno.
-- Persony z seeda: wlasciciel Pod Dębem (1111...), wlascicielka Nad Rzeką (2222...), Joanna Wrona
-- (9999..., instruktorka Pod Dębem), Anna (3333..., jezdziec Pod Dębem), Piotr (4444..., jezdziec
-- tylko Nad Rzeką), Katarzyna Zając (1212..., pensjonariuszka bez zapisu, kon Hrabia Pod Dębem od 90 dni).
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/boarding_horses.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Konie pensjonatowe: setup (postgres) ==='

begin;

do $$
declare
  v_debem bigint;
  v_rzeka bigint;
  v_hrabia bigint;
  v_stay bigint;
  v_joanna bigint;
  v_today date := private.warsaw_today();
  v_day bigint;
begin
  select id into v_debem from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_rzeka from public.stables where owner_id = '22222222-2222-2222-2222-222222222222';
  select id into v_hrabia from public.horses where stable_id = v_debem and name = 'Hrabia';
  select id into v_stay from public.horse_stays where horse_id = v_hrabia and departure_day is null;
  select id into v_joanna from public.instructors where stable_id = v_debem and name = 'Joanna Wrona';
  if v_debem is null or v_rzeka is null or v_hrabia is null or v_stay is null then
    raise exception 'Brak danych seeda (Hrabia w pobycie) - uruchom npx supabase db reset';
  end if;
  if exists (select 1 from public.bookings where rider_id = '12121212-1212-1212-1212-121212121212') then
    raise exception 'Pensjonariuszka z seeda ma zapis (scenariusz e2e?) - uruchom npx supabase db reset';
  end if;

  if (select count(*) from public.horses where kind = 'stable') <> 5
     or exists (select 1 from public.horses where name in ('Bella', 'Kasztan', 'Iskra', 'Grom', 'Luna') and kind <> 'stable') then
    raise exception 'FAIL 0a: konie seeda nie sa konmi osrodka';
  end if;
  raise notice 'PASS 0a: istniejace konie to konie osrodka, Hrabia - kon pensjonatowy';

  -- Jazda Hrabiego 20 dni temu w obecnym pobycie. Zapis konia pensjonatowego jeszcze nie istnieje
  -- w aplikacji (#115) - wiersze wstawione z wylaczonymi wyzwalaczami i kluczami obcymi. Jezdziec
  -- zanonimizowany (NULL), zeby pensjonariuszka zostala bez zapisu - regula ostatniej jazdy patrzy
  -- na konia, nie na jezdzca.
  set local session_replication_role = replica;
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_debem, v_today - 20, 10, 12)
  returning id into v_day;
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, horse_id, status)
  values (v_day, v_joanna, 10, null, v_hrabia, 'active');
  set local session_replication_role = origin;

  perform set_config('app.debem', v_debem::text, true);
  perform set_config('app.hrabia', v_hrabia::text, true);
  perform set_config('app.stay', v_stay::text, true);
  perform set_config('app.today', v_today::text, true);
end $$;

-- Kon pensjonatowy nie jest koniem pracujacym - takze dla postgres.
do $$
begin
  insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
  select sd.id, current_setting('app.hrabia')::bigint, sd.stable_id
  from public.schedule_days sd
  where sd.stable_id = current_setting('app.debem')::bigint and sd.day = current_date + 1;
  raise exception 'FAIL 0b: postgres dopisal konia pensjonatowego do koni pracujacych';
exception when sqlstate 'SB046' then
  raise notice 'PASS 0b: kon pensjonatowy odmawiany jako kon pracujacy takze dla postgres (SB046)';
end $$;

-- Regula „pensjonariusz w miesiacu” - przypadki z month.test.ts.
do $$
begin
  if not (
        not private.stay_overlaps_month('2026-10-20', null, '2026-09-01')
    and private.stay_overlaps_month('2026-10-20', null, '2026-10-01')
    and private.stay_overlaps_month('2026-10-20', null, '2027-03-01')
    and private.stay_overlaps_month('2026-08-01', '2026-11-03', '2026-11-01')
    and not private.stay_overlaps_month('2026-08-01', '2026-11-03', '2026-12-01')
    and not private.stay_overlaps_month('2026-11-10', '2026-11-12', '2026-10-01')
    and private.stay_overlaps_month('2026-11-10', '2026-11-12', '2026-11-01')
    and not private.stay_overlaps_month('2026-11-10', '2026-11-12', '2026-12-01')
    and private.stay_overlaps_month('2026-11-30', null, '2026-11-01')
    and private.stay_overlaps_month('2026-09-15', '2026-11-01', '2026-11-01')
  ) then
    raise exception 'FAIL 0c: private.stay_overlaps_month rozjezdza sie z month.test.ts';
  end if;

  if not private.is_boarder_in_month('12121212-1212-1212-1212-121212121212', current_setting('app.debem')::bigint, private.warsaw_month_start())
     or private.is_boarder_in_month('12121212-1212-1212-1212-121212121212', current_setting('app.debem')::bigint, (private.warsaw_month_start() - interval '6 months')::date)
     or private.is_boarder_in_month('33333333-3333-3333-3333-333333333333', current_setting('app.debem')::bigint, private.warsaw_month_start()) then
    raise exception 'FAIL 0d: private.is_boarder_in_month';
  end if;
  raise notice 'PASS 0c-d: regula „pensjonariusz w miesiacu” jak w modelach widoku';
end $$;

set local role authenticated;

\echo '=== Wlasciciel Pod Dębem: konie pensjonatowe, pobyty, wyszukanie po e-mailu ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v_hrabia bigint := current_setting('app.hrabia')::bigint;
  v_stay bigint := current_setting('app.stay')::bigint;
  v_today date := current_setting('app.today')::date;
  v int;
  v_id uuid;
  v_horse bigint;
  v_new_stay bigint;
  r record;
begin
  select count(*) into v from public.horse_owners where horse_id = v_hrabia and rider_id = '12121212-1212-1212-1212-121212121212';
  if v <> 1 then
    raise exception 'FAIL 1: wlasciciel nie widzi wlasciciela swojego konia pensjonatowego (%)', v;
  end if;
  select count(*) into v from public.horse_stays where horse_id = v_hrabia;
  if v <> 1 then
    raise exception 'FAIL 1: wlasciciel widzi % pobytow Hrabiego zamiast 1', v;
  end if;
  raise notice 'PASS 1: wlasciciel widzi wlasciciela konia pensjonatowego i jego pobyt';

  -- „Jezdziec mojego osrodka” bez zapisu: profil i koszt dodatkowy.
  select count(*) into v from public.profiles where id = '12121212-1212-1212-1212-121212121212';
  if v <> 1 then
    raise exception 'FAIL 2: wlasciciel nie widzi profilu pensjonariuszki bez zapisu';
  end if;
  insert into public.extra_costs (stable_id, rider_id, month, name, amount)
  values (v_debem, '12121212-1212-1212-1212-121212121212', private.warsaw_month_start(), 'Kowal', 15000);
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 2: koszt dodatkowy pensjonariuszki bez zapisu nie zapisal sie';
  end if;
  raise notice 'PASS 2: pensjonariuszka bez zapisu jest jezdzcem osrodka (profil, koszt dodatkowy)';

  -- Wyszukanie po e-mailu.
  if public.find_rider_by_email('  Katarzyna.Zajac@Example.com ') <> '12121212-1212-1212-1212-121212121212' then
    raise exception 'FAIL 3: wyszukanie po adresie e-mail nie zwrocilo konta jezdzca';
  end if;
  begin
    v_id := public.find_rider_by_email('nikt@example.com');
    raise exception 'FAIL 3: brak konta nie zostal odmowiony';
  exception when sqlstate 'SB040' then null;
  end;
  begin
    v_id := public.find_rider_by_email('joanna.wrona@example.com');
    raise exception 'FAIL 3: adres instruktora zwrocil konto jezdzca';
  exception when sqlstate 'SB040' then null;
  end;
  raise notice 'PASS 3: wyszukanie zwraca tylko konto jezdzca (SB040 dla braku konta i instruktora)';

  -- Kon pensjonatowy tylko przez funkcje; rodzaj niezmienny.
  begin
    insert into public.horses (stable_id, name, kind) values (v_debem, 'Przemyt', 'boarding');
    raise exception 'FAIL 4: wlasciciel dodal wprost konia pensjonatowego';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.horses set kind = 'boarding' where name = 'Bella';
    raise exception 'FAIL 4: wlasciciel zmienil rodzaj konia';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.horse_stays (horse_id, stable_id, arrival_day) values (v_hrabia, v_debem, v_today);
    raise exception 'FAIL 4: wlasciciel wstawil pobyt wprost';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.horse_owners set rider_id = '33333333-3333-3333-3333-333333333333' where horse_id = v_hrabia;
    raise exception 'FAIL 4: wlasciciel zmienil wlasciciela konia wprost';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 4: kon pensjonatowy, wlasciciel i pobyty tylko przez funkcje; rodzaj konia niezmienny (42501)';

  -- Dodanie konia pensjonatowego Piotrowi (bez zapisu Pod Dębem): przyjazd za 5 dni - jeszcze nie
  -- jezdziec osrodka; lista „Pensjonariusze” pokazuje go juz z nazwiskiem.
  v_horse := public.add_boarding_horse(' Dukat ', 'piotr.nowak@example.com', v_today + 5);
  select h.kind, h.name, o.rider_id, s.arrival_day, s.departure_day into r
  from public.horses h
  join public.horse_owners o on o.horse_id = h.id
  join public.horse_stays s on s.horse_id = h.id
  where h.id = v_horse;
  if r.kind <> 'boarding' or r.name <> 'Dukat' or r.rider_id <> '44444444-4444-4444-4444-444444444444'
     or r.arrival_day <> v_today + 5 or r.departure_day is not null then
    raise exception 'FAIL 5: add_boarding_horse zapisal %', r;
  end if;
  select count(*) into v from public.profiles where id = '44444444-4444-4444-4444-444444444444';
  if v <> 0 then
    raise exception 'FAIL 5: wlasciciel widzi profil pensjonariusza przed dniem przyjazdu konia';
  end if;
  select count(*) into v from public.get_stable_boarding_horses() b
  where b.horse_id = v_horse and b.rider_name = 'Piotr Nowak' and b.rider_email = 'piotr.nowak@example.com';
  if v <> 1 then
    raise exception 'FAIL 5: lista „Pensjonariusze” nie pokazuje pensjonariusza przed przyjazdem konia';
  end if;
  begin
    v_horse := public.add_boarding_horse('Widmo', 'nikt@example.com', v_today);
    raise exception 'FAIL 5: dodano konia pensjonatowego bez konta jezdzca';
  exception when sqlstate 'SB040' then null;
  end;
  select count(*) into v from public.horses where name = 'Widmo';
  if v <> 0 then
    raise exception 'FAIL 5: odmowa SB040 zostawila konia';
  end if;
  raise notice 'PASS 5: kon pensjonatowy z pensjonariuszem po e-mailu i pobytem; profil od dnia przyjazdu';

  -- Dzien wyjazdu: granice dat i ostatnia jazda (20 dni temu).
  begin
    perform public.set_stay_departure(v_stay, v_today + 1);
    raise exception 'FAIL 6: dzien wyjazdu jutro przyjety';
  exception when sqlstate 'SB043' then null;
  end;
  begin
    perform public.set_stay_departure(v_stay, v_today - 91);
    raise exception 'FAIL 6: dzien wyjazdu przed przyjazdem przyjety';
  exception when sqlstate 'SB044' then null;
  end;
  begin
    perform public.set_stay_departure(v_stay, v_today - 21);
    raise exception 'FAIL 6: dzien wyjazdu przed ostatnia jazda przyjety';
  exception when sqlstate 'SB045' then null;
  end;
  perform public.set_stay_departure(v_stay, v_today - 20);
  perform public.set_stay_departure(v_stay, v_today - 10);
  select departure_day, departure_set_by into r from public.horse_stays where id = v_stay;
  if r.departure_day <> v_today - 10 or r.departure_set_by <> 'stable' then
    raise exception 'FAIL 6: wlasciciel ustawil wyjazd %', r;
  end if;
  raise notice 'PASS 6: wlasciciel ustawia i poprawia dzien wyjazdu w granicach dat (SB043, SB044, SB045), kto ustawil = osrodek';

  -- Nowy pobyt konia, ktory wrocil; pobyty bez nakladania.
  begin
    v_new_stay := public.add_horse_stay(v_hrabia, v_today - 10);
    raise exception 'FAIL 7: pobyt od dnia wyjazdu poprzedniego przyjety';
  exception when sqlstate 'SB042' then null;
  end;
  v_new_stay := public.add_horse_stay(v_hrabia, v_today - 9);
  begin
    v_horse := public.add_horse_stay(v_hrabia, v_today);
    raise exception 'FAIL 7: drugi pobyt w trakcie trwajacego przyjety';
  exception when sqlstate 'SB042' then null;
  end;
  begin
    perform public.set_stay_departure(v_stay, v_today - 8);
    raise exception 'FAIL 7: przesuniecie wyjazdu na kolejny pobyt przyjete';
  exception when sqlstate 'SB042' then null;
  end;
  begin
    v_horse := public.add_horse_stay((select id from public.horses where name = 'Bella'), v_today);
    raise exception 'FAIL 7: pobyt konia osrodka przyjety';
  exception when sqlstate 'SB041' then null;
  end;
  select count(*) into v from public.horse_stays where horse_id = v_hrabia;
  if v <> 2 then
    raise exception 'FAIL 7: Hrabia ma % pobytow zamiast 2', v;
  end if;
  perform set_config('app.new_stay', v_new_stay::text, true);
  raise notice 'PASS 7: nowy pobyt konia, ktory wrocil; pobyty nie zachodza na siebie (SB042); kon osrodka bez pobytu (SB041)';

  -- Kon pensjonatowy odmawiany jako kon pracujacy w funkcji zapisu grafiku.
  begin
    perform public.save_schedule_day(current_date + 3, 10, 12, array[v_hrabia], array[]::bigint[], '[]'::jsonb);
    raise exception 'FAIL 8: save_schedule_day przyjal konia pensjonatowego jako pracujacego';
  exception when sqlstate 'SB046' then
    raise notice 'PASS 8: save_schedule_day odmawia konia pensjonatowego jako pracujacego (SB046)';
  end;
end $$;

\echo '=== Wlascicielka Nad Rzeką i instruktorka Joanna: nie widza cudzych koni pensjonatowych ==='

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v int;
begin
  select (select count(*) from public.horse_owners) + (select count(*) from public.horse_stays)
       + (select count(*) from public.get_stable_boarding_horses()) into v;
  if v <> 0 then
    raise exception 'FAIL 9: inny osrodek widzi % wierszy koni pensjonatowych Pod Dębem', v;
  end if;
  select count(*) into v from public.profiles where id = '12121212-1212-1212-1212-121212121212';
  if v <> 0 then
    raise exception 'FAIL 9: inny osrodek widzi profil pensjonariuszki';
  end if;
  begin
    perform public.set_stay_departure(current_setting('app.new_stay')::bigint, current_setting('app.today')::date);
    raise exception 'FAIL 9: inny osrodek ustawil wyjazd cudzego pobytu';
  exception when sqlstate 'SB041' then null;
  end;
  begin
    perform public.add_horse_stay(current_setting('app.hrabia')::bigint, current_setting('app.today')::date + 30);
    raise exception 'FAIL 9: inny osrodek dodal pobyt cudzego konia';
  exception when sqlstate 'SB041' then null;
  end;
  raise notice 'PASS 9: inny osrodek nie widzi ani nie zmienia koni pensjonatowych Pod Dębem (SB041)';
end $$;

set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v int;
  v_id uuid;
begin
  select (select count(*) from public.horse_owners) + (select count(*) from public.horse_stays)
       + (select count(*) from public.get_stable_boarding_horses()) into v;
  if v <> 0 then
    raise exception 'FAIL 10: instruktorka bez praw wlasciciela widzi % wierszy koni pensjonatowych', v;
  end if;
  begin
    v_id := public.find_rider_by_email('katarzyna.zajac@example.com');
    raise exception 'FAIL 10: instruktorka wyszukala jezdzca po e-mailu';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 10: instruktorka bez praw wlasciciela nie widzi pobytow i nie wyszukuje po e-mailu (42501)';
end $$;

\echo '=== Inny jezdziec (Anna): nie widzi, czyj jest kon ==='

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v int;
  v_id uuid;
begin
  select count(*) into v from public.horses where id = current_setting('app.hrabia')::bigint;
  if v <> 1 then
    raise exception 'FAIL 11: jezdziec nie widzi konia w katalogu (%)', v;
  end if;
  select (select count(*) from public.horse_owners) + (select count(*) from public.horse_stays)
       + (select count(*) from public.get_stable_boarding_horses()) into v;
  if v <> 0 then
    raise exception 'FAIL 11: inny jezdziec widzi % wierszy wlasciciela i pobytow', v;
  end if;
  begin
    v_id := public.find_rider_by_email('katarzyna.zajac@example.com');
    raise exception 'FAIL 11: jezdziec wyszukal jezdzca po e-mailu';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_boarding_horse('Przemyt', 'anna.kowalska@example.com', current_setting('app.today')::date);
    raise exception 'FAIL 11: jezdziec dodal konia pensjonatowego';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.set_stay_departure(current_setting('app.new_stay')::bigint, current_setting('app.today')::date);
    raise exception 'FAIL 11: inny jezdziec zakonczyl cudzy pobyt';
  exception when sqlstate 'SB041' then null;
  end;
  raise notice 'PASS 11: inny jezdziec widzi konia w katalogu, ale nie jego wlasciciela ani pobytow (SB041, 42501)';
end $$;

\echo '=== Pensjonariuszka: widzi swoje konie i pobyty, konczy pobyt, nie zmienia konia ==='

set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

do $$
declare
  v_hrabia bigint := current_setting('app.hrabia')::bigint;
  v_new_stay bigint := current_setting('app.new_stay')::bigint;
  v_today date := current_setting('app.today')::date;
  v int;
  r record;
begin
  select count(*) into v from public.horse_owners;
  if v <> 1 then
    raise exception 'FAIL 12: pensjonariuszka widzi % wierszy wlasciciela zamiast 1 (swojego)', v;
  end if;
  select count(*) into v from public.horse_stays where horse_id = v_hrabia;
  if v <> 2 then
    raise exception 'FAIL 12: pensjonariuszka widzi % pobytow swojego konia zamiast 2', v;
  end if;
  select count(*) into v from public.get_stable_boarding_horses();
  if v <> 0 then
    raise exception 'FAIL 12: pensjonariuszka czyta liste „Pensjonariusze” osrodka';
  end if;
  raise notice 'PASS 12: pensjonariuszka widzi swojego konia i jego pobyty, nie liste osrodka';

  begin
    perform public.set_stay_departure(v_new_stay, v_today + 1);
    raise exception 'FAIL 13: pensjonariuszka ustawila wyjazd jutro';
  exception when sqlstate 'SB043' then null;
  end;
  begin
    perform public.set_stay_departure(v_new_stay, v_today - 10);
    raise exception 'FAIL 13: pensjonariuszka ustawila wyjazd przed przyjazdem';
  exception when sqlstate 'SB044' then null;
  end;
  perform public.set_stay_departure(v_new_stay, v_today);
  select departure_day, departure_set_by into r from public.horse_stays where id = v_new_stay;
  if r.departure_day <> v_today or r.departure_set_by <> 'rider' then
    raise exception 'FAIL 13: pensjonariuszka ustawila wyjazd %', r;
  end if;
  raise notice 'PASS 13: pensjonariuszka konczy pobyt swojego konia w granicach dat, kto ustawil = pensjonariusz';

  update public.horses set name = 'Zmieniony' where id = v_hrabia;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 14: pensjonariuszka zmienila dane konia';
  end if;
  begin
    update public.horse_stays set departure_day = null where id = v_new_stay;
    raise exception 'FAIL 14: pensjonariuszka zmienila pobyt wprost';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_horse_stay(v_hrabia, v_today + 30);
    raise exception 'FAIL 14: pensjonariuszka dodala pobyt';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 14: pensjonariuszka nie zmienia danych konia ani pobytow wprost (0 wierszy, 42501)';
end $$;

\echo '=== Wlasciciel poprawia dzien wyjazdu wpisany przez pensjonariuszke ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  r record;
begin
  perform public.set_stay_departure(current_setting('app.new_stay')::bigint, current_setting('app.today')::date - 1);
  select departure_day, departure_set_by into r from public.horse_stays where id = current_setting('app.new_stay')::bigint;
  if r.departure_day <> current_setting('app.today')::date - 1 or r.departure_set_by <> 'stable' then
    raise exception 'FAIL 15: poprawka wlasciciela zapisala %', r;
  end if;
  raise notice 'PASS 15: wlasciciel poprawia dzien wyjazdu pensjonariuszki, kto ustawil = osrodek';
end $$;

rollback;
