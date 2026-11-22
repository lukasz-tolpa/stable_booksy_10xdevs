-- Dowod tabeli kosztow dodatkowych (#96, spec #93, GLOSSARY "Koszt dodatkowy").
--
-- Gwarancje w bazie, nie w aplikacji - public.extra_costs:
--   * wlasciciel widzi, dopisuje, poprawia i usuwa wylacznie koszty swojego osrodka,
--   * wlasciciel innego osrodka, instruktor bez uprawnienia i z uprawnieniem do ukladania grafiku,
--     jezdziec - zero wierszy i odmowa zapisu (42501 albo 0 wierszy); anon - 42501,
--   * regula czasu (Europe/Warsaw): koszt w biezacym i minionym miesiacu tak, w nastepnym - SB029;
--     poprawka i usuniecie kosztu minionego miesiaca - tak,
--   * poprawic mozna tylko nazwe i kwote (miesiac, jezdziec - 42501),
--   * granice: kwota 1..10 000 000 groszy, nazwa 1-80 znakow przycieta, miesiac od 1. dnia (23514),
--   * koszt tylko dla jezdzca osrodka: obcy i nieznany - 42501; jezdziec z samym odwolanym zapisem
--     w osrodku - tak; jezdzcy do wyboru (profile role rider pod RLS wlasciciela) = konta z jakimkolwiek
--     zapisem w osrodku,
--   * usuniecie konta jezdzca usuwa jego koszty, koszty innych jezdzcow zostaja.
--
-- "Biezacy miesiac" liczy baza (private.warsaw_month_start()), nigdy skrypt na sztywno.
-- Persony z seeda: wlasciciel Pod Dębem (1111...), wlascicielka Nad Rzeką (2222...), Joanna Wrona
-- (9999..., instruktorka Pod Dębem, nie wlascicielka), Anna (3333..., jezdziec Pod Dębem - zapis
-- jutro u Joanny o 11), Piotr (4444..., jezdziec tylko Nad Rzeką).
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/settlement_extra_costs.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Koszty dodatkowe: setup (postgres) ==='

begin;

do $$
declare
  v_debem bigint;
  v_rzeka bigint;
  v_current date := private.warsaw_month_start();
begin
  select id into v_debem from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_rzeka from public.stables where owner_id = '22222222-2222-2222-2222-222222222222';
  if v_debem is null or v_rzeka is null then
    raise exception 'Brak danych seeda - uruchom npx supabase db reset';
  end if;
  if exists (select 1 from public.extra_costs) then
    raise exception 'Tabela kosztow dodatkowych nie jest pusta (scenariusz e2e?) - uruchom npx supabase db reset';
  end if;

  -- Koszt Piotra w Nad Rzeką - cudzy wiersz dla wlasciciela Pod Dębem.
  insert into public.extra_costs (stable_id, rider_id, month, name, amount)
  values (v_rzeka, '44444444-4444-4444-4444-444444444444', v_current, 'Pensjonat konia', 80000);

  perform set_config('app.debem', v_debem::text, true);
  perform set_config('app.current', v_current::text, true);
  perform set_config('app.next', (v_current + interval '1 month')::date::text, true);
  perform set_config('app.previous', (v_current - interval '1 month')::date::text, true);
end $$;

-- Regula czasu obowiazuje takze superusera (dane demo, migracje).
do $$
begin
  insert into public.extra_costs (stable_id, rider_id, month, name, amount)
  values (current_setting('app.debem')::bigint, '33333333-3333-3333-3333-333333333333',
          current_setting('app.next')::date, 'Pensjonat konia', 100);
  raise exception 'FAIL 0: postgres dopisal koszt w nastepnym miesiacu';
exception when sqlstate 'SB029' then
  raise notice 'PASS 0: regula miesiaca obowiazuje takze postgres - SB029';
end $$;

set local role authenticated;

\echo '=== Wlasciciel: dopisuje, poprawia i usuwa koszty, takze w minionym miesiacu ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v_current date := current_setting('app.current')::date;
  v_previous date := current_setting('app.previous')::date;
  v int;
  v_current_cost bigint;
  v_past_cost bigint;
  r record;
begin
  select count(*) into v from public.extra_costs;
  if v <> 0 then
    raise exception 'FAIL 1: wlasciciel Pod Dębem widzi % cudzych kosztow', v;
  end if;
  raise notice 'PASS 1: wlasciciel nie widzi kosztow innego osrodka';

  insert into public.extra_costs (stable_id, rider_id, month, name, amount)
  values (v_debem, '33333333-3333-3333-3333-333333333333', v_current, 'Pensjonat konia', 80000)
  returning id into v_current_cost;
  insert into public.extra_costs (stable_id, rider_id, month, name, amount)
  values (v_debem, '33333333-3333-3333-3333-333333333333', v_previous, 'Wypożyczenie siodła', 5050)
  returning id into v_past_cost;
  select count(*) into v from public.extra_costs where stable_id = v_debem;
  if v <> 2 then
    raise exception 'FAIL 2: koszty w biezacym i minionym miesiacu - % wierszy', v;
  end if;
  raise notice 'PASS 2: koszt w biezacym i w minionym miesiacu zapisany i widoczny';

  begin
    insert into public.extra_costs (stable_id, rider_id, month, name, amount)
    values (v_debem, '33333333-3333-3333-3333-333333333333', current_setting('app.next')::date, 'Pensjonat konia', 100);
    raise exception 'FAIL 3: koszt w nastepnym miesiacu przeszedl';
  exception when sqlstate 'SB029' then
    raise notice 'PASS 3: koszt w nastepnym miesiacu - SB029';
  end;

  update public.extra_costs set name = 'Pensjonat konia (listopad)', amount = 75050 where id = v_current_cost;
  get diagnostics v = row_count;
  select * into r from public.extra_costs where id = v_current_cost;
  if v <> 1 or r.name <> 'Pensjonat konia (listopad)' or r.amount <> 75050 then
    raise exception 'FAIL 4: poprawka kosztu - % wierszy, nazwa=% kwota=%', v, r.name, r.amount;
  end if;
  update public.extra_costs set amount = 6000 where id = v_past_cost;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 4b: poprawka kosztu minionego miesiaca - % wierszy', v;
  end if;
  raise notice 'PASS 4: poprawka nazwy i kwoty, takze w minionym miesiacu';

  begin
    update public.extra_costs set month = v_previous where id = v_current_cost;
    raise exception 'FAIL 5: zmiana miesiaca kosztu przeszla';
  exception when insufficient_privilege then
    raise notice 'PASS 5: miesiac kosztu niezmienny - 42501';
  end;
  begin
    update public.extra_costs set rider_id = '44444444-4444-4444-4444-444444444444' where id = v_current_cost;
    raise exception 'FAIL 5b: zmiana jezdzca kosztu przeszla';
  exception when insufficient_privilege then
    raise notice 'PASS 5b: jezdziec kosztu niezmienny - 42501';
  end;

  delete from public.extra_costs where id = v_past_cost;
  get diagnostics v = row_count;
  if v <> 1 or exists (select 1 from public.extra_costs where id = v_past_cost) then
    raise exception 'FAIL 6: usuniecie kosztu minionego miesiaca - % wierszy', v;
  end if;
  raise notice 'PASS 6: koszt minionego miesiaca usuniety';
end $$;

\echo '=== Wlasciciel: granice kwoty, nazwy i miesiaca ==='

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  r record;
begin
  for r in
    select * from (values
      ('7a kwota 0,00 zl',        current_setting('app.current')::date, 'Pensjonat', 0, '23514'),
      ('7b kwota ujemna',         current_setting('app.current')::date, 'Pensjonat', -100, '23514'),
      ('7c ponad 100 000,00 zl',  current_setting('app.current')::date, 'Pensjonat', 10000001, '23514'),
      ('7d pusta nazwa',          current_setting('app.current')::date, '', 100, '23514'),
      ('7e nazwa ze spacjami',    current_setting('app.current')::date, ' Pensjonat ', 100, '23514'),
      ('7f same spacje',          current_setting('app.current')::date, '   ', 100, '23514'),
      ('7g nazwa 81 znakow',      current_setting('app.current')::date, repeat('ą', 81), 100, '23514'),
      ('7h miesiac nie od 1. dnia', current_setting('app.previous')::date + 1, 'Pensjonat', 100, '23514')
    ) as t (label, month, name, amount, code)
  loop
    begin
      insert into public.extra_costs (stable_id, rider_id, month, name, amount)
      values (v_debem, '33333333-3333-3333-3333-333333333333', r.month, r.name, r.amount);
      raise exception 'FAIL %: zapis przeszedl', r.label;
    exception when others then
      if sqlstate <> r.code then
        raise exception 'FAIL %: oczekiwano %, jest % (%)', r.label, r.code, sqlstate, sqlerrm;
      end if;
      raise notice 'PASS %: %', r.label, r.code;
    end;
  end loop;

  insert into public.extra_costs (stable_id, rider_id, month, name, amount)
  values (v_debem, '33333333-3333-3333-3333-333333333333', current_setting('app.current')::date, repeat('ą', 80), 1),
         (v_debem, '33333333-3333-3333-3333-333333333333', current_setting('app.current')::date, 'X', 10000000);
  raise notice 'PASS 7i: 0,01 zl, 100 000,00 zl, nazwa 1 i 80 znakow dozwolone';
end $$;

\echo '=== Wlasciciel: koszt tylko dla jezdzca osrodka; jezdzcy do wyboru ==='

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v_riders text;
begin
  begin
    insert into public.extra_costs (stable_id, rider_id, month, name, amount)
    values (v_debem, '44444444-4444-4444-4444-444444444444', current_setting('app.current')::date, 'Pensjonat', 100);
    raise exception 'FAIL 8: koszt dla jezdzca spoza osrodka przeszedl';
  exception when insufficient_privilege then
    raise notice 'PASS 8: koszt dla jezdzca spoza osrodka - 42501';
  end;
  begin
    insert into public.extra_costs (stable_id, rider_id, month, name, amount)
    values (v_debem, '00000000-0000-4000-8000-000000000000', current_setting('app.current')::date, 'Pensjonat', 100);
    raise exception 'FAIL 8b: koszt dla nieznanego konta przeszedl';
  exception when insufficient_privilege then
    raise notice 'PASS 8b: koszt dla nieznanego konta - 42501';
  end;

  select string_agg(id::text, ',' order by id) into v_riders from public.profiles where role = 'rider';
  -- Katarzyna (1212...) bez zapisu - pensjonariuszka z koniem w pobycie Pod Dębem (#114).
  if v_riders is distinct from '12121212-1212-1212-1212-121212121212,33333333-3333-3333-3333-333333333333' then
    raise exception 'FAIL 9: jezdzcy do wyboru przed odwolanym zapisem Piotra: %', v_riders;
  end if;
  raise notice 'PASS 9: jezdzcy do wyboru - tylko jezdzcy z zapisem w osrodku i pensjonariuszka';
end $$;

-- Piotr dostaje w Pod Dębem jedynie odwolany zapis (jutro u Joanny o 12).
reset role;
insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, cancelled_at, cancelled_by)
select sd.id, i.id, 12, '44444444-4444-4444-4444-444444444444', 'cancelled', now(), 'rider'
from public.schedule_days sd
join public.instructors i on i.stable_id = sd.stable_id and i.name = 'Joanna Wrona'
where sd.stable_id = current_setting('app.debem')::bigint and sd.day = current_date + 1;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v_riders text;
  v int;
begin
  select string_agg(id::text, ',' order by id) into v_riders from public.profiles where role = 'rider';
  if v_riders is distinct from '12121212-1212-1212-1212-121212121212,33333333-3333-3333-3333-333333333333,44444444-4444-4444-4444-444444444444' then
    raise exception 'FAIL 10: jezdzcy do wyboru po odwolanym zapisie Piotra: % (seed nieaktualny?)', v_riders;
  end if;

  insert into public.extra_costs (stable_id, rider_id, month, name, amount)
  values (v_debem, '44444444-4444-4444-4444-444444444444', current_setting('app.current')::date, 'Pensjonat konia', 90000);
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 10b: koszt jezdzca z samym odwolanym zapisem - % wierszy', v;
  end if;
  raise notice 'PASS 10: jezdziec z samym odwolanym zapisem jest do wyboru i dostaje koszt';
end $$;

\echo '=== Wlasciciel innego osrodka: zero wierszy, odmowa zapisu ==='

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v int;
begin
  select count(*) into v from public.extra_costs where stable_id = v_debem;
  if v <> 0 then
    raise exception 'FAIL 11: wlascicielka Nad Rzeką widzi % kosztow Pod Dębem', v;
  end if;
  select count(*) into v from public.extra_costs;
  if v <> 1 then
    raise exception 'FAIL 11b: wlascicielka Nad Rzeką nie widzi swojego kosztu (%)', v;
  end if;

  update public.extra_costs set amount = 1 where stable_id = v_debem;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 12: cudza poprawka - % wierszy', v;
  end if;
  delete from public.extra_costs where stable_id = v_debem;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 12b: cudze usuniecie - % wierszy', v;
  end if;

  begin
    insert into public.extra_costs (stable_id, rider_id, month, name, amount)
    values (v_debem, '33333333-3333-3333-3333-333333333333', current_setting('app.current')::date, 'Pensjonat', 1);
    raise exception 'FAIL 13: koszt w cudzym osrodku przeszedl';
  exception when insufficient_privilege then
    raise notice 'PASS 11-13: wlascicielka innego osrodka nie widzi, nie zmienia i nie dopisuje kosztow';
  end;
end $$;

\echo '=== Instruktor (bez i z uprawnieniem do ukladania grafiku), jezdziec: nic ==='

create temporary table no_access_personas (label text, account uuid, arranges boolean) on commit drop;
insert into no_access_personas values
  ('instruktorka bez uprawnienia', '99999999-9999-9999-9999-999999999999', false),
  ('instruktorka z uprawnieniem',  '99999999-9999-9999-9999-999999999999', true),
  ('jezdziec',                     '33333333-3333-3333-3333-333333333333', false);
grant select on no_access_personas to authenticated;

do $$
declare
  p record;
  v int;
begin
  for p in select * from no_access_personas loop
    execute 'reset role';
    update public.instructors set arranges_schedule = p.arranges
    where account_id = '99999999-9999-9999-9999-999999999999';
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims',
      json_build_object('sub', p.account, 'role', 'authenticated')::text, true);

    select count(*) into v from public.extra_costs;
    if v <> 0 then
      raise exception 'FAIL 14 %: widzi % kosztow', p.label, v;
    end if;
    update public.extra_costs set amount = 1;
    get diagnostics v = row_count;
    if v <> 0 then
      raise exception 'FAIL 14 %: poprawia % kosztow', p.label, v;
    end if;
    delete from public.extra_costs;
    get diagnostics v = row_count;
    if v <> 0 then
      raise exception 'FAIL 14 %: usuwa % kosztow', p.label, v;
    end if;
    begin
      insert into public.extra_costs (stable_id, rider_id, month, name, amount)
      values (current_setting('app.debem')::bigint, '33333333-3333-3333-3333-333333333333',
              current_setting('app.current')::date, 'Pensjonat', 1);
      raise exception 'FAIL 14 %: zapis kosztu przeszedl', p.label;
    exception when insufficient_privilege then
      raise notice 'PASS 14 %: zero wierszy, odmowa zapisu', p.label;
    end;
  end loop;
end $$;

reset role;
update public.instructors set arranges_schedule = false
where account_id = '99999999-9999-9999-9999-999999999999';

\echo '=== anon: brak dostepu ==='

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  perform count(*) from public.extra_costs;
  raise exception 'FAIL 15: anon czyta koszty';
exception when insufficient_privilege then
  raise notice 'PASS 15: anon - 42501';
end $$;

\echo '=== Usuniecie konta jezdzca usuwa jego koszty ==='

reset role;
delete from auth.users where id = '33333333-3333-3333-3333-333333333333';

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v int;
begin
  select count(*) into v from public.extra_costs where rider_id = '33333333-3333-3333-3333-333333333333';
  if v <> 0 then
    raise exception 'FAIL 16: po usunieciu konta zostalo % kosztow jezdzca', v;
  end if;
  select count(*) into v from public.extra_costs where stable_id = v_debem;
  if v <> 1 then
    raise exception 'FAIL 16b: po usunieciu konta Anny koszty Piotra w Pod Dębem: % (oczekiwano 1)', v;
  end if;
  raise notice 'PASS 16: usuniecie konta jezdzca usuwa jego koszty, koszty innych jezdzcow zostaja';
end $$;

rollback;
