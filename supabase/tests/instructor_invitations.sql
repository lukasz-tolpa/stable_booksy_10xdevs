-- Dowod zaproszen instruktorow do konta (#74, spec #70, ADR-0004, GLOSSARY "Instruktor",
-- "Wlasciciel").
--
-- Gwarancje w bazie, nie w aplikacji:
--   * zaproszenie wystawia, wycofuje i listuje wylacznie wlasciciel osrodka (42501 dla
--     instruktora nie-wlasciciela, jezdzca; niezalogowany nie wywola funkcji),
--   * tylko dla instruktora wlasnego osrodka (SB013 - cudzy i nieistniejacy jednym kodem),
--     tylko aktywnego (SB014) i bez konta (SB015); adres pusty albo bez "@" - 23514,
--   * baza przechowuje tylko skrot tokenu (sha256), sam token zwraca funkcja raz,
--   * zaproszenie wygasa 7 dni po wystawieniu,
--   * adres jest zapisany bez wielkosci liter i spacji na brzegach,
--   * najwyzej jedno zywe zaproszenie na instruktora: nowe uniewaznia poprzednie (takze
--     wygasle), a indeks czesciowy odrzuca drugie otwarte nawet jako postgres (23505),
--   * wycofane zaproszenie nie jest zywe; lista pomija wycofane, wygasle oraz instruktorow
--     nieaktywnych i z kontem,
--   * dezaktywacja instruktora wycofuje jego zywe zaproszenie, wiec ponowna aktywacja nie
--     ozywia starego linku,
--   * tabeli nie czyta ani nie zmienia nikt poza funkcjami (42501).
--
-- Instruktorzy i konta tymczasowe powstaja w transakcji (seed moze dawac instruktorom konta),
-- wiec skrypt nie zalezy od tego, kto w seedzie ma konto. Kazda persona we wlasnej
-- transakcji z ROLLBACK.
--
-- Uzycie:  npm run test:db
--          docker exec -i supabase_db_<project_id> psql -U postgres -d postgres -q < supabase/tests/instructor_invitations.sql

\set ON_ERROR_STOP on

-- Przygotowanie (jako postgres, w transakcji): w "Stadnina Pod Dębem" aktywny instruktor bez
-- konta, nieaktywny bez konta i aktywny z kontem nie-wlasciciela (konto tymczasowe 7777...);
-- w "Stajnia Nad Rzeką" aktywny instruktor bez konta.

\echo '=== Zaproszenia: wlasciciel wystawia, ponawia i wycofuje ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated',
        'authenticated', 'instruktor.z.kontem@example.com', '{"role":"instructor","full_name":"Z Kontem"}', now(), now());

do $$
declare
  v_a bigint := (select id from public.stables where owner_id = '11111111-1111-1111-1111-111111111111');
  v_b bigint := (select id from public.stables where owner_id = '22222222-2222-2222-2222-222222222222');
  v_id bigint;
begin
  if v_a is null or v_b is null then
    raise exception 'Brak danych demo albo seed nieaktualny - uruchom npx supabase db reset';
  end if;
  insert into public.instructors (stable_id, name) values (v_a, 'Zaproszona Aktywna') returning id into v_id;
  perform set_config('app.active', v_id::text, true);
  insert into public.instructors (stable_id, name, active) values (v_a, 'Zaproszony Nieaktywny', false) returning id into v_id;
  perform set_config('app.inactive', v_id::text, true);
  insert into public.instructors (stable_id, name, account_id) values (v_a, 'Zaproszony Z Kontem', '77777777-7777-7777-7777-777777777777') returning id into v_id;
  perform set_config('app.linked', v_id::text, true);
  insert into public.instructors (stable_id, name) values (v_b, 'Obcy Bez Konta') returning id into v_id;
  perform set_config('app.foreign', v_id::text, true);
  perform set_config('app.owner_instructor', (select id::text from public.instructors where account_id = '11111111-1111-1111-1111-111111111111'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_active bigint := current_setting('app.active')::bigint;
  v_token text;
  v_expires timestamptz;
  v_listed int;
  v_email text;
begin
  select token, expires_at into v_token, v_expires
  from public.issue_instructor_invitation(v_active, '  Nowa.Instruktorka@Example.COM ');
  if v_token is null or v_token !~ '^[0-9a-f]{64}$' then
    raise exception 'FAIL: token zaproszenia ma postac %', v_token;
  end if;
  perform set_config('app.token1', v_token, true);
  perform set_config('app.expires1', v_expires::text, true);

  select count(*), max(email) into v_listed, v_email
  from public.list_instructor_invitations() l where l.instructor_id = v_active;
  if v_listed <> 1 or v_email is distinct from 'nowa.instruktorka@example.com' then
    raise exception 'FAIL: lista wlasciciela ma % zaproszen dla instruktora (adres %)', v_listed, v_email;
  end if;
  raise notice 'PASS: wlasciciel wystawia zaproszenie, token 64 znaki hex, adres bez wielkosci liter i spacji';
end $$;

reset role;

do $$
declare
  v_active bigint := current_setting('app.active')::bigint;
  v_token text := current_setting('app.token1');
  v_row jsonb;
  v_hash bytea;
  v_created timestamptz;
  v_expires timestamptz;
begin
  select to_jsonb(i), i.token_hash, i.created_at, i.expires_at into v_row, v_hash, v_created, v_expires
  from public.instructor_invitations i where i.instructor_id = v_active;
  if v_row::text like '%' || v_token || '%' then
    raise exception 'FAIL: baza przechowuje sam token zaproszenia';
  end if;
  if v_hash is distinct from sha256(convert_to(v_token, 'UTF8')) then
    raise exception 'FAIL: zapisany skrot nie jest sha256 tokenu';
  end if;
  raise notice 'PASS: baza przechowuje tylko skrot tokenu (sha256)';

  if v_expires - v_created <> interval '7 days' or v_expires::text <> current_setting('app.expires1') then
    raise exception 'FAIL: zaproszenie wygasa po % (zwrocone %)', v_expires - v_created, current_setting('app.expires1');
  end if;
  raise notice 'PASS: zaproszenie wygasa 7 dni po wystawieniu';

  begin
    insert into public.instructor_invitations (stable_id, instructor_id, email, token_hash)
    select stable_id, id, 'drugie@example.com', sha256('inny'::bytea) from public.instructors where id = v_active;
    raise exception 'FAIL: drugie otwarte zaproszenie tego samego instruktora przeszlo';
  exception when unique_violation then
    raise notice 'PASS: drugie otwarte zaproszenie instruktora odrzucone przez indeks (23505)';
  end;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_active bigint := current_setting('app.active')::bigint;
  v_token text;
  v_email text;
  v_listed int;
  v_revoked boolean;
begin
  select token into v_token from public.issue_instructor_invitation(v_active, 'poprawiony@example.com');
  if v_token = current_setting('app.token1') then
    raise exception 'FAIL: ponowne zaproszenie dalo ten sam token';
  end if;
  perform set_config('app.token2', v_token, true);

  select count(*), max(email) into v_listed, v_email
  from public.list_instructor_invitations() l where l.instructor_id = v_active;
  if v_listed <> 1 or v_email <> 'poprawiony@example.com' then
    raise exception 'FAIL: po ponownym zaproszeniu lista ma % zaproszen (adres %)', v_listed, v_email;
  end if;
  raise notice 'PASS: zaproszenie ponownie - na liscie tylko nowe zaproszenie';

  v_revoked := public.revoke_instructor_invitation(v_active);
  if v_revoked is distinct from true then
    raise exception 'FAIL: wycofanie zywego zaproszenia zwrocilo %', v_revoked;
  end if;
  select count(*) into v_listed from public.list_instructor_invitations() l where l.instructor_id = v_active;
  if v_listed <> 0 then
    raise exception 'FAIL: wycofane zaproszenie nadal na liscie';
  end if;

  v_revoked := public.revoke_instructor_invitation(v_active);
  if v_revoked is distinct from false then
    raise exception 'FAIL: wycofanie bez zywego zaproszenia zwrocilo %', v_revoked;
  end if;
  raise notice 'PASS: wycofane zaproszenie znika z listy; drugie wycofanie nic nie zmienia (false)';
end $$;

reset role;

do $$
declare
  v_active bigint := current_setting('app.active')::bigint;
  v_old timestamptz;
  v_new timestamptz;
  v_open int;
begin
  select revoked_at into v_old from public.instructor_invitations
  where token_hash = sha256(convert_to(current_setting('app.token1'), 'UTF8'));
  select revoked_at into v_new from public.instructor_invitations
  where token_hash = sha256(convert_to(current_setting('app.token2'), 'UTF8'));
  if v_old is null or v_new is null then
    raise exception 'FAIL: poprzednie zaproszenie wycofane=%, ostatnie wycofane=%', v_old, v_new;
  end if;
  select count(*) into v_open from public.instructor_invitations
  where instructor_id = v_active and revoked_at is null and accepted_at is null;
  if v_open <> 0 then
    raise exception 'FAIL: instruktor ma % otwartych zaproszen po wycofaniu', v_open;
  end if;
  raise notice 'PASS: nowe zaproszenie uniewaznilo poprzednie, wycofane nie jest zywe';
end $$;

rollback;

\echo '=== Zaproszenia: odmowy dla wlasciciela (instruktor nieaktywny, z kontem, cudzy, zly adres) ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated',
        'authenticated', 'instruktor.z.kontem@example.com', '{"role":"instructor","full_name":"Z Kontem"}', now(), now());

do $$
declare
  v_a bigint := (select id from public.stables where owner_id = '11111111-1111-1111-1111-111111111111');
  v_b bigint := (select id from public.stables where owner_id = '22222222-2222-2222-2222-222222222222');
  v_id bigint;
begin
  insert into public.instructors (stable_id, name) values (v_a, 'Zaproszona Aktywna') returning id into v_id;
  perform set_config('app.active', v_id::text, true);
  insert into public.instructors (stable_id, name, active) values (v_a, 'Zaproszony Nieaktywny', false) returning id into v_id;
  perform set_config('app.inactive', v_id::text, true);
  insert into public.instructors (stable_id, name, account_id) values (v_a, 'Zaproszony Z Kontem', '77777777-7777-7777-7777-777777777777') returning id into v_id;
  perform set_config('app.linked', v_id::text, true);
  insert into public.instructors (stable_id, name) values (v_b, 'Obcy Bez Konta') returning id into v_id;
  perform set_config('app.foreign', v_id::text, true);
  perform set_config('app.owner_instructor', (select id::text from public.instructors where account_id = '11111111-1111-1111-1111-111111111111'), true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_active bigint := current_setting('app.active')::bigint;
  v_inactive bigint := current_setting('app.inactive')::bigint;
  v_linked bigint := current_setting('app.linked')::bigint;
  v_foreign bigint := current_setting('app.foreign')::bigint;
  v_owner bigint := current_setting('app.owner_instructor')::bigint;
  v_email text;
begin
  begin
    perform public.issue_instructor_invitation(v_inactive, 'nieaktywny@example.com');
    raise exception 'FAIL: zaproszenie dla instruktora nieaktywnego przeszlo';
  exception when sqlstate 'SB014' then
    raise notice 'PASS: instruktor nieaktywny - odmowa (SB014)';
  end;

  begin
    perform public.issue_instructor_invitation(v_linked, 'drugie.konto@example.com');
    raise exception 'FAIL: zaproszenie dla instruktora z kontem przeszlo';
  exception when sqlstate 'SB015' then
    raise notice 'PASS: instruktor z kontem - odmowa (SB015)';
  end;

  begin
    perform public.issue_instructor_invitation(v_owner, 'wlasciciel@example.com');
    raise exception 'FAIL: zaproszenie dla instruktora wlasciciela przeszlo';
  exception when sqlstate 'SB015' then
    raise notice 'PASS: instruktor wlasciciel (ma konto) - odmowa (SB015)';
  end;

  begin
    perform public.issue_instructor_invitation(v_foreign, 'obcy@example.com');
    raise exception 'FAIL: zaproszenie dla instruktora innego osrodka przeszlo';
  exception when sqlstate 'SB013' then
    raise notice 'PASS: instruktor innego osrodka - odmowa (SB013)';
  end;

  begin
    perform public.issue_instructor_invitation(-1, 'nikt@example.com');
    raise exception 'FAIL: zaproszenie dla nieistniejacego instruktora przeszlo';
  exception when sqlstate 'SB013' then
    raise notice 'PASS: nieistniejacy instruktor - ta sama odmowa (SB013), bez wyroczni istnienia';
  end;

  foreach v_email in array array['', '   ', 'bez-malpy', 'dwa slowa@example.com', '@example.com'] loop
    begin
      perform public.issue_instructor_invitation(v_active, v_email);
      raise exception 'FAIL: zaproszenie z adresem "%" przeszlo', v_email;
    exception when check_violation then
      null;
    end;
  end loop;
  raise notice 'PASS: pusty albo niepoprawny adres - odmowa (23514)';

  begin
    perform public.revoke_instructor_invitation(v_foreign);
    raise exception 'FAIL: wycofanie dla instruktora innego osrodka przeszlo';
  exception when sqlstate 'SB013' then
    raise notice 'PASS: wycofanie dla instruktora innego osrodka - odmowa (SB013)';
  end;
end $$;

reset role;

do $$
declare
  v int;
begin
  select count(*) into v from public.instructor_invitations
  where instructor_id in (current_setting('app.inactive')::bigint, current_setting('app.linked')::bigint,
                          current_setting('app.foreign')::bigint, current_setting('app.owner_instructor')::bigint,
                          current_setting('app.active')::bigint);
  if v <> 0 then
    raise exception 'FAIL: po odmowach zostalo % zaproszen', v;
  end if;
  raise notice 'PASS: odmowy nie zostawiaja zaproszen';
end $$;

rollback;

\echo '=== Zaproszenia: lista pomija wygasle i instruktorow, ktorzy przestali sie kwalifikowac ==='

begin;

do $$
declare
  v_a bigint := (select id from public.stables where owner_id = '11111111-1111-1111-1111-111111111111');
  v_id bigint;
begin
  insert into public.instructors (stable_id, name) values (v_a, 'Wygasle Zaproszenie') returning id into v_id;
  perform set_config('app.expired', v_id::text, true);
  insert into public.instructors (stable_id, name) values (v_a, 'Dezaktywowany Po Zaproszeniu') returning id into v_id;
  perform set_config('app.deactivated', v_id::text, true);
  insert into public.instructors (stable_id, name) values (v_a, 'Zywe Zaproszenie') returning id into v_id;
  perform set_config('app.live', v_id::text, true);
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
begin
  perform public.issue_instructor_invitation(current_setting('app.expired')::bigint, 'wygasle@example.com');
  perform public.issue_instructor_invitation(current_setting('app.deactivated')::bigint, 'dezaktywowany@example.com');
  perform public.issue_instructor_invitation(current_setting('app.live')::bigint, 'zywe@example.com');
  update public.instructors set active = false where id = current_setting('app.deactivated')::bigint;
end $$;

reset role;

-- Dezaktywacja (ten sam UPDATE co strona Instruktorzy, jako wlasciciel przez RLS) wycofuje zywe
-- zaproszenie w tej samej transakcji - ponowna aktywacja nie moze ozywic starego linku.
do $$
declare
  v_revoked timestamptz;
  v_open int;
begin
  select revoked_at into v_revoked from public.instructor_invitations
  where instructor_id = current_setting('app.deactivated')::bigint;
  select count(*) into v_open from public.instructor_invitations
  where instructor_id = current_setting('app.deactivated')::bigint and accepted_at is null and revoked_at is null;
  if v_revoked is null or v_open <> 0 then
    raise exception 'FAIL: po dezaktywacji zaproszenie wycofane %, otwartych %', v_revoked, v_open;
  end if;
  raise notice 'PASS: dezaktywacja instruktora wycofuje jego zywe zaproszenie';
end $$;

-- Wystawione 8 dni temu: wygaslo dzien temu.
update public.instructor_invitations
set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
where instructor_id = current_setting('app.expired')::bigint;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_ids bigint[];
  v_token text;
  v_open int;
begin
  select array_agg(instructor_id order by instructor_id) into v_ids
  from public.list_instructor_invitations()
  where instructor_id in (current_setting('app.expired')::bigint, current_setting('app.deactivated')::bigint,
                          current_setting('app.live')::bigint);
  if v_ids is distinct from array[current_setting('app.live')::bigint] then
    raise exception 'FAIL: lista zaproszen zawiera %', v_ids;
  end if;
  raise notice 'PASS: lista pomija wygasle zaproszenie i instruktora zdezaktywowanego po zaproszeniu';

  -- Ponowna aktywacja: stare zaproszenie zostaje wycofane, na liscie go nie ma.
  update public.instructors set active = true where id = current_setting('app.deactivated')::bigint;
  select count(*) into v_open from public.list_instructor_invitations()
  where instructor_id = current_setting('app.deactivated')::bigint;
  if v_open <> 0 then
    raise exception 'FAIL: po ponownej aktywacji stare zaproszenie wrocilo na liste';
  end if;
  raise notice 'PASS: ponowna aktywacja nie przywraca wycofanego zaproszenia';

  -- Odnowienie wygaslego linku: nowe zaproszenie zastepuje wygasle (ktore nie bylo wycofane).
  select token into v_token
  from public.issue_instructor_invitation(current_setting('app.expired')::bigint, 'wygasle@example.com');
  select count(*) into v_open from public.list_instructor_invitations()
  where instructor_id = current_setting('app.expired')::bigint;
  if v_token is null or v_open <> 1 then
    raise exception 'FAIL: odnowienie wygaslego zaproszenia - token %, na liscie %', v_token, v_open;
  end if;
  raise notice 'PASS: wygasle zaproszenie da sie odnowic nowym';
end $$;

rollback;

\echo '=== Zaproszenia: instruktor nie-wlasciciel, wlasciciel innego osrodka, jezdziec, niezalogowany ==='

begin;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated',
        'authenticated', 'instruktor.z.kontem@example.com', '{"role":"instructor","full_name":"Z Kontem"}', now(), now());

do $$
declare
  v_a bigint := (select id from public.stables where owner_id = '11111111-1111-1111-1111-111111111111');
  v_id bigint;
begin
  insert into public.instructors (stable_id, name) values (v_a, 'Zaproszona Aktywna') returning id into v_id;
  perform set_config('app.active', v_id::text, true);
  insert into public.instructors (stable_id, name, account_id) values (v_a, 'Zaproszony Z Kontem', '77777777-7777-7777-7777-777777777777');
end $$;

-- Zywe zaproszenie wlasciciela, ktore inni probuja wycofac, ponowic i przeczytac.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
begin
  perform set_config('app.token', (select token from public.issue_instructor_invitation(current_setting('app.active')::bigint, 'zaproszona@example.com')), true);
end $$;

-- Persony: instruktor nie-wlasciciel tego samego osrodka, jezdziec - 42501 na wszystkim.
do $$
declare
  v_sub text;
  v_active bigint := current_setting('app.active')::bigint;
  v int;
begin
  foreach v_sub in array array['77777777-7777-7777-7777-777777777777', '33333333-3333-3333-3333-333333333333'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_sub, 'role', 'authenticated')::text, true);

    begin
      perform public.issue_instructor_invitation(v_active, 'przejete@example.com');
      raise exception 'FAIL: % wystawil zaproszenie', v_sub;
    exception when insufficient_privilege then
      null;
    end;

    begin
      perform public.revoke_instructor_invitation(v_active);
      raise exception 'FAIL: % wycofal zaproszenie', v_sub;
    exception when insufficient_privilege then
      null;
    end;

    begin
      perform count(*) from public.list_instructor_invitations();
      raise exception 'FAIL: % wylistowal zaproszenia', v_sub;
    exception when insufficient_privilege then
      null;
    end;

    begin
      select count(*) into v from public.instructor_invitations;
      raise exception 'FAIL: % czyta tabele zaproszen (% wierszy)', v_sub, v;
    exception when insufficient_privilege then
      null;
    end;

    begin
      update public.instructor_invitations set revoked_at = now();
      raise exception 'FAIL: % zmienil tabele zaproszen', v_sub;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'PASS: instruktor nie-wlasciciel i jezdziec nie wystawiaja, nie wycofuja, nie listuja (42501), tabela zamknieta';
end $$;

-- Wlasciciel innego osrodka: cudzy instruktor (SB013), jego lista nie zawiera cudzych zaproszen.
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v_active bigint := current_setting('app.active')::bigint;
  v int;
begin
  begin
    perform public.issue_instructor_invitation(v_active, 'przejete@example.com');
    raise exception 'FAIL: wlasciciel innego osrodka wystawil zaproszenie';
  exception when sqlstate 'SB013' then
    null;
  end;

  begin
    perform public.revoke_instructor_invitation(v_active);
    raise exception 'FAIL: wlasciciel innego osrodka wycofal zaproszenie';
  exception when sqlstate 'SB013' then
    null;
  end;

  select count(*) into v from public.list_instructor_invitations() where instructor_id = v_active;
  if v <> 0 then
    raise exception 'FAIL: wlasciciel innego osrodka widzi cudze zaproszenie';
  end if;
  raise notice 'PASS: wlasciciel innego osrodka nie wystawia, nie wycofuje (SB013) i nie widzi cudzych zaproszen';
end $$;

reset role;

do $$
declare
  v_email text;
  v_revoked timestamptz;
  v int;
begin
  select count(*), max(email), max(revoked_at) into v, v_email, v_revoked
  from public.instructor_invitations
  where instructor_id = current_setting('app.active')::bigint;
  if v <> 1 or v_email <> 'zaproszona@example.com' or v_revoked is not null then
    raise exception 'FAIL: po probach obcych zaproszenie ma % wierszy, adres %, wycofane %', v, v_email, v_revoked;
  end if;
  raise notice 'PASS: zaproszenie wlasciciela nietkniete po probach obcych';
end $$;

set local role anon;

do $$
begin
  begin
    perform public.issue_instructor_invitation(1, 'anonim@example.com');
    raise exception 'FAIL: niezalogowany wywolal issue_instructor_invitation';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.revoke_instructor_invitation(1);
    raise exception 'FAIL: niezalogowany wywolal revoke_instructor_invitation';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform count(*) from public.list_instructor_invitations();
    raise exception 'FAIL: niezalogowany wywolal list_instructor_invitations';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'PASS: niezalogowany nie wywola funkcji zaproszen';
end $$;

rollback;

\echo '--- WSZYSTKIE ASERCJE ZAPROSZEN INSTRUKTOROW PRZESZLY ---'
