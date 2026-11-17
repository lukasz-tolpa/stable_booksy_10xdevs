-- Dowod konta wlasciciela osrodka (#71, ADR-0004, GLOSSARY "Wlasciciel").
--
-- Gwarancje w bazie, nie w aplikacji:
--   * konto wlasciciela ma role `instructor` i jest powiazane z instruktorem swojego osrodka,
--   * kontekst osrodka wynika z powiazania konta z AKTYWNYM instruktorem - samo
--     `stables.owner_id` bez powiazania nie daje dostepu do niczego,
--   * powiazania instruktora z kontem nie da sie ustawic ani zmienic z aplikacji (42501),
--   * zakladanie osrodka (`public.create_stable`) tworzy w jednej transakcji osrodek i
--     instruktora wlasciciela; zaklada go wylacznie konto `instructor` bez instruktora,
--   * wlasciciela nie da sie dezaktywowac (SB012) - takze jako postgres,
--   * wlasciciel moze nie prowadzic jazd: limit zero we wszystkich godzinach dnia.
--
-- Jako kto: mutacje ida jako rola authenticated z `sub` z seeda albo z konta tymczasowego,
-- przygotowanie danych jako postgres. Kazda persona we wlasnej transakcji z ROLLBACK.
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/stable_owner_account.sql

\set ON_ERROR_STOP on

\echo '=== Wlasciciel: seed - konta wlascicieli to instruktorzy swoich osrodkow ==='

begin;

do $$
declare
  v int;
  v_role text;
  v_name text;
begin
  select p.role, i.name into v_role, v_name
  from public.profiles p
  join public.stables s on s.owner_id = p.id
  join public.instructors i on i.account_id = p.id and i.stable_id = s.id
  where p.id = '11111111-1111-1111-1111-111111111111' and s.name = 'Stadnina Pod Dębem';
  if v_role is distinct from 'instructor' or v_name is distinct from 'Marek Dębowski' then
    raise exception 'FAIL: wlasciciel Pod Dębem ma role % i instruktora %', v_role, v_name;
  end if;

  select count(*) into v
  from public.profiles p
  join public.stables s on s.owner_id = p.id
  join public.instructors i on i.account_id = p.id and i.stable_id = s.id and i.active
  where p.id = '22222222-2222-2222-2222-222222222222' and p.role = 'instructor' and i.name = 'Ewa Rzecka';
  if v <> 1 then
    raise exception 'FAIL: wlascicielka Nad Rzeką nie jest instruktorem swojego osrodka';
  end if;
  raise notice 'PASS: wlasciciele osrodkow demo to konta instructor powiazane z instruktorem';
end $$;

rollback;

\echo '=== Wlasciciel: nie da sie go dezaktywowac ==='

begin;

do $$
begin
  perform set_config('app.marek', (select i.id::text from public.instructors i where i.account_id = '11111111-1111-1111-1111-111111111111'), true);
  perform set_config('app.joanna', (select i.id::text from public.instructors i join public.stables s on s.id = i.stable_id where s.owner_id = '11111111-1111-1111-1111-111111111111' and i.name = 'Joanna Wrona'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
  v_active boolean;
  v_marek bigint := current_setting('app.marek')::bigint;
  v_joanna bigint := current_setting('app.joanna')::bigint;
begin
  begin
    update public.instructors set active = false where id = v_marek;
    raise exception 'FAIL: wlasciciel zdezaktywowal samego siebie';
  exception when sqlstate 'SB012' then
    select active into v_active from public.instructors where id = v_marek;
    if v_active is distinct from true then
      raise exception 'FAIL: po odmowie wlasciciel ma active=%', v_active;
    end if;
    raise notice 'PASS: dezaktywacja instruktora wlasciciela odrzucona (SB012), nadal aktywny';
  end;

  -- Ten sam przelacznik dziala dla instruktora, ktory nie jest wlascicielem (odmowa wyzej nie jest
  -- blanketowa). Skutki dezaktywacji konta instruktora: instructor_account_access.sql (#73).
  update public.instructors set active = false where id = v_joanna;
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL: wlasciciel nie zdezaktywowal instruktora, ktory nie jest wlascicielem (% wierszy)', v;
  end if;
  raise notice 'PASS: wlasciciel dezaktywuje instruktora, ktory nie jest wlascicielem';
end $$;

reset role;

do $$
begin
  update public.instructors set active = false where account_id = '22222222-2222-2222-2222-222222222222';
  raise exception 'FAIL: postgres zdezaktywowal wlascicielke Nad Rzeką';
exception when sqlstate 'SB012' then
  raise notice 'PASS: dezaktywacja wlasciciela odrzucona takze poza sesja aplikacji (SB012)';
end $$;

rollback;

\echo '=== Wlasciciel: powiazania z kontem nie ustawia aplikacja ==='

begin;

do $$
begin
  perform set_config('app.stable_a', (select id::text from public.stables where owner_id = '11111111-1111-1111-1111-111111111111'), true);
  -- Karol Jasny - instruktor bez konta (Joanna Wrona ma konto od #72).
  perform set_config('app.karol', (select i.id::text from public.instructors i join public.stables s on s.id = i.stable_id where s.owner_id = '11111111-1111-1111-1111-111111111111' and i.name = 'Karol Jasny'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_account uuid;
  v_stable_a bigint := current_setting('app.stable_a')::bigint;
  v_karol bigint := current_setting('app.karol')::bigint;
begin
  begin
    insert into public.instructors (stable_id, name, account_id)
    values (v_stable_a, 'Podstawiony', '33333333-3333-3333-3333-333333333333');
    raise exception 'FAIL: wlasciciel dodal instruktora z kontem jezdzca';
  exception when insufficient_privilege then
    raise notice 'PASS: dodanie instruktora z powiazanym kontem odrzucone (42501)';
  end;

  begin
    update public.instructors set account_id = '33333333-3333-3333-3333-333333333333' where id = v_karol;
    raise exception 'FAIL: wlasciciel powiazal instruktora z kontem';
  exception when insufficient_privilege then
    select account_id into v_account from public.instructors where id = v_karol;
    if v_account is not null then
      raise exception 'FAIL: po odmowie Karol ma konto %', v_account;
    end if;
    raise notice 'PASS: zmiana powiazania instruktora z kontem odrzucona (42501), bez zmian';
  end;
end $$;

rollback;

\echo '=== Wlasciciel: kontekst osrodka wynika z powiazania z instruktorem ==='

begin;

-- Konto nadal zapisane jako wlasciciel w stables.owner_id, ale bez instruktora - jak gdyby
-- powiazanie zniknelo. Kontekst osrodka ma byc pusty.
do $$
begin
  perform set_config('app.stable_a', (select id::text from public.stables where owner_id = '11111111-1111-1111-1111-111111111111'), true);
  update public.instructors set account_id = null where account_id = '11111111-1111-1111-1111-111111111111';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
  v_stable_a bigint := current_setting('app.stable_a')::bigint;
begin
  select count(*) into v from public.bookings;
  if v <> 0 then
    raise exception 'FAIL: konto bez instruktora widzi % zapisow osrodka', v;
  end if;

  begin
    insert into public.horses (stable_id, name) values (v_stable_a, 'Bez kontekstu');
    raise exception 'FAIL: konto bez instruktora dodalo konia';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform public.save_schedule_day(current_date + 3, 10, 12, array[]::bigint[], array[]::bigint[], '[]'::jsonb);
    raise exception 'FAIL: konto bez instruktora zapisalo grafik';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PASS: samo stables.owner_id bez instruktora nie daje dostepu do osrodka';
end $$;

rollback;

\echo '=== Wlasciciel: moze nie prowadzic jazd (limit zero we wszystkich godzinach) ==='

begin;

do $$
begin
  perform set_config('app.marek', (select i.id::text from public.instructors i where i.account_id = '11111111-1111-1111-1111-111111111111'), true);
  perform set_config('app.bella', (select h.id::text from public.horses h join public.stables s on s.id = h.stable_id where s.owner_id = '11111111-1111-1111-1111-111111111111' and h.name = 'Bella'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_day bigint;
  v_slots int;
  v_seats int;
  v_marek bigint := current_setting('app.marek')::bigint;
  v_bella bigint := current_setting('app.bella')::bigint;
begin
  v_day := public.save_schedule_day(current_date + 4, 10, 13, array[v_bella], array[v_marek], '[]'::jsonb);
  select count(*), coalesce(sum(seats), -1) into v_slots, v_seats
  from public.schedule_slots where schedule_day_id = v_day and instructor_id = v_marek;
  if v_slots <> 3 or v_seats <> 0 then
    raise exception 'FAIL: wlasciciel w dniu ma % slotow z suma limitow %', v_slots, v_seats;
  end if;
  raise notice 'PASS: wlasciciel w dniu z limitem zero w kazdej godzinie';
end $$;

rollback;

\echo '=== Zakladanie osrodka: konto instructor bez osrodka ==='

begin;

-- Konta tymczasowe jak po rejestracji (trigger handle_new_user).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated',
   'authenticated', 'nowy.wlasciciel@example.com', '{"role":"instructor","full_name":"Nowy Właściciel"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated',
   'authenticated', 'stary.osrodek@example.com', '{"role":"stable","full_name":"Stara Rola"}', now(), now());

do $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = '55555555-5555-5555-5555-555555555555';
  if v_role is distinct from 'instructor' then
    raise exception 'FAIL: rejestracja z rola instructor dala role %', v_role;
  end if;
  select role into v_role from public.profiles where id = '66666666-6666-6666-6666-666666666666';
  if v_role is distinct from 'rider' then
    raise exception 'FAIL: dawna rola stable z metadanych dala role %', v_role;
  end if;
  raise notice 'PASS: rejestracja zaklada konto instructor; nieznana rola (takze dawne stable) daje jezdzca';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

do $$
declare
  v int;
  v_stable bigint;
  v_owner uuid;
  v_name text;
  v_active boolean;
begin
  -- Bezposredni INSERT do stables jest zamkniety - osrodek bez instruktora wlasciciela nie powstanie.
  begin
    insert into public.stables (owner_id, name, city)
    values ('55555555-5555-5555-5555-555555555555', 'Obejscie', 'Tarnów');
    raise exception 'FAIL: konto zalozylo osrodek bezposrednim INSERT-em';
  exception when insufficient_privilege then
    raise notice 'PASS: bezposredni INSERT do stables odrzucony (42501)';
  end;

  -- Atomowosc: pusta nazwa instruktora odrzucona, osrodek nie zostaje.
  begin
    perform public.create_stable('Stajnia Pod Lasem', 'Tarnów', '   ');
    raise exception 'FAIL: osrodek z pusta nazwa instruktora przeszedl';
  exception when check_violation then
    select count(*) into v from public.stables where owner_id = '55555555-5555-5555-5555-555555555555';
    if v <> 0 then
      raise exception 'FAIL: po odmowie zostal osrodek bez instruktora wlasciciela';
    end if;
    raise notice 'PASS: pusta nazwa instruktora odrzucona (23514), osrodek nie powstal';
  end;

  v_stable := public.create_stable('Stajnia Pod Lasem', 'Tarnów', 'Nowy Właściciel');

  select s.owner_id, i.name, i.active into v_owner, v_name, v_active
  from public.stables s
  join public.instructors i on i.stable_id = s.id and i.account_id = '55555555-5555-5555-5555-555555555555'
  where s.id = v_stable;
  if v_owner is distinct from '55555555-5555-5555-5555-555555555555'::uuid
     or v_name is distinct from 'Nowy Właściciel' or v_active is distinct from true then
    raise exception 'FAIL: osrodek % ma wlasciciela %, instruktora % (active=%)', v_stable, v_owner, v_name, v_active;
  end if;
  raise notice 'PASS: create_stable zaklada osrodek i aktywnego instruktora wlasciciela powiazanego z kontem';

  -- Wlasciciel od razu ma kontekst swojego osrodka.
  insert into public.horses (stable_id, name) values (v_stable, 'Pierwszy');
  get diagnostics v = row_count;
  if v <> 1 then
    raise exception 'FAIL: nowy wlasciciel nie dodal konia do swojego osrodka';
  end if;
  raise notice 'PASS: nowy wlasciciel zarzadza swoim osrodkiem';

  begin
    perform public.create_stable('Druga Stajnia', 'Tarnów', 'Nowy Właściciel');
    raise exception 'FAIL: konto zalozylo drugi osrodek';
  exception when unique_violation then
    select count(*) into v from public.stables where owner_id = '55555555-5555-5555-5555-555555555555';
    if v <> 1 then
      raise exception 'FAIL: konto ma % osrodkow', v;
    end if;
    raise notice 'PASS: drugi osrodek tego samego konta odrzucony (23505)';
  end;
end $$;

rollback;

\echo '=== Zakladanie osrodka: jezdziec i niezalogowany ==='

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  v int;
begin
  begin
    perform public.create_stable('Stajnia Anny', 'Kraków', 'Anna Kowalska');
    raise exception 'FAIL: jezdziec zalozyl osrodek';
  exception when insufficient_privilege then
    select count(*) into v from public.stables where owner_id = '33333333-3333-3333-3333-333333333333';
    if v <> 0 then
      raise exception 'FAIL: po odmowie jezdziec ma osrodek';
    end if;
    raise notice 'PASS: jezdziec nie zalozy osrodka (42501)';
  end;
end $$;

rollback;

begin;
set local role anon;

do $$
begin
  begin
    perform public.create_stable('Stajnia Anonima', 'Kraków', 'Anonim');
    raise exception 'FAIL: niezalogowany wywolal create_stable';
  exception when insufficient_privilege then
    raise notice 'PASS: niezalogowany nie wywola create_stable';
  end;
end $$;

rollback;

\echo '--- WSZYSTKIE ASERCJE KONTA WLASCICIELA PRZESZLY ---'
