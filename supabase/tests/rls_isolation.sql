-- Dowod izolacji danych (F-01): konto osrodka nie odczyta ani nie zmodyfikuje
-- grafiku, koni i zapisow cudzej stadniny, a jezdziec nie ruszy cudzego zapisu.
--
-- Realizuje guardrail PRD (sekcja Access Control) i sprawdza go od strony,
-- z ktorej korzysta aplikacja - jako rola `authenticated` z sesja uzytkownika.
--
-- Wymaga swiezego seeda (`npx supabase db reset` tego samego dnia - dni z seeda musza byc na jutro).
-- Uzycie:  npm run test:db   (wszystkie dowody; runner sam dobiera psql z hosta albo z kontenera)
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/rls_isolation.sql
--
-- Kazda persona dziala we wlasnej transakcji zakonczonej ROLLBACK - skrypt nie
-- zostawia po sobie zadnych zmian.

\set ON_ERROR_STOP on

\echo '=== Izolacja RLS: osrodek "Stadnina Pod Debem" ==='

begin;

-- Id-y z seeda zapisane jako postgres (przed zmiana roli) w GUC transakcji - persona
-- nie widzi cudzych wierszy, wiec sama by ich nie znalazla, a test "podmien identyfikator"
-- potrzebuje konkretnych obcych id.
do $$
begin
  perform set_config('app.stable_a', (select id::text from public.stables where owner_id = '11111111-1111-1111-1111-111111111111'), true);
  perform set_config('app.stable_b', (select id::text from public.stables where owner_id = '22222222-2222-2222-2222-222222222222'), true);
  perform set_config('app.day_a', (select sd.id::text from public.schedule_days sd join public.stables s on s.id = sd.stable_id where s.owner_id = '11111111-1111-1111-1111-111111111111' and sd.day = current_date + 1), true);
  perform set_config('app.day_b', (select sd.id::text from public.schedule_days sd join public.stables s on s.id = sd.stable_id where s.owner_id = '22222222-2222-2222-2222-222222222222' and sd.day = current_date + 1), true);
  perform set_config('app.kasztan', (select h.id::text from public.horses h join public.stables s on s.id = h.stable_id where s.owner_id = '11111111-1111-1111-1111-111111111111' and h.name = 'Kasztan'), true);
  perform set_config('app.grom', (select h.id::text from public.horses h join public.stables s on s.id = h.stable_id where s.owner_id = '22222222-2222-2222-2222-222222222222' and h.name = 'Grom'), true);
  perform set_config('app.luna', (select h.id::text from public.horses h join public.stables s on s.id = h.stable_id where s.owner_id = '22222222-2222-2222-2222-222222222222' and h.name = 'Luna'), true);
  if current_setting('app.day_a') = '' or current_setting('app.day_b') = '' then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
  v_day_b bigint := current_setting('app.day_b')::bigint;
  v_day_a bigint := current_setting('app.day_a')::bigint;
  v_kasztan bigint := current_setting('app.kasztan')::bigint;
  v_grom bigint := current_setting('app.grom')::bigint;
  v_luna bigint := current_setting('app.luna')::bigint;
  v_stable_b bigint := current_setting('app.stable_b')::bigint;
begin
  select count(*) into v from public.bookings;
  if v <> 1 then
    raise exception 'FAIL: osrodek A widzi % zapisow zamiast 1 (wlasnego)', v;
  end if;
  raise notice 'PASS: osrodek A widzi wylacznie zapisy wlasnego grafiku';

  update public.horses set name = 'Zhakowany' where name = 'Luna';
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: osrodek A zmodyfikowal % cudzych koni', v;
  end if;
  raise notice 'PASS: proba zmiany cudzego konia dotknela 0 wierszy';

  begin
    insert into public.schedule_days (stable_id, day, open_hour, close_hour)
    select id, current_date + 5, 8, 12 from public.stables where name = 'Stajnia Nad Rzeka';
    raise exception 'FAIL: osrodek A wstawil grafik do cudzej stadniny';
  exception when insufficient_privilege then
    raise notice 'PASS: insert grafiku do cudzej stadniny odrzucony przez RLS';
  end;

  -- Podmiana identyfikatora dnia: UPDATE cudzego dnia (rozszerzenie, zeby trigger nie
  -- odmowil pierwszy) i DELETE cudzego przydzialu konia maja dotknac 0 wierszy.
  update public.schedule_days set open_hour = 8 where id = v_day_b;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: osrodek A zmienil % wierszy cudzego dnia (id=%)', v, v_day_b;
  end if;
  raise notice 'PASS: update cudzego dnia po id dotknal 0 wierszy';

  delete from public.schedule_day_horses where schedule_day_id = v_day_b and horse_id = v_grom;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: osrodek A usunal % cudzych przydzialow koni', v;
  end if;
  raise notice 'PASS: delete cudzego przydzialu konia dotknal 0 wierszy';

  -- Dopisanie konia do cudzego dnia (Luna nie jest przydzielona u B) - WITH CHECK odrzuca.
  begin
    insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
    values (v_day_b, v_luna, v_stable_b);
    raise exception 'FAIL: osrodek A dopisal konia do cudzego dnia';
  exception when insufficient_privilege then
    raise notice 'PASS: insert przydzialu do cudzego dnia odrzucony przez RLS';
  end;

  -- Brama roli: konto osrodka nie zapisze sie na jazde nawet we wlasnym imieniu.
  -- Slot poprawny (dzien istnieje, godzina w zakresie), zeby jedyna odmowa byla RLS,
  -- a nie 23503/23514 z triggera BEFORE INSERT.
  begin
    insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
    values (v_day_a, v_kasztan, 12, '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: konto osrodka zapisalo sie na jazde';
  exception when insufficient_privilege then
    raise notice 'PASS: insert zapisu przez konto osrodka odrzucony przez RLS (brama roli)';
  end;

  select count(*) into v from public.profiles where full_name = 'Piotr Nowak';
  if v <> 0 then
    raise exception 'FAIL: osrodek A widzi profil jezdzca z cudzej stadniny';
  end if;

  select count(*) into v from public.profiles where full_name = 'Anna Kowalska';
  if v <> 1 then
    raise exception 'FAIL: osrodek A nie widzi profilu wlasnego jezdzca - FR-005 nie zadziala';
  end if;
  raise notice 'PASS: osrodek A widzi profil swojego jezdzca, nie widzi obcego';
end $$;

rollback;

\echo '=== Izolacja RLS: jezdziec Anna Kowalska ==='

begin;

do $$
begin
  perform set_config('app.stable_a', (select id::text from public.stables where owner_id = '11111111-1111-1111-1111-111111111111'), true);
  perform set_config('app.bella', (select h.id::text from public.horses h join public.stables s on s.id = h.stable_id where s.owner_id = '11111111-1111-1111-1111-111111111111' and h.name = 'Bella'), true);
  perform set_config('app.piotr_booking', (select id::text from public.bookings where rider_id = '44444444-4444-4444-4444-444444444444' and status = 'active' order by id limit 1), true);
  if current_setting('app.piotr_booking') = '' then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v int;
  v_stable_a bigint := current_setting('app.stable_a')::bigint;
  v_bella bigint := current_setting('app.bella')::bigint;
  v_piotr_booking bigint := current_setting('app.piotr_booking')::bigint;
begin
  select count(*) into v from public.bookings;
  if v <> 1 then
    raise exception 'FAIL: jezdziec widzi % zapisow zamiast 1 (wlasnego)', v;
  end if;
  raise notice 'PASS: jezdziec widzi wylacznie swoje zapisy';

  update public.bookings
     set status = 'cancelled', cancelled_at = now()
   where rider_id = '44444444-4444-4444-4444-444444444444';
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: jezdziec odwolal % cudzych zapisow', v;
  end if;
  raise notice 'PASS: proba odwolania cudzego zapisu dotknela 0 wierszy';

  -- Podmiana identyfikatora: odwolanie cudzego zapisu PO ID (tak wola endpoint cancel),
  -- nie po rider_id - tez 0 wierszy.
  update public.bookings
     set status = 'cancelled', cancelled_at = now()
   where id = v_piotr_booking;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: jezdziec odwolal cudzy zapis po id (%)', v_piotr_booking;
  end if;
  raise notice 'PASS: odwolanie cudzego zapisu po id dotknelo 0 wierszy';

  -- Jezdziec wola tabele osrodka: current_stable_id() jest NULL, wiec WITH CHECK odrzuca.
  begin
    insert into public.horses (stable_id, name) values (v_stable_a, 'Podstawiony');
    raise exception 'FAIL: jezdziec dodal konia do stadniny';
  exception when insufficient_privilege then
    raise notice 'PASS: insert konia przez jezdzca odrzucony przez RLS';
  end;

  begin
    insert into public.schedule_days (stable_id, day, open_hour, close_hour)
    values (v_stable_a, current_date + 9, 8, 12);
    raise exception 'FAIL: jezdziec ulozyl grafik stadniny';
  exception when insufficient_privilege then
    raise notice 'PASS: insert grafiku przez jezdzca odrzucony przez RLS';
  end;

  -- SQL-owy bliznak endpointu /api/horses/toggle-active z obcym horseId.
  update public.horses set active = false where id = v_bella;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: jezdziec zmienil stan % koni', v;
  end if;
  raise notice 'PASS: zmiana stanu konia przez jezdzca dotknela 0 wierszy';

  begin
    insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
    select sd.id, h.id, 13, '44444444-4444-4444-4444-444444444444'
    from public.schedule_days sd
    join public.stables s on s.id = sd.stable_id and s.name = 'Stadnina Pod Debem'
    join public.horses h on h.stable_id = s.id and h.name = 'Bella'
    -- Filtr po dacie jest konieczny: od S-02 stadnina moze miec wiele ulozonych dni,
    -- a bez niego zapytanie wstawia po jednym zapisie na kazdy z nich.
    where sd.day = current_date + 1;
    raise exception 'FAIL: jezdziec zapisal na jazde kogos innego';
  exception when insufficient_privilege then
    raise notice 'PASS: zapis w cudzym imieniu odrzucony przez RLS';
  end;

  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
  select sd.id, h.id, 13, '33333333-3333-3333-3333-333333333333'
  from public.schedule_days sd
  join public.stables s on s.id = sd.stable_id and s.name = 'Stadnina Pod Debem'
  join public.horses h on h.stable_id = s.id and h.name = 'Bella'
  where sd.day = current_date + 1;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL: jezdziec nie mogl zapisac sie na wolny slot';
  end if;
  raise notice 'PASS: wlasny zapis na wolny slot przeszedl';
end $$;

rollback;

\echo '=== Izolacja RLS: osrodek "Stajnia Nad Rzeka" ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.bookings;
  if v <> 1 then
    raise exception 'FAIL: osrodek B widzi % zapisow zamiast 1 (wlasnego)', v;
  end if;

  update public.horses set notes = 'notatka z testu' where name = 'Luna';
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL: osrodek B nie moze edytowac wlasnego konia - polityka za ciasna';
  end if;
  raise notice 'PASS: osrodek B widzi wylacznie swoj zapis i edytuje wlasnego konia';
end $$;

rollback;

\echo '=== Zajetosc slotow (S-04): funkcja get_taken_slots ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v int;
begin
  -- Funkcja security definer pokazuje zajetosc slotow cudzej stadniny
  -- (zapis Piotra: Grom o 10 w Stajni Nad Rzeka), ale wylacznie pary
  -- (kon, godzina) - zadnej tozsamosci jezdzca.
  select count(*) into v
  from public.get_taken_slots(
    (select id from public.stables where name = 'Stajnia Nad Rzeka'),
    current_date + 1
  );
  if v <> 1 then
    raise exception 'FAIL: jezdziec widzi % zajetych slotow Stajni Nad Rzeka zamiast 1', v;
  end if;
  raise notice 'PASS: funkcja pokazuje zajetosc cudzej stadniny (1 slot)';

  -- ...podczas gdy bezposredni odczyt bookings tej samej stadniny nadal daje
  -- 0 wierszy - polityka SELECT z F-01 pozostaje nienaruszona.
  select count(*) into v
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  join public.stables s on s.id = sd.stable_id
  where s.name = 'Stajnia Nad Rzeka';
  if v <> 0 then
    raise exception 'FAIL: jezdziec widzi % cudzych wierszy bookings bezposrednio', v;
  end if;
  raise notice 'PASS: bezposredni odczyt cudzych bookings nadal pusty';

  -- Odwolany zapis znika z zajetosci: funkcja filtruje status='active'.
  -- Anna odwoluje wlasny zapis (Bella o 11 w Pod Debem) w tej transakcji;
  -- rollback na koncu bloku przywraca stan seeda.
  select count(*) into v
  from public.get_taken_slots(
    (select id from public.stables where name = 'Stadnina Pod Debem'),
    current_date + 1
  );
  if v <> 1 then
    raise exception 'FAIL: przed odwolaniem funkcja widzi % slotow Pod Debem zamiast 1', v;
  end if;

  update public.bookings
     set status = 'cancelled', cancelled_at = now()
   where rider_id = '33333333-3333-3333-3333-333333333333';
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL: Anna nie mogla odwolac wlasnego zapisu (row_count=%)', v;
  end if;

  select count(*) into v
  from public.get_taken_slots(
    (select id from public.stables where name = 'Stadnina Pod Debem'),
    current_date + 1
  );
  if v <> 0 then
    raise exception 'FAIL: odwolany zapis nadal widoczny w zajetosci (% wierszy)', v;
  end if;
  raise notice 'PASS: odwolany zapis znika z zajetosci (filtr status=active)';

  -- Nieistniejacy osrodek: pusty zbior, nie blad.
  select count(*) into v from public.get_taken_slots(999999, current_date + 1);
  if v <> 0 then
    raise exception 'FAIL: nieistniejacy osrodek zwraca % wierszy', v;
  end if;
  raise notice 'PASS: nieistniejacy osrodek daje pusty zbior';
end $$;

rollback;

begin;
set local role anon;

do $$
begin
  begin
    perform * from public.get_taken_slots(1, current_date + 1);
    raise exception 'FAIL: anon wywolal get_taken_slots';
  exception when insufficient_privilege then
    raise notice 'PASS: anon nie moze wywolac get_taken_slots';
  end;
end $$;

rollback;

\echo '--- WSZYSTKIE ASERCJE IZOLACJI PRZESZLY ---'
