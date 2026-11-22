-- Dowod tabeli stawek (#94, spec #93, GLOSSARY "Stawka").
--
-- Gwarancje w bazie, nie w aplikacji - public.rates:
--   * wlasciciel widzi i zmienia wylacznie stawki swojego osrodka (row_count 1 + odczyt po zapisie),
--   * wlasciciel innego osrodka, instruktor bez uprawnienia i z uprawnieniem do ukladania grafiku,
--     jezdziec - zero wierszy i odmowa zapisu (42501 albo 0 wierszy); anon - 42501,
--   * reguly czasu (Europe/Warsaw): zmiana "od" biezacego albo nastepnego miesiaca; miniony i za dwa
--     miesiace - SB026; usuniecie biezacej - SB027, zaplanowanej - tak; klucz wiersza niezmienny - SB028,
--   * drugi zapis na ten sam miesiac nadpisuje kwote (upsert jak w PostgREST, NULLS NOT DISTINCT),
--   * granice kwoty 0..1 000 000 groszy, stawka osrodka zawsze z kwota, miesiac od 1. dnia (23514),
--   * stawka indywidualna tylko dla jezdzca osrodka (42501 dla obcego), pusta kwota dozwolona,
--   * stawka indywidualna (#97): te same reguly czasu (SB026, SB027), zapis na ten sam miesiac nadpisuje
--     (takze powrotem do stawki osrodka), konto instruktora to nie jezdziec (42501); wlascicielka innego
--     osrodka, instruktorka (bez i z uprawnieniem) i jezdziec - odmowa zapisu stawki indywidualnej,
--   * usuniecie konta jezdzca usuwa jego stawki (takze obowiazujace), stawka osrodka zostaje.
--
-- "Biezacy miesiac" liczy baza (private.warsaw_month_start()), nigdy skrypt na sztywno.
-- Persony z seeda: wlasciciel Pod Dębem (1111...), wlascicielka Nad Rzeką (2222...), Joanna Wrona
-- (9999..., instruktorka Pod Dębem, nie wlascicielka), Anna (3333..., jezdziec Pod Dębem - zapis
-- jutro u Joanny), Piotr (4444..., jezdziec tylko Nad Rzeką).
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/settlement_rates.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Stawki: setup (postgres) ==='

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
  if exists (select 1 from public.rates) then
    raise exception 'Tabela stawek nie jest pusta (scenariusz e2e?) - uruchom npx supabase db reset';
  end if;

  -- Stawka osrodka Nad Rzeką - cudzy wiersz dla wlasciciela Pod Dębem.
  insert into public.rates (stable_id, from_month, amount) values (v_rzeka, v_current, 9000);

  perform set_config('app.debem', v_debem::text, true);
  perform set_config('app.rzeka', v_rzeka::text, true);
  perform set_config('app.current', v_current::text, true);
  perform set_config('app.next', (v_current + interval '1 month')::date::text, true);
  perform set_config('app.previous', (v_current - interval '1 month')::date::text, true);
  perform set_config('app.after_next', (v_current + interval '2 months')::date::text, true);
end $$;

set local role authenticated;

\echo '=== Wlasciciel: ustawia, nadpisuje, planuje i usuwa zaplanowana zmiane ==='

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v_current date := current_setting('app.current')::date;
  v_next date := current_setting('app.next')::date;
  v int;
  v_amount int;
  v_planned bigint;
  v_in_force bigint;
begin
  select count(*) into v from public.rates;
  if v <> 0 then
    raise exception 'FAIL 1: wlasciciel Pod Dębem widzi % cudzych stawek', v;
  end if;
  raise notice 'PASS 1: wlasciciel nie widzi stawek innego osrodka';

  insert into public.rates (stable_id, from_month, amount) values (v_debem, v_current, 12000)
  returning id into v_in_force;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 2: zapis stawki od biezacego miesiaca - % wierszy', v;
  end if;
  raise notice 'PASS 2: stawka osrodka od biezacego miesiaca zapisana';

  -- Drugi zapis na ten sam miesiac - jak upsert PostgREST (on_conflict po kolumnach klucza).
  insert into public.rates (stable_id, rider_id, from_month, amount) values (v_debem, null, v_current, 13050)
  on conflict (stable_id, rider_id, from_month) do update set amount = excluded.amount;
  select count(*), max(amount) into v, v_amount from public.rates where stable_id = v_debem and from_month = v_current;
  if v <> 1 or v_amount <> 13050 then
    raise exception 'FAIL 3: po drugim zapisie na ten sam miesiac: wierszy=% kwota=%', v, v_amount;
  end if;
  raise notice 'PASS 3: drugi zapis na ten sam miesiac nadpisuje kwote';

  insert into public.rates (stable_id, from_month, amount) values (v_debem, v_next, 14000)
  returning id into v_planned;
  raise notice 'PASS 4: zmiana zaplanowana od nastepnego miesiaca zapisana';

  begin
    delete from public.rates where id = v_in_force;
    raise exception 'FAIL 5: usuniecie obowiazujacej zmiany przeszlo';
  exception when sqlstate 'SB027' then
    raise notice 'PASS 5: usuniecie obowiazujacej zmiany - SB027';
  end;
  select count(*) into v from public.rates where id = v_in_force;
  if v <> 1 then
    raise exception 'FAIL 5b: obowiazujaca zmiana zniknela po odmowie';
  end if;

  delete from public.rates where id = v_planned;
  get diagnostics v = row_count;
  if v <> 1 or exists (select 1 from public.rates where id = v_planned) then
    raise exception 'FAIL 6: usuniecie zaplanowanej zmiany - % wierszy', v;
  end if;
  raise notice 'PASS 6: zaplanowana zmiana usunieta';

  begin
    update public.rates set from_month = v_next where id = v_in_force;
    raise exception 'FAIL 7: zmiana miesiaca istniejacej zmiany przeszla';
  exception when sqlstate 'SB028' then
    raise notice 'PASS 7: miesiac zmiany niezmienny - SB028';
  end;

  update public.rates set amount = 0 where id = v_in_force;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 8: stawka 0,00 zl - % wierszy', v;
  end if;
  raise notice 'PASS 8: stawka 0,00 zl dozwolona';
end $$;

\echo '=== Wlasciciel: reguly czasu i granice ==='

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  r record;
begin
  for r in
    select * from (values
      ('9a od minionego miesiaca', current_setting('app.previous')::date, 12000, 'SB026'),
      ('9b od miesiaca za dwa',    current_setting('app.after_next')::date, 12000, 'SB026'),
      -- Wyzwalacz dziala przed CHECK-iem, wiec dzien inny niz 1. odpada juz na regule miesiaca.
      ('9c nie od 1. dnia',        current_setting('app.next')::date + 1, 12000, 'SB026'),
      ('9d kwota ujemna',          current_setting('app.next')::date, -1, '23514'),
      ('9e ponad 10 000,00 zl',    current_setting('app.next')::date, 1000001, '23514'),
      ('9f stawka osrodka bez kwoty', current_setting('app.next')::date, null, '23514')
    ) as t (label, from_month, amount, code)
  loop
    begin
      insert into public.rates (stable_id, from_month, amount) values (v_debem, r.from_month, r.amount);
      raise exception 'FAIL %: zapis przeszedl', r.label;
    exception when others then
      if sqlstate <> r.code then
        raise exception 'FAIL %: oczekiwano %, jest % (%)', r.label, r.code, sqlstate, sqlerrm;
      end if;
      raise notice 'PASS %: %', r.label, r.code;
    end;
  end loop;

  insert into public.rates (stable_id, from_month, amount) values (v_debem, current_setting('app.next')::date, 1000000);
  raise notice 'PASS 9g: 10 000,00 zl dozwolone';
end $$;

\echo '=== Wlasciciel: stawka indywidualna tylko dla jezdzca osrodka ==='

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v int;
begin
  insert into public.rates (stable_id, rider_id, from_month, amount)
  values (v_debem, '33333333-3333-3333-3333-333333333333', current_setting('app.current')::date, 10000),
         (v_debem, '33333333-3333-3333-3333-333333333333', current_setting('app.next')::date, null);
  get diagnostics v = row_count;
  if v <> 2 then
    raise exception 'FAIL 10: stawka indywidualna Anny - % wierszy', v;
  end if;
  raise notice 'PASS 10: stawka indywidualna jezdzca osrodka i powrot do stawki osrodka (pusta kwota)';

  begin
    insert into public.rates (stable_id, rider_id, from_month, amount)
    values (v_debem, '44444444-4444-4444-4444-444444444444', current_setting('app.current')::date, 10000);
    raise exception 'FAIL 11: stawka dla jezdzca spoza osrodka przeszla';
  exception when insufficient_privilege then
    raise notice 'PASS 11: stawka dla jezdzca spoza osrodka - 42501';
  end;
end $$;

\echo '=== Wlasciciel: stawka indywidualna - reguly czasu, nadpisanie, powrot do stawki osrodka (#97) ==='

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v_current date := current_setting('app.current')::date;
  v_next date := current_setting('app.next')::date;
  v_anna uuid := '33333333-3333-3333-3333-333333333333';
  r record;
  v int;
  v_amount int;
begin
  for r in
    select * from (values
      ('18a stawka indywidualna od minionego miesiaca', current_setting('app.previous')::date),
      ('18b stawka indywidualna od miesiaca za dwa',    current_setting('app.after_next')::date)
    ) as t (label, from_month)
  loop
    begin
      insert into public.rates (stable_id, rider_id, from_month, amount) values (v_debem, v_anna, r.from_month, 9000);
      raise exception 'FAIL %: zapis przeszedl', r.label;
    exception when sqlstate 'SB026' then
      raise notice 'PASS %: SB026', r.label;
    end;
  end loop;

  begin
    insert into public.rates (stable_id, rider_id, from_month, amount)
    values (v_debem, '99999999-9999-9999-9999-999999999999', v_current, 9000);
    raise exception 'FAIL 19: stawka indywidualna dla konta instruktorki przeszla';
  exception when insufficient_privilege then
    raise notice 'PASS 19: konto instruktorki to nie jezdziec osrodka - 42501';
  end;

  -- Drugi zapis na ten sam miesiac - jak upsert PostgREST; 0,00 zl, potem powrot do stawki osrodka.
  insert into public.rates (stable_id, rider_id, from_month, amount) values (v_debem, v_anna, v_current, 0)
  on conflict (stable_id, rider_id, from_month) do update set amount = excluded.amount;
  insert into public.rates (stable_id, rider_id, from_month, amount) values (v_debem, v_anna, v_current, null)
  on conflict (stable_id, rider_id, from_month) do update set amount = excluded.amount;
  select count(*), max(amount) into v, v_amount
  from public.rates where stable_id = v_debem and rider_id = v_anna and from_month = v_current;
  if v <> 1 or v_amount is not null then
    raise exception 'FAIL 20: po nadpisaniu stawki indywidualnej: wierszy=% kwota=%', v, v_amount;
  end if;
  raise notice 'PASS 20: zapis na ten sam miesiac nadpisuje stawke indywidualna, takze powrotem do stawki osrodka';

  begin
    delete from public.rates where stable_id = v_debem and rider_id = v_anna and from_month = v_current;
    raise exception 'FAIL 21: usuniecie obowiazujacej zmiany jezdzca przeszlo';
  exception when sqlstate 'SB027' then
    raise notice 'PASS 21: usuniecie obowiazujacej zmiany jezdzca - SB027';
  end;

  delete from public.rates where stable_id = v_debem and rider_id = v_anna and from_month = v_next;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 22: usuniecie zaplanowanej zmiany jezdzca - % wierszy', v;
  end if;
  raise notice 'PASS 22: zaplanowana zmiana jezdzca usunieta';
end $$;

\echo '=== Wlasciciel innego osrodka: zero wierszy, odmowa zapisu ==='

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v int;
begin
  select count(*) into v from public.rates where stable_id = v_debem;
  if v <> 0 then
    raise exception 'FAIL 12: wlascicielka Nad Rzeką widzi % stawek Pod Dębem', v;
  end if;
  select count(*) into v from public.rates;
  if v <> 1 then
    raise exception 'FAIL 12b: wlascicielka Nad Rzeką nie widzi swojej stawki (%)', v;
  end if;

  update public.rates set amount = 1 where stable_id = v_debem;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 13: cudza zmiana stawki - % wierszy', v;
  end if;
  delete from public.rates where stable_id = v_debem;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 13b: cudze usuniecie - % wierszy', v;
  end if;

  begin
    insert into public.rates (stable_id, from_month, amount) values (v_debem, current_setting('app.next')::date, 1);
    raise exception 'FAIL 14: zapis stawki do cudzego osrodka przeszedl';
  exception when insufficient_privilege then
    raise notice 'PASS 12-14: wlascicielka innego osrodka nie widzi, nie zmienia i nie dopisuje stawek';
  end;
end $$;

do $$
begin
  -- Anna nie ma zapisu w osrodku Nad Rzeką - wlascicielka nie ustawi jej stawki ani u siebie.
  insert into public.rates (stable_id, rider_id, from_month, amount)
  values (current_setting('app.rzeka')::bigint, '33333333-3333-3333-3333-333333333333',
          current_setting('app.current')::date, 9000);
  raise exception 'FAIL 23: stawka indywidualna dla jezdzca cudzego osrodka przeszla';
exception when insufficient_privilege then
  raise notice 'PASS 23: wlascicielka innego osrodka - stawka indywidualna jezdzca spoza osrodka - 42501';
end $$;

\echo '=== Instruktor (bez i z uprawnieniem do ukladania grafiku), jezdziec: nic ==='

reset role;
update public.instructors set arranges_schedule = false
where account_id = '99999999-9999-9999-9999-999999999999';
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.rates;
  if v <> 0 then
    raise exception 'FAIL 15 instruktorka bez uprawnienia: widzi % stawek', v;
  end if;
  update public.rates set amount = 1;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 15 instruktorka bez uprawnienia: zmienia % stawek', v;
  end if;
  delete from public.rates where from_month > current_setting('app.current')::date;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 15 instruktorka bez uprawnienia: usuwa % stawek', v;
  end if;
  begin
    insert into public.rates (stable_id, from_month, amount)
    values (current_setting('app.debem')::bigint, current_setting('app.next')::date, 1);
    raise exception 'FAIL 15 instruktorka bez uprawnienia: zapis stawki przeszedl';
  exception when insufficient_privilege then
    raise notice 'PASS 15 instruktorka bez uprawnienia: zero wierszy, odmowa zapisu';
  end;
end $$;

reset role;
update public.instructors set arranges_schedule = true
where account_id = '99999999-9999-9999-9999-999999999999';
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.rates;
  if v <> 0 then
    raise exception 'FAIL 15 instruktorka z uprawnieniem: widzi % stawek', v;
  end if;
  update public.rates set amount = 1;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 15 instruktorka z uprawnieniem: zmienia % stawek', v;
  end if;
  delete from public.rates where from_month > current_setting('app.current')::date;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 15 instruktorka z uprawnieniem: usuwa % stawek', v;
  end if;
  begin
    insert into public.rates (stable_id, from_month, amount)
    values (current_setting('app.debem')::bigint, current_setting('app.next')::date, 1);
    raise exception 'FAIL 15 instruktorka z uprawnieniem: zapis stawki przeszedl';
  exception when insufficient_privilege then
    raise notice 'PASS 15 instruktorka z uprawnieniem: zero wierszy, odmowa zapisu';
  end;
end $$;

reset role;
update public.instructors set arranges_schedule = false
where account_id = '99999999-9999-9999-9999-999999999999';
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.rates;
  if v <> 0 then
    raise exception 'FAIL 15 jezdziec: widzi % stawek', v;
  end if;
  update public.rates set amount = 1;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 15 jezdziec: zmienia % stawek', v;
  end if;
  delete from public.rates where from_month > current_setting('app.current')::date;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 15 jezdziec: usuwa % stawek', v;
  end if;
  begin
    insert into public.rates (stable_id, from_month, amount)
    values (current_setting('app.debem')::bigint, current_setting('app.next')::date, 1);
    raise exception 'FAIL 15 jezdziec: zapis stawki przeszedl';
  exception when insufficient_privilege then
    raise notice 'PASS 15 jezdziec: zero wierszy, odmowa zapisu';
  end;
end $$;

\echo '=== Instruktorka (bez i z uprawnieniem), jezdziec: odmowa zapisu stawki indywidualnej (#97) ==='

reset role;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('instruktorka bez uprawnienia', '99999999-9999-9999-9999-999999999999', false),
      ('instruktorka z uprawnieniem',  '99999999-9999-9999-9999-999999999999', true),
      ('jezdziec (dla siebie)',        '33333333-3333-3333-3333-333333333333', false)
    ) as t (label, sub, arranges)
  loop
    update public.instructors set arranges_schedule = r.arranges
    where account_id = '99999999-9999-9999-9999-999999999999';
    perform set_config('request.jwt.claims', json_build_object('sub', r.sub, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      insert into public.rates (stable_id, rider_id, from_month, amount)
      values (current_setting('app.debem')::bigint, '33333333-3333-3333-3333-333333333333',
              current_setting('app.next')::date, 1);
      raise exception 'FAIL 24 %: zapis stawki indywidualnej przeszedl', r.label;
    exception when insufficient_privilege then
      raise notice 'PASS 24 %: odmowa zapisu stawki indywidualnej', r.label;
    end;
    reset role;
  end loop;
  update public.instructors set arranges_schedule = false
  where account_id = '99999999-9999-9999-9999-999999999999';
end $$;

\echo '=== anon: brak dostepu ==='

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  perform count(*) from public.rates;
  raise exception 'FAIL 16: anon czyta stawki';
exception when insufficient_privilege then
  raise notice 'PASS 16: anon - 42501';
end $$;

\echo '=== Usuniecie konta jezdzca usuwa jego stawki ==='

reset role;
delete from auth.users where id = '33333333-3333-3333-3333-333333333333';

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v int;
begin
  select count(*) into v from public.rates where rider_id = '33333333-3333-3333-3333-333333333333';
  if v <> 0 then
    raise exception 'FAIL 17: po usunieciu konta zostalo % stawek jezdzca', v;
  end if;
  select count(*) into v from public.rates where stable_id = v_debem and rider_id is null;
  if v <> 2 then
    raise exception 'FAIL 17b: po usunieciu konta jezdzca stawki osrodka: % (oczekiwano 2)', v;
  end if;
  raise notice 'PASS 17: usuniecie konta jezdzca usuwa jego stawki (takze obowiazujaca), stawki osrodka zostaja';
end $$;

rollback;
