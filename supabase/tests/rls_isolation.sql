-- Dowod izolacji danych (F-01): konto osrodka nie odczyta ani nie zmodyfikuje
-- grafiku, koni i zapisow cudzej stadniny, a jezdziec nie ruszy cudzego zapisu.
--
-- Realizuje guardrail PRD (sekcja Access Control) i sprawdza go od strony,
-- z ktorej korzysta aplikacja - jako rola `authenticated` z sesja uzytkownika.
--
-- Wymaga zaladowanego seeda (`npx supabase db reset`).
-- Uzycie:  docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/rls_isolation.sql
--
-- Kazda persona dziala we wlasnej transakcji zakonczonej ROLLBACK - skrypt nie
-- zostawia po sobie zadnych zmian.

\set ON_ERROR_STOP on

\echo '=== Izolacja RLS: osrodek "Stadnina Pod Debem" ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
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
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v int;
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

  begin
    insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
    select sd.id, h.id, 13, '44444444-4444-4444-4444-444444444444'
    from public.schedule_days sd
    join public.stables s on s.id = sd.stable_id and s.name = 'Stadnina Pod Debem'
    join public.horses h on h.stable_id = s.id and h.name = 'Bella';
    raise exception 'FAIL: jezdziec zapisal na jazde kogos innego';
  exception when insufficient_privilege then
    raise notice 'PASS: zapis w cudzym imieniu odrzucony przez RLS';
  end;

  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
  select sd.id, h.id, 13, '33333333-3333-3333-3333-333333333333'
  from public.schedule_days sd
  join public.stables s on s.id = sd.stable_id and s.name = 'Stadnina Pod Debem'
  join public.horses h on h.stable_id = s.id and h.name = 'Bella';
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

\echo '--- WSZYSTKIE ASERCJE IZOLACJI PRZESZLY ---'
