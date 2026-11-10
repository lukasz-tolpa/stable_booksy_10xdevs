-- Dowod reguly anonimizacji (ADR-0001, docs/adr/0001-anonimizacja-zapisow-przy-usunieciu-konta.md).
--
-- Usuniecie konta jezdzca nie niszczy historii osrodka:
--   * przeszle zapisy jezdzca - jazdy i odwolania - zostaja w bazie BEZ jezdzca,
--   * przyszle aktywne zapisy sa kasowane, a ich sloty da sie zarezerwowac,
--   * "przeszly" = godzina slotu juz sie skonczyla w strefie Europe/Warsaw (ta sama granica
--     co definicja jazdy w statystykach); zapis na godzine trwajaca jest jeszcze "przyszly",
--   * osrodek nadal widzi zanonimizowane zapisy wlasnej stadniny, inny osrodek i inny
--     jezdziec - nie.
--
-- Przyszle ODWOLANE zapisy nie sa kasowane (regula kasuje tylko aktywne): zostaja bez
-- jezdzca i po swoim terminie licza sie jako odwolanie, tak jak liczylyby sie bez usuniecia konta.
--
-- Jako kto: konto kasuje postgres przez auth.users (tak robi to administracyjne API Auth;
-- kaskada schodzi do public.profiles, gdzie siedzi regula). Odczyty kontrolne ida przez RLS
-- jako wlasciciel Pod Debem (1111...), wlasciciel Nad Rzeka (2222...) i jezdziec Piotr (4444...).
--
-- Wymaga swiezego seeda (`npx supabase db reset` tego samego dnia).
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/rider_deletion_anonymisation.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Anonimizacja: granica "godzina slotu sie skonczyla" (Europe/Warsaw) ==='

begin;

do $$
declare
  v_failures int := 0;
  c record;
begin
  -- Oczekiwane wartosci wypisane z kalendarza, nie przeliczone ta sama formula:
  -- zima (CET, UTC+1): slot 13 konczy sie o 14:00 w Warszawie = 13:00Z;
  -- lato (CEST, UTC+2): slot 13 konczy sie o 14:00 w Warszawie = 12:00Z.
  for c in
    select * from (values
      ('1a godzina konczaca sie dokladnie teraz (zima)',  date '2026-11-10', 13, timestamptz '2026-11-10T13:00:00Z', true),
      ('1b godzina trwajaca (zima)',                      date '2026-11-10', 13, timestamptz '2026-11-10T12:59:59Z', false),
      ('1c godzina przyszla tego samego dnia',            date '2026-11-10', 15, timestamptz '2026-11-10T13:30:00Z', false),
      ('1d dzien miniony',                                date '2026-11-09', 15, timestamptz '2026-11-10T13:30:00Z', true),
      ('1e dzien przyszly',                               date '2026-11-11',  8, timestamptz '2026-11-10T13:30:00Z', false),
      ('1f godzina konczaca sie dokladnie teraz (lato)',  date '2026-07-10', 13, timestamptz '2026-07-10T12:00:00Z', true),
      ('1g godzina trwajaca (lato)',                      date '2026-07-10', 13, timestamptz '2026-07-10T11:59:59Z', false),
      ('1h polnoc w Warszawie, w UTC jeszcze wczoraj',    date '2026-11-09', 23, timestamptz '2026-11-09T23:00:00Z', true),
      ('1i 23:59 w Warszawie - slot 23 jeszcze trwa',     date '2026-11-09', 23, timestamptz '2026-11-09T22:59:59Z', false)
    ) as t (label, day, hour, at, expected)
  loop
    if private.booking_slot_ended(c.day, c.hour::smallint, c.at) is not distinct from c.expected then
      raise notice 'PASS %', c.label;
    else
      raise notice 'FAIL %: oczekiwano %', c.label, c.expected;
      v_failures := v_failures + 1;
    end if;
  end loop;

  if v_failures > 0 then
    raise exception '% asercji granicy nie przeszlo', v_failures;
  end if;
end $$;

\echo '=== Anonimizacja: setup (postgres) ==='

do $$
declare
  c_anna constant uuid := '33333333-3333-3333-3333-333333333333';
  c_piotr constant uuid := '44444444-4444-4444-4444-444444444444';
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_hour smallint := extract(hour from now() at time zone 'Europe/Warsaw')::smallint;
  v_stable bigint;
  v_bella bigint;
  v_kasztan bigint;
  v_seed_day bigint;
  v_yesterday bigint;
  v_today_day bigint;
  v_id bigint;
begin
  select s.id into v_stable
  from public.stables s
  where s.owner_id = '11111111-1111-1111-1111-111111111111';

  select h.id into v_bella from public.horses h where h.stable_id = v_stable and h.name = 'Bella';
  select h.id into v_kasztan from public.horses h where h.stable_id = v_stable and h.name = 'Kasztan';

  select sd.id into v_seed_day
  from public.schedule_days sd
  where sd.stable_id = v_stable and sd.day = current_date + 1;

  -- Przyszly aktywny zapis Anny z seeda: Bella@11 na jutro.
  select b.id into v_id
  from public.bookings b
  where b.schedule_day_id = v_seed_day and b.horse_id = v_bella and b.hour = 11
    and b.status = 'active' and b.rider_id = c_anna;

  if v_stable is null or v_bella is null or v_kasztan is null or v_seed_day is null or v_id is null then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;
  perform set_config('app.future_active', v_id::text, true);

  -- Przyszly ODWOLANY zapis Anny: Kasztan@12 na jutro.
  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id, status, cancelled_at)
  values (v_seed_day, v_kasztan, 12, c_anna, 'cancelled', now())
  returning id into v_id;
  perform set_config('app.future_cancelled', v_id::text, true);

  -- Wczoraj (czas polski): caly dzien juz minal.
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, v_today - 1, 0, 24)
  returning id into v_yesterday;
  insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
  values (v_yesterday, v_bella, v_stable);

  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
  values (v_yesterday, v_bella, 10, c_anna)
  returning id into v_id;
  perform set_config('app.past_ride', v_id::text, true);

  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id, status, cancelled_at)
  values (v_yesterday, v_bella, 11, c_anna, 'cancelled', now())
  returning id into v_id;
  perform set_config('app.past_cancelled', v_id::text, true);

  -- Kontrola: przeszla jazda innego jezdzca nie moze zostac tknieta.
  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
  values (v_yesterday, v_bella, 12, c_piotr)
  returning id into v_id;
  perform set_config('app.piotr_ride', v_id::text, true);

  -- Dzis (czas polski), caly dzien wystawiony. Tuz po polnocy "jutro" z seeda (liczone
  -- w strefie sesji) bywa polskim "dzis" - wtedy rozszerzamy istniejacy dzien.
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, v_today, 0, 24)
  on conflict (stable_id, day) do update set open_hour = 0, close_hour = 24
  returning id into v_today_day;
  insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
  values (v_today_day, v_kasztan, v_stable)
  on conflict do nothing;

  -- Godzina trwajaca: zapis nie jest jeszcze jazda, wiec liczy sie jako przyszly.
  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
  values (v_today_day, v_kasztan, v_hour, c_anna)
  returning id into v_id;
  perform set_config('app.ongoing', v_id::text, true);

  -- Godzina dzis juz zakonczona (o polnocy takiej nie ma - asercja jest wtedy pomijana).
  if v_hour >= 1 then
    insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
    values (v_today_day, v_kasztan, v_hour - 1, c_anna)
    returning id into v_id;
    perform set_config('app.ended_today', v_id::text, true);
  else
    perform set_config('app.ended_today', '', true);
  end if;

  perform set_config('app.seed_day', v_seed_day::text, true);
  perform set_config('app.bella', v_bella::text, true);

  raise notice 'setup: dzis=% godzina=%', v_today, v_hour;
end $$;

\echo '=== Anonimizacja: usuniecie konta jezdzca (postgres, przez auth.users) ==='

delete from auth.users where id = '33333333-3333-3333-3333-333333333333';

do $$
declare
  v_failures int := 0;
  v int;
  b record;
  r record;
begin
  select count(*) into v from public.profiles where id = '33333333-3333-3333-3333-333333333333';
  if v = 0 then
    raise notice 'PASS 2: profil jezdzca usuniety razem z kontem';
  else
    raise notice 'FAIL 2: profil jezdzca nadal istnieje';
    v_failures := v_failures + 1;
  end if;

  -- 3. Przeszle zapisy zostaja bez jezdzca, z niezmienionym statusem.
  for r in
    select * from (values
      ('3a przeszla jazda',               'app.past_ride',        'active'),
      ('3b przeszle odwolanie',           'app.past_cancelled',   'cancelled'),
      ('3c jazda z dzis, godzina minela', 'app.ended_today',      'active'),
      ('3d przyszle odwolanie',           'app.future_cancelled', 'cancelled')
    ) as t (label, setting, status)
  loop
    if current_setting(r.setting) = '' then
      raise notice 'SKIP %: o tej porze nie ma takiego slotu', r.label;
      continue;
    end if;
    select count(*) as n, bool_and(rider_id is null) as anonymised, min(status) as status
      into b
    from public.bookings where id = current_setting(r.setting)::bigint;
    if b.n = 1 and b.anonymised and b.status = r.status then
      raise notice 'PASS %: zapis istnieje bez jezdzca (%)', r.label, b.status;
    else
      raise notice 'FAIL %: wierszy=% bez_jezdzca=% status=%', r.label, b.n, b.anonymised, b.status;
      v_failures := v_failures + 1;
    end if;
  end loop;

  -- 4. Przyszle aktywne zapisy znikaja - takze zapis na godzine, ktora jeszcze trwa.
  for r in
    select * from (values
      ('4a przyszly aktywny zapis',       'app.future_active'),
      ('4b zapis na godzine trwajaca',    'app.ongoing')
    ) as t (label, setting)
  loop
    select count(*) into v from public.bookings where id = current_setting(r.setting)::bigint;
    if v = 0 then
      raise notice 'PASS %: skasowany', r.label;
    else
      raise notice 'FAIL %: zapis nadal istnieje', r.label;
      v_failures := v_failures + 1;
    end if;
  end loop;

  -- 5. Zapisy innego jezdzca sa nietkniete.
  select count(*) into v
  from public.bookings
  where id = current_setting('app.piotr_ride')::bigint
    and rider_id = '44444444-4444-4444-4444-444444444444' and status = 'active';
  if v = 1 then
    raise notice 'PASS 5: jazda innego jezdzca nietknieta';
  else
    raise notice 'FAIL 5: jazda innego jezdzca zmieniona albo skasowana';
    v_failures := v_failures + 1;
  end if;

  if v_failures > 0 then
    raise exception '% asercji stanu po usunieciu konta nie przeszlo', v_failures;
  end if;
end $$;

\echo '=== Anonimizacja: zwolniony slot rezerwuje inny jezdziec (RLS) ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

do $$
declare
  v int;
begin
  insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
  values (current_setting('app.seed_day')::bigint, current_setting('app.bella')::bigint, 11,
          '44444444-4444-4444-4444-444444444444');
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 6: rezerwacja zwolnionego slotu dotknela % wierszy', v;
  end if;
  raise notice 'PASS 6: zwolniony slot Bella@11 zarezerwowany przez innego jezdzca';

  -- Inny jezdziec nie widzi zanonimizowanych zapisow.
  select count(*) into v from public.bookings where rider_id is null;
  if v <> 0 then
    raise exception 'FAIL 7: jezdziec widzi % zapisow bez jezdzca', v;
  end if;
  raise notice 'PASS 7: inny jezdziec nie widzi zapisow bez jezdzca';
end $$;

\echo '=== Anonimizacja: widocznosc dla osrodkow (RLS) ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v
  from public.bookings
  where rider_id is null
    and id in (current_setting('app.past_ride')::bigint, current_setting('app.past_cancelled')::bigint);
  if v <> 2 then
    raise exception 'FAIL 8: osrodek widzi % z 2 zanonimizowanych zapisow wlasnej stadniny', v;
  end if;
  raise notice 'PASS 8: osrodek widzi zanonimizowane zapisy wlasnej stadniny';
end $$;

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.bookings where rider_id is null;
  if v <> 0 then
    raise exception 'FAIL 9: obcy osrodek widzi % zanonimizowanych zapisow', v;
  end if;
  raise notice 'PASS 9: obcy osrodek nie widzi zanonimizowanych zapisow';
end $$;

rollback;

\echo '--- WSZYSTKIE ASERCJE ANONIMIZACJI PRZESZLY ---'
