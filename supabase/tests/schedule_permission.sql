-- Dowod uprawnienia do ukladania grafiku: nadanie i odebranie (#78, spec #77, ADR-0004,
-- GLOSSARY "Uprawnienie do układania grafiku", "Instruktor").
--
-- Gwarancje w bazie, nie w aplikacji:
--   * znacznik `instructors.arranges_schedule` zmienia wylacznie wlasciciel osrodka funkcja
--     public.set_schedule_permission (42501 dla instruktora nie-wlasciciela i jezdzca;
--     niezalogowany nie wywola funkcji),
--   * tylko dla instruktora wlasnego osrodka (SB013 - cudzy i nieistniejacy jednym kodem),
--     z kontem (SB023), aktywnego (SB024), innego niz sam wlasciciel (SB025),
--   * bezposredni zapis i odczyt znacznika z aplikacji odrzucony (42501); wlasciciel widzi go
--     w public.list_instructor_accounts(), instruktor swoj w public.my_instructor(),
--   * dezaktywacja zeruje znacznik w tej samej transakcji, ponowna aktywacja go nie przywraca;
--     utrata konta (usuniecie profilu) tez go zeruje, a CHECK nie pozwala go trzymac
--     instruktorowi bez konta albo nieaktywnemu nawet jako postgres (23514).
--
-- Persony z seeda: wlasciciel Stadniny Pod Dębem (1111...), wlascicielka Stajni Nad Rzeką
-- (2222...), Joanna Wrona (9999..., instruktorka z kontem, nie wlascicielka), Anna Kowalska
-- (3333..., jezdziec). Instruktorzy i konta pomocnicze powstaja w transakcji; kazda persona
-- we wlasnej transakcji z ROLLBACK.
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/schedule_permission.sql

\set ON_ERROR_STOP on

\echo '=== Uprawnienie do ukladania grafiku: wlasciciel nadaje i odbiera ==='

begin;

do $$
begin
  if (select id from public.instructors where account_id = '99999999-9999-9999-9999-999999999999') is null then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;
  perform set_config('app.joanna',
    (select id::text from public.instructors where account_id = '99999999-9999-9999-9999-999999999999'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_listed boolean;
  v_others int;
begin
  perform public.set_schedule_permission(v_joanna, true);
  select arranges_schedule into v_listed from public.list_instructor_accounts() where instructor_id = v_joanna;
  if v_listed is distinct from true then
    raise exception 'FAIL: po nadaniu lista wlasciciela pokazuje arranges_schedule = %', v_listed;
  end if;
  select count(*) into v_others from public.list_instructor_accounts() where arranges_schedule and instructor_id <> v_joanna;
  if v_others <> 0 then
    raise exception 'FAIL: nadanie Joannie objelo % innych instruktorow', v_others;
  end if;
  raise notice 'PASS: wlasciciel nadaje uprawnienie aktywnej instruktorce z kontem, lista je pokazuje';

  -- Powtorzenie tego samego stanu nie jest bledem (dwie karty, podwojne klikniecie).
  perform public.set_schedule_permission(v_joanna, true);

  perform public.set_schedule_permission(v_joanna, false);
  select arranges_schedule into v_listed from public.list_instructor_accounts() where instructor_id = v_joanna;
  if v_listed is distinct from false then
    raise exception 'FAIL: po odebraniu lista wlasciciela pokazuje arranges_schedule = %', v_listed;
  end if;
  raise notice 'PASS: wlasciciel odbiera uprawnienie';
end $$;

rollback;

\echo '=== Uprawnienie: instruktor widzi swoje w my_instructor() ==='

begin;

update public.instructors set arranges_schedule = true where account_id = '99999999-9999-9999-9999-999999999999';

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_flag boolean;
begin
  select arranges_schedule into v_flag from public.my_instructor();
  if v_flag is distinct from true then
    raise exception 'FAIL: my_instructor() instruktorki z uprawnieniem zwraca arranges_schedule = %', v_flag;
  end if;
  raise notice 'PASS: instruktor z uprawnieniem widzi je w my_instructor()';
end $$;

rollback;

\echo '=== Uprawnienie: odmowy dla wlasciciela (SB013, SB023, SB024, SB025) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated',
        'authenticated', 'nieaktywny.z.kontem@example.com', '{"role":"instructor","full_name":"Nieaktywny"}', now(), now());

do $$
declare
  v_a bigint := (select id from public.stables where owner_id = '11111111-1111-1111-1111-111111111111');
  v_b bigint := (select id from public.stables where owner_id = '22222222-2222-2222-2222-222222222222');
  v_id bigint;
begin
  insert into public.instructors (stable_id, name) values (v_a, 'Uprawnienie Bez Konta') returning id into v_id;
  perform set_config('app.no_account', v_id::text, true);
  insert into public.instructors (stable_id, name, account_id, active)
  values (v_a, 'Uprawnienie Nieaktywny', '77777777-7777-7777-7777-777777777777', false) returning id into v_id;
  perform set_config('app.inactive', v_id::text, true);
  insert into public.instructors (stable_id, name) values (v_b, 'Uprawnienie Obcy') returning id into v_id;
  perform set_config('app.foreign', v_id::text, true);
  perform set_config('app.owner_instructor',
    (select id::text from public.instructors where account_id = '11111111-1111-1111-1111-111111111111'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_case record;
  v_state text;
begin
  for v_case in
    select * from (values
      ('instruktor innego osrodka', current_setting('app.foreign')::bigint, true, 'SB013'),
      ('nieistniejacy instruktor', -1::bigint, true, 'SB013'),
      ('instruktor bez konta', current_setting('app.no_account')::bigint, true, 'SB023'),
      ('instruktor nieaktywny', current_setting('app.inactive')::bigint, true, 'SB024'),
      ('instruktor nieaktywny (odebranie)', current_setting('app.inactive')::bigint, false, 'SB024'),
      ('sam wlasciciel', current_setting('app.owner_instructor')::bigint, true, 'SB025')
    ) as t(label, instructor_id, granted, code)
  loop
    begin
      perform public.set_schedule_permission(v_case.instructor_id, v_case.granted);
      raise exception 'FAIL: % - uprawnienie zmienione bez odmowy', v_case.label;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      if v_state <> v_case.code then
        raise exception 'FAIL: % - odmowa % zamiast %: %', v_case.label, v_state, v_case.code, sqlerrm;
      end if;
      raise notice 'PASS: % - odmowa %', v_case.label, v_case.code;
    end;
  end loop;
end $$;

rollback;

\echo '=== Uprawnienie: odmowy dla nie-wlasciciela (42501) ==='

begin;

do $$
begin
  perform set_config('app.joanna',
    (select id::text from public.instructors where account_id = '99999999-9999-9999-9999-999999999999'), true);
end $$;

set local role authenticated;

do $$
declare
  v_caller record;
  v_state text;
begin
  for v_caller in
    select * from (values
      ('instruktorka nie-wlascicielka (o sobie)', '99999999-9999-9999-9999-999999999999'),
      ('jezdziec', '33333333-3333-3333-3333-333333333333')
    ) as t(label, sub)
  loop
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_caller.sub, 'role', 'authenticated')::text, true);
    begin
      perform public.set_schedule_permission(current_setting('app.joanna')::bigint, true);
      raise exception 'FAIL: % - nadal uprawnienie', v_caller.label;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      if v_state <> '42501' then
        raise exception 'FAIL: % - odmowa % zamiast 42501: %', v_caller.label, v_state, sqlerrm;
      end if;
      raise notice 'PASS: % - odmowa 42501', v_caller.label;
    end;
  end loop;

  -- Wlascicielka innego osrodka jest wlascicielem, ale nie osrodka Joanny.
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
  begin
    perform public.set_schedule_permission(current_setting('app.joanna')::bigint, true);
    raise exception 'FAIL: wlascicielka innego osrodka nadala uprawnienie';
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state <> 'SB013' then
      raise exception 'FAIL: wlascicielka innego osrodka - odmowa % zamiast SB013: %', v_state, sqlerrm;
    end if;
    raise notice 'PASS: wlascicielka innego osrodka - odmowa SB013';
  end;
end $$;

rollback;

begin;

set local role anon;

do $$
begin
  perform public.set_schedule_permission(1, true);
  raise exception 'FAIL: niezalogowany wywolal set_schedule_permission';
exception when insufficient_privilege then
  raise notice 'PASS: niezalogowany nie wywola set_schedule_permission (42501)';
end $$;

rollback;

\echo '=== Uprawnienie: bez bezposredniego zapisu i odczytu znacznika ==='

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
begin
  begin
    update public.instructors set arranges_schedule = true
     where stable_id = (select id from public.stables where owner_id = '11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL: wlasciciel zapisal znacznik bezposrednio';
  exception when insufficient_privilege then
    raise notice 'PASS: bezposredni zapis znacznika odrzucony (42501)';
  end;

  begin
    perform arranges_schedule from public.instructors limit 1;
    raise exception 'FAIL: znacznik czytelny wprost z tabeli';
  exception when insufficient_privilege then
    raise notice 'PASS: bezposredni odczyt znacznika odrzucony (42501)';
  end;
end $$;

rollback;

\echo '=== Uprawnienie: dezaktywacja zeruje, aktywacja nie przywraca ==='

begin;

do $$
begin
  perform set_config('app.joanna',
    (select id::text from public.instructors where account_id = '99999999-9999-9999-9999-999999999999'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_flag boolean;
begin
  perform public.set_schedule_permission(v_joanna, true);

  update public.instructors set active = false where id = v_joanna;
  select arranges_schedule into v_flag from public.list_instructor_accounts() where instructor_id = v_joanna;
  if v_flag is distinct from false then
    raise exception 'FAIL: po dezaktywacji arranges_schedule = %', v_flag;
  end if;
  raise notice 'PASS: dezaktywacja zeruje uprawnienie w tej samej transakcji';

  update public.instructors set active = true where id = v_joanna;
  select arranges_schedule into v_flag from public.list_instructor_accounts() where instructor_id = v_joanna;
  if v_flag is distinct from false then
    raise exception 'FAIL: ponowna aktywacja przywrocila uprawnienie (arranges_schedule = %)', v_flag;
  end if;
  raise notice 'PASS: ponowna aktywacja nie przywraca uprawnienia';
end $$;

rollback;

\echo '=== Uprawnienie: utrata konta zeruje, CHECK pilnuje niezmiennika ==='

begin;

update public.instructors set arranges_schedule = true where account_id = '99999999-9999-9999-9999-999999999999';
do $$
begin
  perform set_config('app.joanna',
    (select id::text from public.instructors where account_id = '99999999-9999-9999-9999-999999999999'), true);
end $$;

delete from auth.users where id = '99999999-9999-9999-9999-999999999999';

do $$
declare
  v_joanna bigint := current_setting('app.joanna')::bigint;
  v_flag boolean;
  v_karol bigint := (select id from public.instructors where name = 'Karol Jasny');
begin
  select arranges_schedule into v_flag from public.instructors where id = v_joanna;
  if v_flag is distinct from false then
    raise exception 'FAIL: po usunieciu konta instruktor trzyma uprawnienie (arranges_schedule = %)', v_flag;
  end if;
  raise notice 'PASS: utrata konta zeruje uprawnienie';

  begin
    update public.instructors set arranges_schedule = true where id = v_karol;
    raise exception 'FAIL: instruktor bez konta dostal uprawnienie jako postgres';
  exception when check_violation then
    raise notice 'PASS: CHECK odrzuca uprawnienie instruktora bez konta nawet jako postgres (23514)';
  end;
end $$;

rollback;
