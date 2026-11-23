-- Dowod zapisu oczekujacego i przyjecia zapisu (#124, spec #122, ADR 0006, GLOSSARY „Zapis oczekujący”,
-- „Przyjęcie zapisu”, „Wygaśnięcie zapisu”).
--
-- Gwarancje:
--   * zapis jezdzca zawsze powstaje jako oczekujacy (wartosc domyslna i polityka INSERT); jezdziec nie
--     wstawi zapisu aktywnego (42501) ani nie zmieni stanu swojego zapisu inaczej niz przez odwolanie   -> 42501
--   * reguly zapisu dzialaja przy zapisie oczekujacym: slot istnieje i ma wolne miejsce (SB009), godzina
--     w zakresie dnia (23514), slot sie nie zaczal (SB064), rodzaj slotu wobec pensjonariusza (SB049/SB050),
--     kon pensjonatowy przydzielony od razu przy slocie treningowym (przechodzi na zapis aktywny)
--   * jeden zapis oczekujacy albo aktywny jezdzca na godzine dnia (bookings_rider_hour_key)       -> 23505
--   * zapis oczekujacy nie zajmuje miejsca (get_slot_occupancy); na jedno miejsce czeka kilku jezdzcow
--   * osrodek nie odwoluje zapisu oczekujacego i nie ustawia stanu wprost                          -> 42501
--   * przyjecie (public.accept_booking) zmienia zapis w aktywny i zajmuje miejsce; odmawia ponad limit
--     (SB009 z bookings_seat_limit), po starcie slotu (SB064), dla zapisu nieoczekujacego (SB065), dla
--     wolajacego bez uprawnien i cudzego/nieistniejacego zapisu (SB066)
--   * zapisy do przyjecia osrodka (public.get_pending_bookings): jezdziec z imieniem i adresem, slot,
--     zajete miejsca; tylko osrodek wlasciciela, bez zapisow, ktorych dzien minal
--   * odrzucony zapis jest koncowy                                                                -> 42501
--   * usuniecie konta jezdzca usuwa jego przyszle zapisy oczekujace (ADR 0001).
-- Wyscig dwoch przyjec: supabase/tests/concurrent_seat_booking.sh.
--
-- Seed (jutro, Pod Dębem 10-16): Joanna Wrona 1 miejsce w kazdej godzinie, Anna u Joanny o 11, Karol bez
-- grafiku; pensjonariuszka Katarzyna (Hrabia). Wymaga swiezego seeda (`npx supabase db reset`).
-- Calosc w jednej transakcji zakonczonej ROLLBACK - skrypt nie zostawia zmian.

\set ON_ERROR_STOP on

\echo '=== Zapis oczekujacy i przyjecie: setup (postgres) ==='

begin;

-- Swieza jezdzczyni bez zadnego zapisu.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'abababab-abab-abab-abab-abababababab', 'authenticated',
        'authenticated', 'zofia.nowicjuszka@example.com', '{"role":"rider","full_name":"Zofia Nowicjuszka"}',
        now(), now());

do $$
declare
  v_today date := (now() at time zone 'Europe/Warsaw')::date;
  v_stable bigint;
  v_day bigint;
  v_joanna bigint;
  v_karol bigint;
  v_yesterday bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors where stable_id = v_stable and name = 'Joanna Wrona';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  if v_day is null or v_joanna is null or v_karol is null then
    raise exception 'Brak danych seeda albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Karol pracuje jutro: o 13 slot rekreacyjny (suma limitow o 13: Joanna 1 + Karol 1 = 2 konie),
  -- o 14 slot treningowy z 1 miejscem. Postgres pisze grafik wprost, jak seed.
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id, kind)
  values (v_day, v_karol, 13, 1, private.default_place_id(v_stable), 'recreation'),
         (v_day, v_karol, 14, 1, private.default_place_id(v_stable), 'training');

  -- Wczoraj (czas polski): slot Joanny o 10 juz sie zaczal (i skonczyl).
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, v_today - 1, 10, 16)
  returning id into v_yesterday;
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_yesterday, v_joanna, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id)
  values (v_yesterday, v_joanna, 10, 1, private.default_place_id(v_stable));

  perform set_config('app.stable', v_stable::text, true);
  perform set_config('app.day', v_day::text, true);
  perform set_config('app.yesterday', v_yesterday::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.karol', v_karol::text, true);
end $$;

\echo '=== Zapis jezdzca powstaje jako oczekujacy ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';

do $$
declare
  v_id bigint;
  v_status text;
begin
  -- Jak aplikacja: bez stanu.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 13,
          'abababab-abab-abab-abab-abababababab')
  returning id, status into v_id, v_status;
  if v_status <> 'pending' then
    raise exception 'FAIL: zapis jezdzca powstal w stanie % zamiast oczekujacego', v_status;
  end if;
  perform set_config('app.zofia_13', v_id::text, true);
  raise notice 'PASS: zapis jezdzca powstaje jako oczekujacy';

  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
    values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 15,
            'abababab-abab-abab-abab-abababababab', 'active');
    raise exception 'FAIL: jezdziec wstawil zapis aktywny';
  exception when insufficient_privilege then
    raise notice 'PASS: jezdziec nie wstawi zapisu aktywnego (42501)';
  end;

  begin
    update public.bookings set status = 'active' where id = v_id;
    raise exception 'FAIL: jezdziec sam przyjal swoj zapis';
  exception when insufficient_privilege then
    raise notice 'PASS: jezdziec nie przyjmie sam swojego zapisu (42501)';
  end;

  begin
    update public.bookings set status = 'rejected' where id = v_id;
    raise exception 'FAIL: jezdziec odrzucil swoj zapis';
  exception when insufficient_privilege then
    raise notice 'PASS: jezdziec nie odrzuci swojego zapisu (42501)';
  end;
end $$;

\echo '=== Reguly zapisu przy zapisie oczekujacym ==='

do $$
begin
  -- Jeden oczekujacy albo aktywny zapis na godzine: u Karola o 13 juz nie.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (current_setting('app.day')::bigint, current_setting('app.karol')::bigint, 13,
            'abababab-abab-abab-abab-abababababab');
    raise exception 'FAIL: drugi zapis oczekujacy jezdzca na te sama godzine przeszedl';
  exception when unique_violation then
    raise notice 'PASS: jeden zapis oczekujacy albo aktywny na godzine (23505)';
  end;

  -- Pelny slot (Anna aktywna u Joanny o 11, 1 miejsce): zapis oczekujacy odmawiany jak dotad.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 11,
            'abababab-abab-abab-abab-abababababab');
    raise exception 'FAIL: zapis oczekujacy na pelny slot przeszedl';
  exception when sqlstate 'SB009' then
    raise notice 'PASS: zapis oczekujacy na pelny slot odmawiany (SB009)';
  end;

  -- Instruktor bez slotu o tej godzinie (Karol o 10) - jak dotad 23503.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (current_setting('app.day')::bigint, current_setting('app.karol')::bigint, 10,
            'abababab-abab-abab-abab-abababababab');
    raise exception 'FAIL: zapis oczekujacy bez slotu przeszedl';
  exception when foreign_key_violation then
    raise notice 'PASS: zapis oczekujacy wymaga slotu (23503)';
  end;

  -- Godzina poza dniem (16) - 23514.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 16,
            'abababab-abab-abab-abab-abababababab');
    raise exception 'FAIL: zapis oczekujacy poza godzinami przeszedl';
  exception when check_violation then
    raise notice 'PASS: zapis oczekujacy w godzinach dnia (23514)';
  end;

  -- Slot, ktory sie zaczal (wczoraj o 10) - SB064.
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (current_setting('app.yesterday')::bigint, current_setting('app.joanna')::bigint, 10,
            'abababab-abab-abab-abab-abababababab');
    raise exception 'FAIL: zapis na slot, ktory sie zaczal, przeszedl';
  exception when sqlstate 'SB064' then
    raise notice 'PASS: zapis na slot, ktory sie zaczal, odmawiany (SB064)';
  end;

  -- Jezdziec rekreacyjny nie zapisuje sie na slot treningowy (Karol o 14).
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (current_setting('app.day')::bigint, current_setting('app.karol')::bigint, 14,
            'abababab-abab-abab-abab-abababababab');
    raise exception 'FAIL: jezdziec rekreacyjny zapisal sie na slot treningowy';
  exception when sqlstate 'SB050' then
    raise notice 'PASS: zapis oczekujacy na slot treningowy tylko dla pensjonariusza (SB050)';
  end;
end $$;

reset role;

-- Pensjonariuszka Katarzyna: slot rekreacyjny nie dla niej, treningowy - z jej koniem od razu.
set local role authenticated;
set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

do $$
declare
  v_id bigint;
  v_status text;
  v_horse bigint;
begin
  begin
    insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
    values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 12,
            '12121212-1212-1212-1212-121212121212');
    raise exception 'FAIL: pensjonariuszka zapisala sie na slot rekreacyjny';
  exception when sqlstate 'SB049' then
    raise notice 'PASS: pensjonariusz nie zapisuje sie na slot rekreacyjny takze jako oczekujacy (SB049)';
  end;

  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.karol')::bigint, 14,
          '12121212-1212-1212-1212-121212121212')
  returning id, status, horse_id into v_id, v_status, v_horse;
  if v_status <> 'pending' or v_horse is null then
    raise exception 'FAIL: zapis pensjonariuszki na slot treningowy: stan %, kon %', v_status, v_horse;
  end if;
  perform set_config('app.katarzyna_14', v_id::text, true);
  perform set_config('app.hrabia', v_horse::text, true);
  raise notice 'PASS: zapis oczekujacy pensjonariuszki ma od razu jej konia pensjonatowego';
end $$;

reset role;

\echo '=== Na jedno miejsce czeka kilku jezdzcow; zapis oczekujacy nie zajmuje miejsca ==='

-- Piotr tez czeka na jedyne miejsce u Joanny o 13.
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

do $$
declare
  v_id bigint;
  v int;
begin
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 13,
          '44444444-4444-4444-4444-444444444444')
  returning id into v_id;
  perform set_config('app.piotr_13', v_id::text, true);

  select taken into v from public.get_slot_occupancy(current_setting('app.stable')::bigint, current_date + 1)
  where instructor_id = current_setting('app.joanna')::bigint and hour = 13;
  if coalesce(v, 0) <> 0 then
    raise exception 'FAIL: zapisy oczekujace zajmuja miejsca (taken = %)', v;
  end if;
  raise notice 'PASS: dwa zapisy oczekujace na jedno miejsce, zadne miejsce nie zajete';
end $$;

reset role;

\echo '=== Zapisy do przyjecia osrodka ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  r record;
  v int;
begin
  select * into r from public.get_pending_bookings() where booking_id = current_setting('app.zofia_13')::bigint;
  if not found then
    raise exception 'FAIL: zapisu oczekujacego Zofii nie ma w zapisach do przyjecia';
  end if;
  if r.rider_name <> 'Zofia Nowicjuszka' or r.rider_email <> 'zofia.nowicjuszka@example.com'
     or r.day <> current_date + 1 or r.hour <> 13 or r.instructor_name <> 'Joanna Wrona'
     or r.seats <> 1 or r.taken <> 0 or r.kind <> 'recreation' or r.place_name is null then
    raise exception 'FAIL: wiersz zapisu do przyjecia: %', row_to_json(r);
  end if;
  raise notice 'PASS: wlasciciel widzi jezdzca (imie, adres) i slot zapisu oczekujacego';

  select count(*) into v from public.get_pending_bookings();
  if v <> 3 then
    raise exception 'FAIL: zapisow do przyjecia jest % zamiast 3 (Zofia, Piotr, Katarzyna)', v;
  end if;
  raise notice 'PASS: zapisy do przyjecia to wszystkie zapisy oczekujace osrodka';

  -- Wlasciciel nie ustawia stanu wprost i nie odwoluje zapisu oczekujacego.
  begin
    update public.bookings set status = 'active' where id = current_setting('app.zofia_13')::bigint;
    raise exception 'FAIL: wlasciciel przyjal zapis z pominieciem funkcji przyjecia';
  exception when insufficient_privilege then
    raise notice 'PASS: wlasciciel nie zmienia stanu zapisu wprost (42501)';
  end;
  begin
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable'
    where id = current_setting('app.zofia_13')::bigint;
    raise exception 'FAIL: osrodek odwolal zapis oczekujacy';
  exception when insufficient_privilege then
    raise notice 'PASS: osrodek nie odwoluje zapisu oczekujacego (42501)';
  end;

  -- Konia osrodek przydziela dopiero zapisowi aktywnemu.
  begin
    update public.bookings
    set horse_id = (select h.id from public.horses h
                    where h.stable_id = current_setting('app.stable')::bigint and h.name = 'Bella')
    where id = current_setting('app.zofia_13')::bigint;
    raise exception 'FAIL: osrodek przydzielil konia zapisowi oczekujacemu';
  exception when check_violation then
    raise notice 'PASS: przydzial konia tylko zapisowi aktywnemu (23514)';
  end;
end $$;

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.get_pending_bookings();
  if v <> 0 then
    raise exception 'FAIL: wlasciciel innego osrodka widzi % cudzych zapisow do przyjecia', v;
  end if;
  raise notice 'PASS: zapisy do przyjecia tylko z wlasnego osrodka';

  begin
    perform public.accept_booking(current_setting('app.zofia_13')::bigint);
    raise exception 'FAIL: wlasciciel innego osrodka przyjal zapis';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: wlasciciel innego osrodka nie przyjmie zapisu (SB066)';
  end;
end $$;

reset role;

\echo '=== Przyjecie: kto moze ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';

do $$
declare
  v int;
begin
  select count(*) into v from public.get_pending_bookings();
  if v <> 0 then
    raise exception 'FAIL: jezdziec czyta zapisy do przyjecia (% wierszy)', v;
  end if;
  begin
    perform public.accept_booking(current_setting('app.zofia_13')::bigint);
    raise exception 'FAIL: jezdziec przyjal swoj zapis funkcja przyjecia';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: jezdziec nie przyjmie zapisu (SB066)';
  end;
end $$;

reset role;

-- Instruktor z kontem (swoj slot tak, cudzy nie): supabase/tests/instructor_booking_decisions.sql (#126).

\echo '=== Przyjecie przez wlasciciela ==='

-- Joanna o 13 dostaje drugie miejsce: przyjecie Zofii slotu nie zapelnia, wiec Piotr dalej czeka (przyjecie,
-- ktore zapelnia slot, odrzuca pozostalych - #125, booking_rejection.sql). Postgres pisze grafik wprost.
update public.schedule_slots set seats = 2
where schedule_day_id = current_setting('app.day')::bigint and instructor_id = current_setting('app.joanna')::bigint
  and hour = 13;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_status text;
  v_result text;
  v_accepted timestamptz;
  v_horse bigint;
  v int;
begin
  begin
    perform public.accept_booking(-1);
    raise exception 'FAIL: przyjecie nieistniejacego zapisu przeszlo';
  exception when sqlstate 'SB066' then
    raise notice 'PASS: nieistniejacy zapis - SB066';
  end;

  -- Funkcja oddaje stan zapisu po przyjeciu (odczyt zwrotny dla endpointu przed komunikatem sukcesu).
  v_result := public.accept_booking(current_setting('app.zofia_13')::bigint);
  if v_result is distinct from 'active' then
    raise exception 'FAIL: przyjecie zwrocilo stan %, oczekiwano active', v_result;
  end if;
  raise notice 'PASS: przyjecie zwraca stan zapisu po zmianie (active)';
  select status, accepted_at into v_status, v_accepted from public.bookings
  where id = current_setting('app.zofia_13')::bigint;
  if v_status <> 'active' or v_accepted is null then
    raise exception 'FAIL: po przyjeciu zapis ma stan % i znacznik %', v_status, v_accepted;
  end if;
  select taken into v from public.get_slot_occupancy(current_setting('app.stable')::bigint, current_date + 1)
  where instructor_id = current_setting('app.joanna')::bigint and hour = 13;
  if v is distinct from 1 then
    raise exception 'FAIL: przyjety zapis nie zajal miejsca (taken = %)', v;
  end if;
  raise notice 'PASS: przyjecie zmienia zapis w aktywny i zajmuje miejsce';

  select count(*) into v from public.get_pending_bookings()
  where booking_id = current_setting('app.zofia_13')::bigint;
  if v <> 0 then
    raise exception 'FAIL: przyjety zapis zostal w zapisach do przyjecia';
  end if;
  select taken into v from public.get_pending_bookings() where booking_id = current_setting('app.piotr_13')::bigint;
  if v is distinct from 1 then
    raise exception 'FAIL: zapisy do przyjecia nie widza zajetego miejsca (taken = %)', v;
  end if;
  raise notice 'PASS: zapisy do przyjecia pokazuja zajete miejsca slotu';
end $$;

reset role;

-- Ponad limit: osrodek zmniejsza limit slotu do 1 (zajete 1), Piotr nadal czeka.
update public.schedule_slots set seats = 1
where schedule_day_id = current_setting('app.day')::bigint and instructor_id = current_setting('app.joanna')::bigint
  and hour = 13;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_status text;
  v_horse bigint;
begin
  begin
    perform public.accept_booking(current_setting('app.piotr_13')::bigint);
    raise exception 'FAIL: przyjecie ponad limit miejsc przeszlo';
  exception when sqlstate 'SB009' then
    raise notice 'PASS: przyjecie ponad limit miejsc odmawiane (SB009)';
  end;

  begin
    perform public.accept_booking(current_setting('app.zofia_13')::bigint);
    raise exception 'FAIL: przyjecie zapisu aktywnego przeszlo';
  exception when sqlstate 'SB065' then
    raise notice 'PASS: przyjecie zapisu nieoczekujacego odmawiane (SB065)';
  end;

  -- Slot treningowy: kon pensjonariuszki przechodzi na zapis aktywny.
  perform public.accept_booking(current_setting('app.katarzyna_14')::bigint);
  select status, horse_id into v_status, v_horse from public.bookings
  where id = current_setting('app.katarzyna_14')::bigint;
  if v_status <> 'active' or v_horse is distinct from current_setting('app.hrabia')::bigint then
    raise exception 'FAIL: przyjety zapis na slot treningowy: stan %, kon %', v_status, v_horse;
  end if;
  raise notice 'PASS: przyjety zapis na slot treningowy zachowuje konia pensjonatowego';
end $$;

reset role;

\echo '=== Przyjecie po starcie slotu ==='

-- Zapis oczekujacy na slot, ktory juz sie zaczal (wstawia postgres - aplikacja by odmowila).
insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
values (current_setting('app.yesterday')::bigint, current_setting('app.joanna')::bigint, 10,
        'abababab-abab-abab-abab-abababababab', 'pending');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  v_id bigint;
  v int;
begin
  select id into v_id from public.bookings
  where schedule_day_id = current_setting('app.yesterday')::bigint and status = 'pending';

  select count(*) into v from public.get_pending_bookings() where booking_id = v_id;
  if v <> 0 then
    raise exception 'FAIL: zapis oczekujacy z minionego dnia jest w zapisach do przyjecia';
  end if;
  raise notice 'PASS: zapisy do przyjecia pomijaja miniony dzien';

  begin
    perform public.accept_booking(v_id);
    raise exception 'FAIL: przyjecie po starcie slotu przeszlo';
  exception when sqlstate 'SB064' then
    raise notice 'PASS: przyjecie po starcie slotu odmawiane (SB064)';
  end;
end $$;

reset role;

\echo '=== Odwolanie zapisu oczekujacego przez jezdzca; odrzucony jest koncowy ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

do $$
declare
  v_status text;
  v_accepted timestamptz;
begin
  update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
  where id = current_setting('app.piotr_13')::bigint;
  select status, accepted_at into v_status, v_accepted from public.bookings
  where id = current_setting('app.piotr_13')::bigint;
  if v_status <> 'cancelled' or v_accepted is not null then
    raise exception 'FAIL: odwolanie zapisu oczekujacego: stan %, znacznik %', v_status, v_accepted;
  end if;
  raise notice 'PASS: jezdziec odwoluje swoj zapis oczekujacy (bez znacznika przyjecia)';
end $$;

reset role;

-- Zapis odrzucony (odrzucenie: booking_rejection.sql) wstawia tu postgres.
insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, rejection_reason,
                             rejection_source, rejected_at)
values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 15,
        '44444444-4444-4444-4444-444444444444', 'rejected', 'Brak koni', 'stable', now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

do $$
begin
  begin
    update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
    where rider_id = '44444444-4444-4444-4444-444444444444' and status = 'rejected';
    raise exception 'FAIL: jezdziec odwolal zapis odrzucony';
  exception when insufficient_privilege then
    raise notice 'PASS: zapis odrzucony jest koncowy (42501)';
  end;
end $$;

reset role;

\echo '=== Usuniecie konta jezdzca usuwa jego przyszle zapisy oczekujace ==='

-- Zofia: przyszly zapis oczekujacy (po przyjeciu u Joanny o 13 - nowy u Joanny o 12).
set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';
insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 12,
        'abababab-abab-abab-abab-abababababab');
reset role;

delete from auth.users where id = 'abababab-abab-abab-abab-abababababab';

do $$
declare
  v int;
begin
  select count(*) into v from public.bookings b
  where b.schedule_day_id = current_setting('app.day')::bigint and b.hour = 12
    and b.instructor_id = current_setting('app.joanna')::bigint;
  if v <> 0 then
    raise exception 'FAIL: po usunieciu konta zostal przyszly zapis oczekujacy (% wierszy)', v;
  end if;
  raise notice 'PASS: usuniecie konta usuwa przyszly zapis oczekujacy';
end $$;

rollback;

\echo '=== Zapis oczekujacy i przyjecie: wszystkie dowody przeszly ==='
