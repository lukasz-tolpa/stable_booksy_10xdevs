-- Dowod regul instruktorow (#39, ADR-0002, GLOSSARY "Instruktor").
--
-- Gwarancje w bazie, nie w aplikacji:
--   * nazwa instruktora jest unikalna w osrodku bez wzgledu na wielkosc liter i spacje
--     na brzegach, takze wsrod instruktorow nieaktywnych (23505,
--     instructors_stable_name_key); ten sam napis w innym osrodku przechodzi,
--   * nazwy nie da sie zmienic (UPDATE kolumny `name` odebrany - 42501); zmienia sie
--     tylko `active`, a dezaktywacja nigdy nie jest odmawiana,
--   * instruktora sie nie usuwa (brak polityki DELETE - 0 wierszy),
--   * instruktorami zarzadza wylacznie osrodek, do ktorego naleza; czytac moga zalogowani
--     (jezdziec widzi nazwe przy slocie), niezalogowani nie widza nic.
--
-- Jako kto: mutacje ida przez RLS jako wlasciciel (rola authenticated z `sub` z seeda),
-- przygotowanie danych jako postgres. Kazda persona we wlasnej transakcji z ROLLBACK -
-- skrypt nie zostawia zmian.
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/instructors_name_and_access.sql

\set ON_ERROR_STOP on

\echo '=== Instruktorzy: osrodek "Stadnina Pod Dębem" ==='

begin;

do $$
declare
  v_stable_b bigint;
  v_marek bigint;
begin
  perform set_config('app.stable_a', (select id::text from public.stables where owner_id = '11111111-1111-1111-1111-111111111111'), true);
  select id into v_stable_b from public.stables where owner_id = '22222222-2222-2222-2222-222222222222';
  if current_setting('app.stable_a') = '' or v_stable_b is null then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  insert into public.instructors (stable_id, name) values (v_stable_b, 'Marek Zielinski')
  returning id into v_marek;

  perform set_config('app.stable_b', v_stable_b::text, true);
  perform set_config('app.marek', v_marek::text, true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
  v_constraint text;
  v_ania bigint;
  v_active boolean;
  v_name text;
  v_stable_a bigint := current_setting('app.stable_a')::bigint;
  v_stable_b bigint := current_setting('app.stable_b')::bigint;
  v_marek bigint := current_setting('app.marek')::bigint;
begin
  -- 1. Dodanie instruktora we wlasnym osrodku przechodzi (inaczej odmowy nizej nic nie znacza).
  insert into public.instructors (stable_id, name) values (v_stable_a, 'Ania Nowicka')
  returning id into v_ania;
  select active into v_active from public.instructors where id = v_ania;
  if v_active is distinct from true then
    raise exception 'FAIL: nowy instruktor nie jest aktywny (active=%)', v_active;
  end if;
  raise notice 'PASS: osrodek dodaje instruktora, nowy instruktor jest aktywny';

  -- 2. Duplikat rozniacy sie wielkoscia liter i spacjami na brzegach.
  begin
    insert into public.instructors (stable_id, name) values (v_stable_a, '  ania NOWICKA ');
    raise exception 'FAIL: duplikat nazwy (wielkosc liter, spacje) przeszedl';
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'instructors_stable_name_key' then
      raise exception 'FAIL: duplikat odrzucony przez % zamiast instructors_stable_name_key', v_constraint;
    end if;
    raise notice 'PASS: duplikat nazwy bez wzgledu na wielkosc liter i spacje odrzucony (23505)';
  end;

  -- 3. Dezaktywacja przechodzi i dotyka dokladnie jednego wiersza.
  update public.instructors set active = false where id = v_ania;
  get diagnostics v = row_count;
  select active into v_active from public.instructors where id = v_ania;
  if v <> 1 or v_active is distinct from false then
    raise exception 'FAIL: dezaktywacja dotknela % wierszy, active=%', v, v_active;
  end if;
  raise notice 'PASS: osrodek dezaktywuje wlasnego instruktora';

  -- 4. Nazwa nieaktywnego instruktora nadal jest zajeta.
  begin
    insert into public.instructors (stable_id, name) values (v_stable_a, 'ANIA NOWICKA');
    raise exception 'FAIL: duplikat nazwy nieaktywnego instruktora przeszedl';
  exception when unique_violation then
    raise notice 'PASS: nazwa nieaktywnego instruktora nadal zajeta (23505)';
  end;

  -- 5. Ponowna aktywacja.
  update public.instructors set active = true where id = v_ania;
  get diagnostics v = row_count;
  select active into v_active from public.instructors where id = v_ania;
  if v <> 1 or v_active is distinct from true then
    raise exception 'FAIL: ponowna aktywacja dotknela % wierszy, active=%', v, v_active;
  end if;
  raise notice 'PASS: osrodek ponownie aktywuje instruktora';

  -- 6. Zmiany nazwy nie ma - takze we wlasnym osrodku.
  begin
    update public.instructors set name = 'Anna Nowicka' where id = v_ania;
    raise exception 'FAIL: osrodek zmienil nazwe instruktora';
  exception when insufficient_privilege then
    select name into v_name from public.instructors where id = v_ania;
    if v_name <> 'Ania Nowicka' then
      raise exception 'FAIL: po odmowie nazwa to %', v_name;
    end if;
    raise notice 'PASS: zmiana nazwy odrzucona (42501), nazwa nietknieta';
  end;

  -- 7. Pusta nazwa.
  begin
    insert into public.instructors (stable_id, name) values (v_stable_a, '   ');
    raise exception 'FAIL: instruktor z pusta nazwa przeszedl';
  exception when check_violation then
    raise notice 'PASS: pusta nazwa odrzucona (23514)';
  end;

  -- 8. Instruktora sie nie usuwa.
  delete from public.instructors where id = v_ania;
  get diagnostics v = row_count;
  if v <> 0 then
    raise exception 'FAIL: osrodek usunal % instruktorow', v;
  end if;
  raise notice 'PASS: usuniecie instruktora dotknelo 0 wierszy';

  -- 9. Izolacja: cudzy osrodek.
  begin
    insert into public.instructors (stable_id, name) values (v_stable_b, 'Intruz');
    raise exception 'FAIL: osrodek A dodal instruktora do cudzego osrodka';
  exception when insufficient_privilege then
    raise notice 'PASS: dodanie instruktora do cudzego osrodka odrzucone przez RLS';
  end;

  update public.instructors set active = false where id = v_marek;
  get diagnostics v = row_count;
  select active into v_active from public.instructors where id = v_marek;
  if v <> 0 or v_active is distinct from true then
    raise exception 'FAIL: osrodek A zmienil % cudzych instruktorow, active=%', v, v_active;
  end if;
  raise notice 'PASS: dezaktywacja cudzego instruktora dotknela 0 wierszy';
end $$;

rollback;

\echo '=== Instruktorzy: osrodek "Stajnia Nad Rzeką" ==='

begin;

do $$
begin
  perform set_config('app.stable_a', (select id::text from public.stables where owner_id = '11111111-1111-1111-1111-111111111111'), true);
  perform set_config('app.stable_b', (select id::text from public.stables where owner_id = '22222222-2222-2222-2222-222222222222'), true);
  insert into public.instructors (stable_id, name)
  values (current_setting('app.stable_a')::bigint, 'Ania Nowicka');
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v int;
  v_stable_b bigint := current_setting('app.stable_b')::bigint;
begin
  -- Unikalnosc obowiazuje w osrodku, nie globalnie.
  insert into public.instructors (stable_id, name) values (v_stable_b, 'Ania Nowicka');
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL: osrodek B nie dodal instruktora o nazwie zajetej w innym osrodku';
  end if;
  raise notice 'PASS: ta sama nazwa w innym osrodku przechodzi';
end $$;

rollback;

\echo '=== Instruktorzy: jezdziec Anna Kowalska ==='

begin;

do $$
declare
  v_ania bigint;
begin
  perform set_config('app.stable_a', (select id::text from public.stables where owner_id = '11111111-1111-1111-1111-111111111111'), true);
  insert into public.instructors (stable_id, name)
  values (current_setting('app.stable_a')::bigint, 'Ania Nowicka')
  returning id into v_ania;
  perform set_config('app.ania', v_ania::text, true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v int;
  v_active boolean;
  v_stable_a bigint := current_setting('app.stable_a')::bigint;
  v_ania bigint := current_setting('app.ania')::bigint;
begin
  select count(*) into v from public.instructors where id = v_ania and name = 'Ania Nowicka';
  if v <> 1 then
    raise exception 'FAIL: jezdziec nie widzi instruktora osrodka';
  end if;
  raise notice 'PASS: jezdziec czyta instruktorow osrodka';

  begin
    insert into public.instructors (stable_id, name) values (v_stable_a, 'Podszywka');
    raise exception 'FAIL: jezdziec dodal instruktora';
  exception when insufficient_privilege then
    raise notice 'PASS: dodanie instruktora przez jezdzca odrzucone przez RLS';
  end;

  update public.instructors set active = false where id = v_ania;
  get diagnostics v = row_count;
  select active into v_active from public.instructors where id = v_ania;
  if v <> 0 or v_active is distinct from true then
    raise exception 'FAIL: jezdziec zmienil % instruktorow, active=%', v, v_active;
  end if;
  raise notice 'PASS: dezaktywacja instruktora przez jezdzca dotknela 0 wierszy';
end $$;

rollback;

\echo '=== Instruktorzy: niezalogowany ==='

begin;

do $$
begin
  insert into public.instructors (stable_id, name)
  select id, 'Ania Nowicka' from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
end $$;

set local role anon;

do $$
declare
  v int;
begin
  select count(*) into v from public.instructors;
  if v <> 0 then
    raise exception 'FAIL: niezalogowany widzi % instruktorow', v;
  end if;
  raise notice 'PASS: niezalogowany nie widzi instruktorow';
end $$;

rollback;
