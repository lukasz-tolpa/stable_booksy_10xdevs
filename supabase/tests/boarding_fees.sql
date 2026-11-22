-- Dowod oplaty za pensjonat (#117, spec #112, GLOSSARY „Opłata za pensjonat”).
--
-- Gwarancje w bazie, nie w aplikacji - public.boarding_fees:
--   * wlasciciel osrodka ustawia oplate koniowi pensjonatowemu swojego osrodka od biezacego albo
--     nastepnego miesiaca; miniony i za dwa miesiace - SB060; drugi zapis na ten sam miesiac nadpisuje
--     kwote (upsert jak PostgREST); usuniecie obowiazujacej - SB061, zaplanowanej - tak; kon, osrodek
--     i miesiac niezmienne - SB062; granice kwoty 0..10 000 000 groszy i miesiac od 1. dnia (23514),
--   * oplata tylko dla konia pensjonatowego tego osrodka: kon osrodka i kon innego osrodka - 23503,
--   * dostep: wlasciciel innego osrodka - zero wierszy i odmowa zapisu; pensjonariuszka czyta oplaty
--     swojego konia, ale nie zapisuje (42501) ani nie zmienia i nie usuwa (0 wierszy); inny jezdziec
--     (takze pensjonariusz innego osrodka) i instruktorka - zero cudzych wierszy; anon - 42501,
--   * usuniecie konta pensjonariusza nie usuwa oplat konia (kon zostaje bez wlasciciela); usuniecie
--     konia usuwa jego oplaty, takze obowiazujace (kaskada).
--
-- "Biezacy miesiac" liczy baza (private.warsaw_month_start()), nigdy skrypt na sztywno.
-- Persony z seeda: wlasciciel Pod Dębem (1111...), wlascicielka Nad Rzeką (2222...), Joanna Wrona
-- (9999..., instruktorka Pod Dębem), Anna (3333..., jezdziec Pod Dębem), Piotr (4444..., jezdziec
-- Nad Rzeką - tu dostaje tam konia pensjonatowego Sokol), Katarzyna Zając (1212..., kon Hrabia Pod Dębem).
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/boarding_fees.sql
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Oplata za pensjonat: setup (postgres) ==='

begin;

do $$
declare
  v_debem bigint;
  v_rzeka bigint;
  v_hrabia bigint;
  v_bella bigint;
  v_sokol bigint;
  v_current date := private.warsaw_month_start();
begin
  select id into v_debem from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_rzeka from public.stables where owner_id = '22222222-2222-2222-2222-222222222222';
  select id into v_hrabia from public.horses where stable_id = v_debem and name = 'Hrabia' and kind = 'boarding';
  select id into v_bella from public.horses where stable_id = v_debem and name = 'Bella' and kind = 'stable';
  if v_debem is null or v_rzeka is null or v_hrabia is null or v_bella is null then
    raise exception 'Brak danych seeda (Hrabia, Bella) - uruchom npx supabase db reset';
  end if;
  if exists (select 1 from public.boarding_fees) then
    raise exception 'Tabela oplat za pensjonat nie jest pusta (scenariusz e2e?) - uruchom npx supabase db reset';
  end if;

  -- Kon pensjonatowy Piotra w Nad Rzeką z pobytem i oplata - cudzy wiersz dla Pod Dębem.
  insert into public.horses (stable_id, name, kind) values (v_rzeka, 'Sokół', 'boarding') returning id into v_sokol;
  insert into public.horse_owners (horse_id, stable_id, rider_id)
  values (v_sokol, v_rzeka, '44444444-4444-4444-4444-444444444444');
  insert into public.horse_stays (horse_id, stable_id, arrival_day) values (v_sokol, v_rzeka, private.warsaw_today() - 30);
  insert into public.boarding_fees (horse_id, stable_id, from_month, amount) values (v_sokol, v_rzeka, v_current, 90000);

  perform set_config('app.debem', v_debem::text, true);
  perform set_config('app.rzeka', v_rzeka::text, true);
  perform set_config('app.hrabia', v_hrabia::text, true);
  perform set_config('app.bella', v_bella::text, true);
  perform set_config('app.sokol', v_sokol::text, true);
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
  v_hrabia bigint := current_setting('app.hrabia')::bigint;
  v_current date := current_setting('app.current')::date;
  v_next date := current_setting('app.next')::date;
  v int;
  v_amount int;
  v_in_force bigint;
  v_planned bigint;
begin
  select count(*) into v from public.boarding_fees;
  if v <> 0 then
    raise exception 'FAIL 1: wlasciciel Pod Dębem widzi % cudzych oplat', v;
  end if;
  raise notice 'PASS 1: wlasciciel nie widzi oplat innego osrodka';

  insert into public.boarding_fees (horse_id, stable_id, from_month, amount) values (v_hrabia, v_debem, v_current, 150000)
  returning id into v_in_force;
  get diagnostics v = row_count;
  if v <> 1 or not exists (select 1 from public.boarding_fees where id = v_in_force and amount = 150000) then
    raise exception 'FAIL 2: zapis oplaty od biezacego miesiaca - % wierszy', v;
  end if;
  raise notice 'PASS 2: oplata za pensjonat od biezacego miesiaca zapisana i odczytana';

  -- Drugi zapis na ten sam miesiac - jak upsert PostgREST (on_conflict po kolumnach klucza).
  insert into public.boarding_fees (horse_id, stable_id, from_month, amount) values (v_hrabia, v_debem, v_current, 160000)
  on conflict (horse_id, from_month) do update
    set horse_id = excluded.horse_id, stable_id = excluded.stable_id, from_month = excluded.from_month, amount = excluded.amount;
  select count(*), max(amount) into v, v_amount from public.boarding_fees where horse_id = v_hrabia and from_month = v_current;
  if v <> 1 or v_amount <> 160000 then
    raise exception 'FAIL 3: po drugim zapisie na ten sam miesiac: wierszy=% kwota=%', v, v_amount;
  end if;
  raise notice 'PASS 3: drugi zapis na ten sam miesiac nadpisuje kwote';

  insert into public.boarding_fees (horse_id, stable_id, from_month, amount) values (v_hrabia, v_debem, v_next, 170000)
  returning id into v_planned;
  raise notice 'PASS 4: zmiana zaplanowana od nastepnego miesiaca zapisana';

  begin
    delete from public.boarding_fees where id = v_in_force;
    raise exception 'FAIL 5: usuniecie obowiazujacej oplaty przeszlo';
  exception when sqlstate 'SB061' then
    raise notice 'PASS 5: usuniecie obowiazujacej oplaty - SB061';
  end;

  delete from public.boarding_fees where id = v_planned;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 6: usuniecie zaplanowanej oplaty - % wierszy', v;
  end if;
  raise notice 'PASS 6: zaplanowana zmiana oplaty usunieta';

  begin
    update public.boarding_fees set from_month = v_next where id = v_in_force;
    raise exception 'FAIL 7: zmiana miesiaca oplaty przeszla';
  exception when sqlstate 'SB062' then
    raise notice 'PASS 7: miesiac zmiany oplaty niezmienny - SB062';
  end;

  update public.boarding_fees set amount = 0 where id = v_in_force;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL 8: oplata 0,00 zl - % wierszy', v;
  end if;
  update public.boarding_fees set amount = 150000 where id = v_in_force;
  raise notice 'PASS 8: oplata 0,00 zl dozwolona, poprawka kwoty dziala';
end $$;

\echo '=== Wlasciciel: reguly czasu, granice, tylko kon pensjonatowy swojego osrodka ==='

do $$
declare
  v_debem bigint := current_setting('app.debem')::bigint;
  v_hrabia bigint := current_setting('app.hrabia')::bigint;
  v_current date := current_setting('app.current')::date;
  v_next date := current_setting('app.next')::date;
begin
  begin
    insert into public.boarding_fees (horse_id, stable_id, from_month, amount)
    values (v_hrabia, v_debem, current_setting('app.previous')::date, 1000);
    raise exception 'FAIL 9: oplata od minionego miesiaca przeszla';
  exception when sqlstate 'SB060' then
    raise notice 'PASS 9: oplata od minionego miesiaca - SB060';
  end;
  begin
    insert into public.boarding_fees (horse_id, stable_id, from_month, amount)
    values (v_hrabia, v_debem, current_setting('app.after_next')::date, 1000);
    raise exception 'FAIL 9b: oplata za dwa miesiace przeszla';
  exception when sqlstate 'SB060' then
    raise notice 'PASS 9b: oplata za dwa miesiace - SB060';
  end;

  begin
    insert into public.boarding_fees (horse_id, stable_id, from_month, amount) values (v_hrabia, v_debem, v_next, -1);
    raise exception 'FAIL 10: ujemna oplata przeszla';
  exception when check_violation then
    raise notice 'PASS 10: ujemna oplata - 23514';
  end;
  begin
    insert into public.boarding_fees (horse_id, stable_id, from_month, amount) values (v_hrabia, v_debem, v_next, 10000001);
    raise exception 'FAIL 10b: oplata ponad 100 000,00 zl przeszla';
  exception when check_violation then
    raise notice 'PASS 10b: oplata ponad 100 000,00 zl - 23514';
  end;
  begin
    insert into public.boarding_fees (horse_id, stable_id, from_month, amount) values (v_hrabia, v_debem, v_next + 1, 1000);
    raise exception 'FAIL 10c: miesiac nie od 1. dnia przeszedl';
  exception when sqlstate 'SB060' or check_violation then
    raise notice 'PASS 10c: miesiac nie od 1. dnia odmowiony';
  end;

  begin
    insert into public.boarding_fees (horse_id, stable_id, from_month, amount)
    values (current_setting('app.bella')::bigint, v_debem, v_next, 1000);
    raise exception 'FAIL 11: oplata dla konia osrodka przeszla';
  exception when foreign_key_violation then
    raise notice 'PASS 11: oplata dla konia osrodka - 23503';
  end;
  begin
    insert into public.boarding_fees (horse_id, stable_id, from_month, amount)
    values (current_setting('app.sokol')::bigint, v_debem, v_next, 1000);
    raise exception 'FAIL 11b: oplata dla konia innego osrodka (pod swoim osrodkiem) przeszla';
  exception when foreign_key_violation then
    raise notice 'PASS 11b: oplata dla konia innego osrodka - 23503';
  end;
  begin
    insert into public.boarding_fees (horse_id, stable_id, from_month, amount)
    values (current_setting('app.sokol')::bigint, current_setting('app.rzeka')::bigint, v_next, 1000);
    raise exception 'FAIL 11c: oplata w innym osrodku przeszla';
  exception when insufficient_privilege then
    raise notice 'PASS 11c: oplata w innym osrodku - 42501';
  end;
end $$;

\echo '=== Wlascicielka innego osrodka: zero wierszy, odmowa zapisu ==='

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.boarding_fees where stable_id = current_setting('app.debem')::bigint;
  if v <> 0 then
    raise exception 'FAIL 12: wlascicielka Nad Rzeką widzi % oplat Pod Dębem', v;
  end if;
  raise notice 'PASS 12: wlascicielka innego osrodka nie widzi oplat';

  begin
    insert into public.boarding_fees (horse_id, stable_id, from_month, amount)
    values (current_setting('app.hrabia')::bigint, current_setting('app.debem')::bigint, current_setting('app.next')::date, 1);
    raise exception 'FAIL 13: zapis oplaty cudzego osrodka przeszedl';
  exception when insufficient_privilege then
    raise notice 'PASS 13: zapis oplaty cudzego osrodka - 42501';
  end;

  update public.boarding_fees set amount = 1 where stable_id = current_setting('app.debem')::bigint;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 14: wlascicielka Nad Rzeką zmienila % oplat Pod Dębem', v;
  end if;
  delete from public.boarding_fees where stable_id = current_setting('app.debem')::bigint;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 14b: wlascicielka Nad Rzeką usunela % oplat Pod Dębem', v;
  end if;
  raise notice 'PASS 14: wlascicielka innego osrodka nie zmienia ani nie usuwa oplat';
end $$;

\echo '=== Pensjonariuszka: czyta oplate swojego konia, nie zapisuje ==='

set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

do $$
declare
  v int;
  v_amount int;
begin
  select count(*), max(amount) into v, v_amount from public.boarding_fees;
  if v <> 1 or v_amount <> 150000 then
    raise exception 'FAIL 15: pensjonariuszka widzi oplat=% kwota=% (oczekiwano tylko oplaty Hrabiego)', v, v_amount;
  end if;
  raise notice 'PASS 15: pensjonariuszka czyta tylko oplate swojego konia';

  begin
    insert into public.boarding_fees (horse_id, stable_id, from_month, amount)
    values (current_setting('app.hrabia')::bigint, current_setting('app.debem')::bigint, current_setting('app.next')::date, 1);
    raise exception 'FAIL 16: pensjonariuszka zapisala oplate';
  exception when insufficient_privilege then
    raise notice 'PASS 16: zapis oplaty przez pensjonariuszke - 42501';
  end;

  update public.boarding_fees set amount = 1;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 17: pensjonariuszka zmienila % oplat', v;
  end if;
  delete from public.boarding_fees;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL 17b: pensjonariuszka usunela % oplat', v;
  end if;
  raise notice 'PASS 17: pensjonariuszka nie zmienia ani nie usuwa oplaty';
end $$;

\echo '=== Inni: pensjonariusz innego osrodka, jezdziec, instruktorka - zero cudzych wierszy ==='

do $$
declare
  r record;
  v int;
begin
  for r in
    select * from (values
      ('44444444-4444-4444-4444-444444444444', 'pensjonariusz Nad Rzeką', 1),
      ('33333333-3333-3333-3333-333333333333', 'jezdziec Pod Dębem', 0),
      ('99999999-9999-9999-9999-999999999999', 'instruktorka Pod Dębem', 0)
    ) as t(sub, label, own)
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.sub, 'role', 'authenticated')::text, true);
    select count(*) into v from public.boarding_fees;
    if v <> r.own then
      raise exception 'FAIL 18 %: widzi % oplat (oczekiwano %)', r.label, v, r.own;
    end if;
    raise notice 'PASS 18 %: widzi tylko oplaty swoich koni (%)', r.label, v;
    begin
      insert into public.boarding_fees (horse_id, stable_id, from_month, amount)
      values (current_setting('app.hrabia')::bigint, current_setting('app.debem')::bigint, current_setting('app.next')::date, 1);
      raise exception 'FAIL 19 %: zapis oplaty przeszedl', r.label;
    exception when insufficient_privilege then
      raise notice 'PASS 19 %: zapis oplaty - 42501', r.label;
    end;
  end loop;
end $$;

\echo '=== anon: brak dostepu ==='

reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

do $$
begin
  perform count(*) from public.boarding_fees;
  raise exception 'FAIL 20: anon czyta oplaty za pensjonat';
exception when insufficient_privilege then
  raise notice 'PASS 20: anon - 42501';
end $$;

\echo '=== Usuniecie konta pensjonariusza i usuniecie konia ==='

reset role;
delete from auth.users where id = '12121212-1212-1212-1212-121212121212';

do $$
declare
  v int;
begin
  select count(*) into v from public.boarding_fees where horse_id = current_setting('app.hrabia')::bigint;
  if v <> 1 then
    raise exception 'FAIL 21: po usunieciu konta pensjonariuszki oplat konia: % (oczekiwano 1)', v;
  end if;
  raise notice 'PASS 21: usuniecie konta pensjonariuszki nie usuwa oplaty konia (kon zostaje bez wlasciciela)';

  delete from public.horses where id = current_setting('app.sokol')::bigint;
  select count(*) into v from public.boarding_fees where horse_id = current_setting('app.sokol')::bigint;
  if v <> 0 then
    raise exception 'FAIL 22: po usunieciu konia zostalo % oplat', v;
  end if;
  raise notice 'PASS 22: usuniecie konia usuwa jego oplaty, takze obowiazujaca (kaskada)';
end $$;

rollback;
