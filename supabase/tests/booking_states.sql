-- Dowod stanow zapisu przed zapisami oczekujacymi (#123, spec #122, ADR 0006, GLOSSARY „Zapis”).
--
-- Prefactor: baza zna stany oczekujacy / aktywny / odrzucony / odwolany, ale zaden ekran jeszcze
-- nie tworzy zapisu oczekujacego (wstawia go tu postgres). Gwarancje:
--   * CHECK bookings_status_check przepuszcza wszystkie cztery stany, odrzuca inne        -> 23514
--   * znacznik przyjecia `accepted_at`: zapis aktywny zawsze go ma (wyzwalacz
--     bookings_acceptance stempluje przy wstawieniu aktywnego i przy przejsciu w aktywny),
--     odwolanie zapisu przyjetego go zachowuje, oczekujacy i odrzucony go nie maja        -> 23514
--     (bookings_accepted_at_consistency_check); odwolanie oczekujacego zostaje bez znacznika
--   * zapisy z seeda (aktywne) sa przyjete
--   * „Jezdziec osrodka” (private.is_rider_of_my_stable) to jezdziec z zapisem, ktory byl
--     aktywny: jezdziec z samym zapisem oczekujacym, odrzuconym albo wycofanym oczekujacym
--     nie widzi sie wlascicielowi w profilach (podstawa „Pozostalych jezdzcow osrodka”)
--   * zapis oczekujacy nie zajmuje miejsca w get_slot_occupancy.
--
-- Seed (jutro, Pod Dębem 10-16): Joanna Wrona 1 miejsce w kazdej godzinie, Anna u Joanny o 11.
-- Wymaga swiezego seeda (`npx supabase db reset` tego samego dnia).
-- Uzycie:  npm run test:db
--
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Stany zapisu: setup (postgres) ==='

begin;

-- Swieza jezdzczyni bez zadnego zapisu - kandydatka na „jezdzca osrodka”.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'abababab-abab-abab-abab-abababababab', 'authenticated',
        'authenticated', 'zofia.nowicjuszka@example.com', '{"role":"rider","full_name":"Zofia Nowicjuszka"}',
        now(), now());

do $$
declare
  v_stable bigint;
  v_day bigint;
  v_joanna bigint;
  v_accepted timestamptz;
  v_state text;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors where stable_id = v_stable and name = 'Joanna Wrona';
  if v_day is null or v_joanna is null then
    raise exception 'Brak danych seeda albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  perform set_config('app.stable', v_stable::text, true);
  perform set_config('app.day', v_day::text, true);
  perform set_config('app.joanna', v_joanna::text, true);

  -- Seed: zapis aktywny Anny jest przyjety.
  select accepted_at into v_accepted from public.bookings
  where schedule_day_id = v_day and instructor_id = v_joanna and hour = 11
    and rider_id = '33333333-3333-3333-3333-333333333333';
  if v_accepted is null then
    raise exception 'FAIL: zapis aktywny z seeda nie ma znacznika przyjecia';
  end if;
  raise notice 'PASS: zapis aktywny z seeda jest przyjety';

  -- Stan spoza czterech jest odmawiany.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
    values (v_day, v_joanna, 12, 'abababab-abab-abab-abab-abababababab', 'expired');
    raise exception 'FAIL: zapis w stanie spoza czterech przeszedl';
  exception when check_violation then
    raise notice 'PASS: stan „expired” nie jest stanem kolumny (wygasniecie jest wyprowadzane)';
  end;

  -- Oczekujacy i odrzucony sa stanami kolumny, bez znacznika przyjecia.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
  values (v_day, v_joanna, 13, 'abababab-abab-abab-abab-abababababab', 'pending');
  -- Odrzucony zawsze z powodem i zrodlem (#125, bookings_rejection_consistency_check).
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, rejection_reason,
                               rejection_source, rejected_at)
  values (v_day, v_joanna, 14, 'abababab-abab-abab-abab-abababababab', 'rejected', 'Brak koni', 'stable', now());
  select string_agg(status || ':' || (accepted_at is not null)::text, ',' order by hour) into v_state
  from public.bookings where rider_id = 'abababab-abab-abab-abab-abababababab';
  if v_state is distinct from 'pending:false,rejected:false' then
    raise exception 'FAIL: oczekujacy i odrzucony maja stan/znacznik %', v_state;
  end if;
  raise notice 'PASS: zapis oczekujacy i odrzucony istnieja bez znacznika przyjecia';

  -- Zapis oczekujacy ze znacznikiem przyjecia jest sprzeczny.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, accepted_at)
    values (v_day, v_joanna, 15, 'abababab-abab-abab-abab-abababababab', 'pending', now());
    raise exception 'FAIL: zapis oczekujacy ze znacznikiem przyjecia przeszedl';
  exception when check_violation then
    raise notice 'PASS: zapis oczekujacy nie moze miec znacznika przyjecia';
  end;
end $$;

\echo '=== Zapis oczekujacy nie zajmuje miejsca ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
begin
  select taken into v from public.get_slot_occupancy(current_setting('app.stable')::bigint, current_date + 1)
  where instructor_id = current_setting('app.joanna')::bigint and hour = 13;
  if coalesce(v, 0) <> 0 then
    raise exception 'FAIL: zapis oczekujacy zajmuje miejsce w get_slot_occupancy (taken = %)', v;
  end if;
  raise notice 'PASS: zapis oczekujacy nie zajmuje miejsca';
end $$;

\echo '=== Jezdziec z samym zapisem oczekujacym albo odrzuconym nie jest jezdzcem osrodka ==='

do $$
declare
  v int;
begin
  select count(*) into v from public.profiles where id = 'abababab-abab-abab-abab-abababababab';
  if v <> 0 then
    raise exception 'FAIL: wlasciciel czyta profil jezdzczyni z samym zapisem oczekujacym i odrzuconym';
  end if;
  if private.is_rider_of_my_stable('abababab-abab-abab-abab-abababababab') then
    raise exception 'FAIL: jezdziec z samym zapisem oczekujacym i odrzuconym jest „jezdzcem osrodka”';
  end if;
  raise notice 'PASS: oczekujacy i odrzucony nie czynia jezdzca jezdzcem osrodka';
end $$;

reset role;

\echo '=== Wycofanie zapisu oczekujacego zostaje bez znacznika przyjecia ==='

-- Jezdziec odwoluje wlasny zapis jak w aplikacji (polityka UPDATE „wlasny wiersz”).
set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
where rider_id = 'abababab-abab-abab-abab-abababababab' and status = 'pending';
reset role;

do $$
declare
  v_accepted boolean;
begin
  select accepted_at is not null into v_accepted from public.bookings
  where rider_id = 'abababab-abab-abab-abab-abababababab' and status = 'cancelled';
  if v_accepted is distinct from false then
    raise exception 'FAIL: wycofany zapis oczekujacy ma znacznik przyjecia (%)', v_accepted;
  end if;
  raise notice 'PASS: odwolanie zapisu oczekujacego nie jest odwolaniem zapisu przyjetego';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
begin
  if private.is_rider_of_my_stable('abababab-abab-abab-abab-abababababab') then
    raise exception 'FAIL: wycofany zapis oczekujacy czyni jezdzca jezdzcem osrodka';
  end if;
  raise notice 'PASS: wycofany zapis oczekujacy nie czyni jezdzca jezdzcem osrodka';
end $$;

reset role;

\echo '=== Przejscie w aktywny stempluje przyjecie, odwolanie go zachowuje ==='

insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 15,
        'abababab-abab-abab-abab-abababababab', 'pending');
update public.bookings set status = 'active'
where rider_id = 'abababab-abab-abab-abab-abababababab' and status = 'pending';

do $$
declare
  v_accepted timestamptz;
begin
  select accepted_at into v_accepted from public.bookings
  where rider_id = 'abababab-abab-abab-abab-abababababab' and status = 'active';
  if v_accepted is null then
    raise exception 'FAIL: zapis po przejsciu w aktywny nie ma znacznika przyjecia';
  end if;
  raise notice 'PASS: przejscie w aktywny stempluje przyjecie';
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
where rider_id = 'abababab-abab-abab-abab-abababababab' and status = 'active';
reset role;

do $$
declare
  v int;
begin
  select count(*) into v from public.bookings
  where rider_id = 'abababab-abab-abab-abab-abababababab' and status = 'cancelled' and accepted_at is not null;
  if v <> 1 then
    raise exception 'FAIL: odwolanie zapisu przyjetego zgubilo znacznik przyjecia (% wierszy)', v;
  end if;
  raise notice 'PASS: odwolanie zapisu przyjetego zachowuje znacznik przyjecia';
end $$;

\echo '=== Jezdziec z zapisem, ktory byl aktywny, jest jezdzcem osrodka ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.profiles where id = 'abababab-abab-abab-abab-abababababab';
  if v <> 1 or not private.is_rider_of_my_stable('abababab-abab-abab-abab-abababababab') then
    raise exception 'FAIL: jezdziec z odwolanym zapisem przyjetym nie jest jezdzcem osrodka (profili: %)', v;
  end if;
  raise notice 'PASS: zapis, ktory byl aktywny (takze odwolany), czyni jezdzca jezdzcem osrodka';
end $$;

reset role;

rollback;

\echo '=== Stany zapisu: wszystkie dowody przeszly ==='
