-- Dowod przyjecia zaproszenia instruktora przy zakladaniu konta (#75, spec #70, ADR-0004,
-- GLOSSARY "Instruktor").
--
-- Gwarancje w bazie, nie w aplikacji:
--   * odczyt zaproszenia po tokenie (public.invitation_by_token) jest dostepny anonimowo
--     i zwraca wylacznie nazwe osrodka, adres i stan; nieznany token - zero wierszy,
--   * konto zalozone z tokenem (metadane `invitation_token`, trigger handle_new_user) w tej
--     samej transakcji dostaje role `instructor` (niezaleznie od roli w metadanych), zostaje
--     powiazane z instruktorem zaproszenia, a zaproszenie jest oznaczone jako przyjete;
--     adres konta porownywany bez wielkosci liter i spacji na brzegach,
--   * odmowa ze strukturalnym powodem i bez konta: SB016 nieznany token, SB017 wygaslo,
--     SB018 wycofane, SB019 wykorzystane, SB020 inny adres, SB021 instruktor nieaktywny,
--     SB022 instruktor ma juz konto,
--   * rejestracja bez tokenu dziala jak dotad.
--
-- Instruktorzy, zaproszenia i konta tymczasowe (aaaa..., bbbb..., cccc...) powstaja w transakcji
-- z ROLLBACK - skrypt nie zalezy od tego, kto w seedzie ma konto.
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/instructor_invitation_acceptance.sql

\set ON_ERROR_STOP on

\echo '=== Przyjecie zaproszenia: odczyt po tokenie, przyjecie, odmowy ==='

begin;

-- Rejestracja tak, jak robi ja GoTrue: wiersz auth.users z metadanymi formularza.
create function pg_temp.sign_up(p_id uuid, p_email text, p_token text)
returns void
language sql
as $$
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          jsonb_build_object('role', 'rider', 'full_name', 'Zaproszony Instruktor', 'invitation_token', p_token),
          now(), now());
$$;

-- Konto, ktore "juz ma" instruktor zaproszenia (powiazane jako postgres po wystawieniu).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated',
        'authenticated', 'juz.ma.konto@example.com', '{"role":"instructor","full_name":"Juz Ma Konto"}', now(), now());

do $$
declare
  v_a bigint := (select id from public.stables where owner_id = '11111111-1111-1111-1111-111111111111');
  v_name text;
  v_id bigint;
begin
  if v_a is null then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;
  foreach v_name in array array['live', 'expired', 'revoked', 'used', 'other', 'inactive', 'taken'] loop
    insert into public.instructors (stable_id, name) values (v_a, 'Przyjecie ' || v_name) returning id into v_id;
    perform set_config('app.i_' || v_name, v_id::text, true);
  end loop;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_name text;
begin
  foreach v_name in array array['live', 'expired', 'revoked', 'used', 'other', 'inactive', 'taken'] loop
    perform set_config('app.t_' || v_name,
      (select token from public.issue_instructor_invitation(current_setting('app.i_' || v_name)::bigint,
                                                            v_name || '.instruktor@example.com')),
      true);
  end loop;
  perform public.revoke_instructor_invitation(current_setting('app.i_revoked')::bigint);
end $$;

reset role;

-- Wygaslo dzien temu; instruktor dezaktywowany po zaproszeniu; instruktor powiazany z kontem
-- po zaproszeniu (aplikacja tego nie umie, ale baza i tak odmawia).
update public.instructor_invitations
set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where instructor_id = current_setting('app.i_expired')::bigint;
update public.instructors set active = false where id = current_setting('app.i_inactive')::bigint;
update public.instructors set account_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
where id = current_setting('app.i_taken')::bigint;

-- Odczyt po tokenie: anonim widzi tylko nazwe osrodka, adres i stan.
set local role anon;

do $$
declare
  v_row jsonb;
  v_name text;
  v_expected text;
  v_state text;
  v int;
begin
  select to_jsonb(r) into v_row from public.invitation_by_token(current_setting('app.t_live')) r;
  if v_row is distinct from jsonb_build_object('stable_name', 'Stadnina Pod Dębem',
                                               'email', 'live.instruktor@example.com',
                                               'state', 'live') then
    raise exception 'FAIL: odczyt zywego zaproszenia zwrocil %', v_row;
  end if;
  raise notice 'PASS: anonim czyta po tokenie wylacznie nazwe osrodka, adres i stan';

  foreach v_name in array array['expired', 'revoked', 'inactive', 'taken'] loop
    v_expected := case v_name when 'taken' then 'has_account' else v_name end;
    select r.state into v_state from public.invitation_by_token(current_setting('app.t_' || v_name)) r;
    if v_state is distinct from v_expected then
      raise exception 'FAIL: stan zaproszenia "%" to %', v_name, v_state;
    end if;
  end loop;
  raise notice 'PASS: odczyt po tokenie podaje stan wygaslego, wycofanego, nieaktywnego i z kontem';

  select count(*) into v from public.invitation_by_token(repeat('0', 64));
  if v <> 0 then
    raise exception 'FAIL: nieznany token zwrocil % wierszy', v;
  end if;
  select count(*) into v from public.invitation_by_token(null);
  if v <> 0 then
    raise exception 'FAIL: pusty token zwrocil % wierszy', v;
  end if;
  raise notice 'PASS: nieznany token - zero wierszy';

  begin
    perform 1 from public.instructor_invitations;
    raise exception 'FAIL: anonim czyta tabele zaproszen';
  exception when insufficient_privilege then
    raise notice 'PASS: anonim nie czyta tabeli zaproszen (42501)';
  end;
end $$;

reset role;

-- Przyjecie: adres konta rozni sie wielkoscia liter i spacjami na brzegach.
do $$ begin
  perform pg_temp.sign_up('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '  Live.Instruktor@Example.COM ',
                          current_setting('app.t_live'));
end $$;

do $$
declare
  v_role text;
  v_linked uuid;
  v_accepted timestamptz;
  v_state text;
begin
  select role into v_role from public.profiles where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if v_role is distinct from 'instructor' then
    raise exception 'FAIL: konto z zaproszenia ma role %', v_role;
  end if;
  select account_id into v_linked from public.instructors where id = current_setting('app.i_live')::bigint;
  if v_linked is distinct from 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' then
    raise exception 'FAIL: instruktor zaproszenia powiazany z %', v_linked;
  end if;
  select accepted_at into v_accepted from public.instructor_invitations
  where token_hash = sha256(convert_to(current_setting('app.t_live'), 'UTF8'));
  if v_accepted is null then
    raise exception 'FAIL: zaproszenie nie jest oznaczone jako przyjete';
  end if;
  select r.state into v_state from public.invitation_by_token(current_setting('app.t_live')) r;
  if v_state is distinct from 'accepted' then
    raise exception 'FAIL: przyjete zaproszenie ma stan %', v_state;
  end if;
  raise notice 'PASS: przyjecie dla zgodnego adresu - rola instructor, konto powiazane, zaproszenie przyjete';
end $$;

-- Nowe konto widzi swojego instruktora (kontekst osrodka z powiazania).
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
begin
  if (select private.current_instructor_id()) is distinct from current_setting('app.i_live')::bigint then
    raise exception 'FAIL: konto z zaproszenia ma kontekst instruktora %', (select private.current_instructor_id());
  end if;
  raise notice 'PASS: konto z zaproszenia dziala jako instruktor zaproszenia';
end $$;

reset role;

-- "Wykorzystane": zaproszenie "used" przyjelo juz konto dddd...; drugie konto z tym linkiem
-- (inny adres - ten jest juz zajety) dostaje odmowe za wykorzystanie, nie za adres.
do $$ begin
  perform pg_temp.sign_up('dddddddd-dddd-dddd-dddd-dddddddddddd', 'used.instruktor@example.com',
                          current_setting('app.t_used'));
end $$;

-- Odmowy: rejestracja nie przechodzi, konto nie powstaje, instruktor i zaproszenie bez zmian.
do $$
declare
  v_case text[];
  v_cases text[][] := array[
    array['nieznany token', repeat('0', 64), 'live.instruktor@example.com', 'SB016', ''],
    array['pusty token', '', 'live.instruktor@example.com', 'SB016', ''],
    array['wygaslo', current_setting('app.t_expired'), 'expired.instruktor@example.com', 'SB017', 'expired'],
    array['wycofane', current_setting('app.t_revoked'), 'revoked.instruktor@example.com', 'SB018', 'revoked'],
    array['wykorzystane', current_setting('app.t_used'), 'used.drugi@example.com', 'SB019', ''],
    array['inny adres', current_setting('app.t_other'), 'ktos.inny@example.com', 'SB020', 'other'],
    array['instruktor nieaktywny', current_setting('app.t_inactive'), 'inactive.instruktor@example.com', 'SB021', 'inactive'],
    array['instruktor z kontem', current_setting('app.t_taken'), 'taken.instruktor@example.com', 'SB022', '']
  ];
  v_state text;
  v_users int;
  v_linked uuid;
  v_accepted timestamptz;
begin
  foreach v_case slice 1 in array v_cases loop
    begin
      perform pg_temp.sign_up('cccccccc-cccc-cccc-cccc-cccccccccccc', v_case[3], v_case[2]);
      raise exception 'FAIL: rejestracja z zaproszeniem (%) przeszla', v_case[1];
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
      if v_state <> v_case[4] then
        raise exception 'FAIL: rejestracja z zaproszeniem (%) - kod % zamiast %', v_case[1], v_state, v_case[4];
      end if;
    end;

    select count(*) into v_users from auth.users where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    if v_users <> 0 or exists (select 1 from public.profiles where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') then
      raise exception 'FAIL: odmowa (%) zostawila konto', v_case[1];
    end if;

    if v_case[5] <> '' then
      select account_id into v_linked from public.instructors where id = current_setting('app.i_' || v_case[5])::bigint;
      select accepted_at into v_accepted from public.instructor_invitations
      where token_hash = sha256(convert_to(v_case[2], 'UTF8'));
      if v_linked is not null or v_accepted is not null then
        raise exception 'FAIL: odmowa (%) - instruktor powiazany z %, przyjete %', v_case[1], v_linked, v_accepted;
      end if;
    end if;
    raise notice 'PASS: % - odmowa (%), bez konta', v_case[1], v_case[4];
  end loop;
end $$;

-- Rejestracja bez tokenu dziala jak dotad (rola z metadanych, bez powiazania).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'authenticated',
        'authenticated', 'bez.zaproszenia@example.com', '{"role":"rider","full_name":"Bez Zaproszenia"}', now(), now());

do $$
begin
  if (select role from public.profiles where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') is distinct from 'rider'
     or exists (select 1 from public.instructors where account_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee') then
    raise exception 'FAIL: rejestracja bez tokenu zmienila zachowanie';
  end if;
  raise notice 'PASS: rejestracja bez tokenu - rola z formularza, bez powiazania';
end $$;

rollback;
