-- Dowod powiadomien o zapisie (#129, spec #122, ADR 0006, GLOSSARY „Powiadomienie”).
--
-- Gwarancje:
--   * powiadomienie powstaje w bazie w tej samej transakcji co zmiana stanu zapisu, niezaleznie od sciezki
--     (zapis z aplikacji, funkcje przyjecia i odrzucenia, automatyczne odrzucenia private.reject_bookings)
--   * osrodek: nowy zapis oczekujacy i odwolanie zapisu aktywnego przez jezdzca - odbiorcy: wlasciciel osrodka
--     oraz instruktor z kontem, gdy slot jest jego (wlasciciel prowadzacy slot - jedno powiadomienie)
--   * jezdziec: przyjecie, odrzucenie z powodem (reczne, „Brak miejsc”, „Ośrodek zmienił grafik”), odwolanie
--     zapisu aktywnego przez osrodek; wycofanie wlasnego zapisu oczekujacego nie tworzy powiadomienia
--   * zapis wstawiony od razu jako aktywny (seed, dane demo) nie tworzy powiadomienia
--   * kazdy widzi tylko swoje powiadomienia (RLS); nikt nie pisze ich wprost (42501)
--   * public.get_my_notifications() oddaje wolajacemu jego powiadomienia ze slotem (dzien, godzina, instruktor,
--     osrodek) i jezdzcem - takze jezdzcem z samym zapisem oczekujacym, ktorego RLS profili osrodkowi nie da
--   * data ostatniego otwarcia strony „Powiadomienia”: jedna na uzytkownika, ustawia ja
--     public.mark_notifications_seen(), kazdy widzi tylko swoja
-- Wygasniecie nie jest zapisywane - wyprowadza je odczyt listy w TS (src/lib/notifications/).
--
-- Seed (jutro, Pod Dębem 10-16, 2 konie pracujace): Joanna Wrona (konto 9999...) 1 miejsce w kazdej godzinie,
-- Anna (aktywny) u Joanny o 11; Karol Jasny bez konta i bez grafiku; wlasciciel Marek Dębowski (1111...) bez
-- grafiku. Wymaga swiezego seeda (`npx supabase db reset`). Calosc w jednej transakcji zakonczonej ROLLBACK.

\set ON_ERROR_STOP on

\echo '=== Powiadomienia: setup (postgres) ==='

begin;

do $$
begin
  if exists (select 1 from public.notifications) then
    raise exception 'FAIL 0: swiezy seed ma powiadomienia (zapisy wstawione jako aktywne nie powiadamiaja)';
  end if;
  raise notice 'PASS: zapisy seeda wstawione jako aktywne nie tworza powiadomien';
end $$;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'abababab-abab-abab-abab-abababababab', 'authenticated',
        'authenticated', 'zofia.nowicjuszka@example.com', '{"role":"rider","full_name":"Zofia Nowicjuszka"}',
        now(), now()),
       ('00000000-0000-0000-0000-000000000000', 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd', 'authenticated',
        'authenticated', 'celina.testowa@example.com', '{"role":"rider","full_name":"Celina Testowa"}',
        now(), now());

do $$
declare
  v_stable bigint;
  v_day bigint;
  v_joanna bigint;
  v_karol bigint;
  v_marek bigint;
begin
  select id into v_stable from public.stables where owner_id = '11111111-1111-1111-1111-111111111111';
  select id into v_day from public.schedule_days where stable_id = v_stable and day = current_date + 1;
  select id into v_joanna from public.instructors where stable_id = v_stable and name = 'Joanna Wrona';
  select id into v_karol from public.instructors where stable_id = v_stable and name = 'Karol Jasny';
  select id into v_marek from public.instructors
  where stable_id = v_stable and account_id = '11111111-1111-1111-1111-111111111111';
  if v_day is null or v_joanna is null or v_karol is null or v_marek is null then
    raise exception 'Brak danych seeda albo seed nieaktualny - uruchom npx supabase db reset';
  end if;

  -- Karol (bez konta) o 14 i wlasciciel Marek o 12 dostaja po slocie z 1 miejscem (suma limitow o 12 i 14:
  -- 2 = 2 konie). Postgres pisze grafik wprost, jak seed.
  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  values (v_day, v_karol, v_stable), (v_day, v_marek, v_stable);
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id)
  values (v_day, v_karol, 14, 1, private.default_place_id(v_stable)),
         (v_day, v_marek, 12, 1, private.default_place_id(v_stable));

  perform set_config('app.day', v_day::text, true);
  perform set_config('app.joanna', v_joanna::text, true);
  perform set_config('app.karol', v_karol::text, true);
  perform set_config('app.marek', v_marek::text, true);
  perform set_config('app.anna_11', (select b.id::text from public.bookings b
                                     where b.schedule_day_id = v_day and b.instructor_id = v_joanna
                                       and b.hour = 11), true);
end $$;

-- Liczba powiadomien odbiorcy o danym rodzaju dla zapisu (postgres - bez RLS).
create function pg_temp.notified(p_recipient uuid, p_kind text, p_booking bigint)
returns int
language sql
as $$
  select count(*)::int from public.notifications n
  where n.recipient_id = p_recipient and n.kind = p_kind and n.booking_id = p_booking;
$$;

create function pg_temp.total() returns int language sql as $$ select count(*)::int from public.notifications $$;

\echo '=== Nowy zapis oczekujacy powiadamia osrodek ==='

-- Zofia czeka u Joanny o 13, u Karola o 14 i u Marka (wlasciciela) o 12.
set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 13,
          'abababab-abab-abab-abab-abababababab')
  returning id
)
select set_config('app.zofia_13', b.id::text, true) as ignored from b \gset
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.karol')::bigint, 14,
          'abababab-abab-abab-abab-abababababab')
  returning id
)
select set_config('app.zofia_14', b.id::text, true) as ignored from b \gset
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.marek')::bigint, 12,
          'abababab-abab-abab-abab-abababababab')
  returning id
)
select set_config('app.zofia_12', b.id::text, true) as ignored from b \gset
reset role;

-- Celina czeka u Joanny o 13 (to samo jedyne miejsce co Zofia).
set local role authenticated;
set local request.jwt.claims = '{"sub":"cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd","role":"authenticated"}';
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 13,
          'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd')
  returning id
)
select set_config('app.celina_13', b.id::text, true) as ignored from b \gset
reset role;

do $$
declare
  v_owner constant uuid := '11111111-1111-1111-1111-111111111111';
  v_joanna constant uuid := '99999999-9999-9999-9999-999999999999';
  v_zofia constant uuid := 'abababab-abab-abab-abab-abababababab';
  v_zofia_13 bigint := current_setting('app.zofia_13')::bigint;
  v_zofia_14 bigint := current_setting('app.zofia_14')::bigint;
  v_zofia_12 bigint := current_setting('app.zofia_12')::bigint;
  v_celina_13 bigint := current_setting('app.celina_13')::bigint;
begin
  if pg_temp.notified(v_owner, 'booking_pending', v_zofia_13) <> 1
     or pg_temp.notified(v_joanna, 'booking_pending', v_zofia_13) <> 1 then
    raise exception 'FAIL 1: zapis oczekujacy na slot Joanny nie powiadomil wlasciciela i Joanny';
  end if;
  raise notice 'PASS: zapis oczekujacy na slot instruktorki z kontem - powiadomienie wlasciciela i instruktorki';

  if pg_temp.notified(v_owner, 'booking_pending', v_zofia_14) <> 1
     or (select count(*) from public.notifications where booking_id = v_zofia_14) <> 1 then
    raise exception 'FAIL 2: zapis na slot instruktora bez konta - oczekiwane jedno powiadomienie wlasciciela';
  end if;
  raise notice 'PASS: slot instruktora bez konta - powiadomiony tylko wlasciciel';

  if (select count(*) from public.notifications where booking_id = v_zofia_12) <> 1
     or pg_temp.notified(v_owner, 'booking_pending', v_zofia_12) <> 1 then
    raise exception 'FAIL 3: slot wlasciciela - oczekiwane dokladnie jedno powiadomienie wlasciciela';
  end if;
  raise notice 'PASS: slot prowadzony przez wlasciciela - jedno powiadomienie';

  if pg_temp.notified(v_owner, 'booking_pending', v_celina_13) <> 1
     or pg_temp.notified(v_joanna, 'booking_pending', v_celina_13) <> 1 then
    raise exception 'FAIL 4: drugi zapis oczekujacy na ten slot nie powiadomil osrodka';
  end if;
  if exists (select 1 from public.notifications where recipient_id = v_zofia)
     or exists (select 1 from public.notifications where recipient_id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FAIL 5: zapis oczekujacy powiadomil jezdzca albo inny osrodek';
  end if;
  raise notice 'PASS: zapis oczekujacy nie powiadamia jezdzca ani innego osrodka';
end $$;

\echo '=== Przyjecie i „Brak miejsc” powiadamiaja jezdzcow ==='

select set_config('app.before_accept', pg_temp.total()::text, true) as ignored \gset

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.accept_booking(current_setting('app.zofia_13')::bigint);
reset role;

do $$
declare
  v_reason text;
begin
  if pg_temp.notified('abababab-abab-abab-abab-abababababab', 'booking_accepted',
                      current_setting('app.zofia_13')::bigint) <> 1 then
    raise exception 'FAIL 6: przyjecie nie powiadomilo jezdzczyni';
  end if;
  raise notice 'PASS: przyjecie - powiadomienie jezdzca';

  select n.reason into v_reason from public.notifications n
  where n.recipient_id = 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd' and n.kind = 'booking_rejected'
    and n.booking_id = current_setting('app.celina_13')::bigint;
  if v_reason is distinct from 'Brak miejsc' then
    raise exception 'FAIL 7: automatyczne odrzucenie „Brak miejsc” bez powiadomienia z powodem (%)', v_reason;
  end if;
  raise notice 'PASS: automatyczne odrzucenie „Brak miejsc” - powiadomienie jezdzca z powodem';
end $$;

do $$
begin
  if pg_temp.total() <> current_setting('app.before_accept')::int + 2 then
    raise exception 'FAIL 8: przyjecie utworzylo inne powiadomienia niz przyjecie i „Brak miejsc” (% zamiast %)',
      pg_temp.total(), current_setting('app.before_accept')::int + 2;
  end if;
  raise notice 'PASS: przyjecie nie powiadamia osrodka';
end $$;

\echo '=== Odrzucenie reczne i zmiana grafiku powiadamiaja jezdzca z powodem ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select public.reject_booking(current_setting('app.zofia_14')::bigint, '  Karol tego dnia choruje  ');
reset role;

-- Celina czeka u Joanny o 15; slot znika z grafiku (#127 woła private.reject_bookings ze zrodlem schedule_change).
set local role authenticated;
set local request.jwt.claims = '{"sub":"cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd","role":"authenticated"}';
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 15,
          'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd')
  returning id
)
select set_config('app.celina_15', b.id::text, true) as ignored from b \gset
reset role;

select private.reject_bookings(array[current_setting('app.celina_15')::bigint], 'schedule_change');

do $$
declare
  v_reason text;
begin
  select n.reason into v_reason from public.notifications n
  where n.recipient_id = 'abababab-abab-abab-abab-abababababab' and n.kind = 'booking_rejected'
    and n.booking_id = current_setting('app.zofia_14')::bigint;
  if v_reason is distinct from 'Karol tego dnia choruje' then
    raise exception 'FAIL 9: odrzucenie reczne bez powiadomienia z przycietym powodem (%)', v_reason;
  end if;
  raise notice 'PASS: odrzucenie przez osrodek - powiadomienie jezdzca z powodem';

  select n.reason into v_reason from public.notifications n
  where n.recipient_id = 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd' and n.kind = 'booking_rejected'
    and n.booking_id = current_setting('app.celina_15')::bigint;
  if v_reason is distinct from 'Ośrodek zmienił grafik' then
    raise exception 'FAIL 10: odrzucenie przy zmianie grafiku bez powiadomienia z powodem (%)', v_reason;
  end if;
  raise notice 'PASS: odrzucenie „Ośrodek zmienił grafik” - powiadomienie jezdzca z powodem';
end $$;

\echo '=== Wycofanie zapisu oczekujacego nie powiadamia nikogo ==='

-- Celina czeka u Joanny o 10 i wycofuje zapis.
set local role authenticated;
set local request.jwt.claims = '{"sub":"cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd","role":"authenticated"}';
with b as (
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id)
  values (current_setting('app.day')::bigint, current_setting('app.joanna')::bigint, 10,
          'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd')
  returning id
)
select set_config('app.celina_10', b.id::text, true) as ignored from b \gset
reset role;

select set_config('app.before_withdrawal', pg_temp.total()::text, true) as ignored \gset

set local role authenticated;
set local request.jwt.claims = '{"sub":"cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd","role":"authenticated"}';
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
where id = current_setting('app.celina_10')::bigint;
reset role;

do $$
begin
  if (select status from public.bookings where id = current_setting('app.celina_10')::bigint) <> 'cancelled' then
    raise exception 'FAIL 11: jezdziec nie wycofal zapisu oczekujacego';
  end if;
  if pg_temp.total() <> current_setting('app.before_withdrawal')::int then
    raise exception 'FAIL 12: wycofanie zapisu oczekujacego utworzylo powiadomienie';
  end if;
  raise notice 'PASS: wycofanie zapisu oczekujacego przez jezdzca nie tworzy powiadomienia';
end $$;

\echo '=== Odwolanie zapisu aktywnego ==='

-- Zofia odwoluje przyjety zapis u Joanny o 13.
set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'rider'
where id = current_setting('app.zofia_13')::bigint;
reset role;

select set_config('app.before_stable_cancel', pg_temp.total()::text, true) as ignored \gset

-- Wlasciciel odwoluje aktywny zapis Anny u Joanny o 11.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'stable'
where id = current_setting('app.anna_11')::bigint;
reset role;

do $$
declare
  v_zofia_13 bigint := current_setting('app.zofia_13')::bigint;
  v_anna_11 bigint := current_setting('app.anna_11')::bigint;
begin
  if pg_temp.notified('11111111-1111-1111-1111-111111111111', 'booking_cancelled_by_rider', v_zofia_13) <> 1
     or pg_temp.notified('99999999-9999-9999-9999-999999999999', 'booking_cancelled_by_rider', v_zofia_13) <> 1 then
    raise exception 'FAIL 13: odwolanie zapisu aktywnego przez jezdzca nie powiadomilo wlasciciela i instruktorki';
  end if;
  if exists (select 1 from public.notifications
             where booking_id = v_zofia_13 and recipient_id = 'abababab-abab-abab-abab-abababababab'
               and kind <> 'booking_accepted') then
    raise exception 'FAIL 14: odwolanie przez jezdzca powiadomilo jego samego';
  end if;
  raise notice 'PASS: odwolanie zapisu aktywnego przez jezdzca - powiadomienie wlasciciela i instruktorki';

  if pg_temp.notified('33333333-3333-3333-3333-333333333333', 'booking_cancelled_by_stable', v_anna_11) <> 1 then
    raise exception 'FAIL 15: odwolanie zapisu aktywnego przez osrodek nie powiadomilo jezdzczyni';
  end if;
  if pg_temp.total() <> current_setting('app.before_stable_cancel')::int + 1 then
    raise exception 'FAIL 16: odwolanie przez osrodek powiadomilo kogos poza jezdzcem';
  end if;
  raise notice 'PASS: odwolanie zapisu aktywnego przez osrodek - powiadomienie tylko jezdzca';
end $$;

\echo '=== Kazdy widzi tylko swoje powiadomienia (RLS) ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';

do $$
declare
  v_total int;
  v_foreign int;
begin
  select count(*), count(*) filter (where recipient_id <> 'abababab-abab-abab-abab-abababababab')
  into v_total, v_foreign
  from public.notifications;
  -- Zofia: przyjecie (13) i odrzucenie (14).
  if v_total <> 2 or v_foreign <> 0 then
    raise exception 'FAIL 17: jezdziec widzi % powiadomien, cudzych %', v_total, v_foreign;
  end if;
  raise notice 'PASS: jezdziec widzi tylko swoje powiadomienia';

  begin
    insert into public.notifications (recipient_id, kind, booking_id)
    values ('abababab-abab-abab-abab-abababababab', 'booking_accepted', current_setting('app.zofia_12')::bigint);
    raise exception 'FAIL 18: jezdziec wstawil sobie powiadomienie';
  exception when insufficient_privilege then
    raise notice 'PASS: nikt nie wstawia powiadomien wprost (42501)';
  end;
  begin
    delete from public.notifications;
    raise exception 'FAIL 19: jezdziec usunal powiadomienia';
  exception when insufficient_privilege then
    raise notice 'PASS: nikt nie usuwa powiadomien wprost (42501)';
  end;
end $$;

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

do $$
declare
  v_total int;
  v_foreign int;
begin
  select count(*), count(*) filter (where recipient_id <> '99999999-9999-9999-9999-999999999999')
  into v_total, v_foreign
  from public.notifications;
  -- Joanna: zapisy oczekujace Zofii i Celiny o 13, Celiny o 15 i o 10, odwolanie Zofii o 13.
  if v_total <> 5 or v_foreign <> 0 then
    raise exception 'FAIL 20: instruktorka widzi % powiadomien, cudzych %', v_total, v_foreign;
  end if;
  raise notice 'PASS: instruktor z kontem widzi tylko swoje powiadomienia';
end $$;

reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from public.notifications;
    raise exception 'FAIL 21: anonim czyta powiadomienia';
  exception when insufficient_privilege then
    raise notice 'PASS: anonim nie czyta powiadomien (42501)';
  end;
end $$;
reset role;

\echo '=== Lista powiadomien wolajacego (public.get_my_notifications) ==='

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count from public.get_my_notifications();
  -- Wlasciciel: zapisy oczekujace Zofii (13, 14, 12), Celiny (13, 15, 10), odwolanie Zofii o 13.
  if v_count <> 7 then
    raise exception 'FAIL 22: wlasciciel dostal % powiadomien zamiast 7', v_count;
  end if;

  select * into r from public.get_my_notifications() n
  where n.booking_id = current_setting('app.zofia_14')::bigint;
  if r.kind <> 'booking_pending' or r.rider_name is distinct from 'Zofia Nowicjuszka'
     or r.instructor_name <> 'Karol Jasny' or r.stable_name <> 'Stadnina Pod Dębem'
     or r.day <> current_date + 1 or r.hour <> 14 or r.reason is not null then
    raise exception 'FAIL 23: powiadomienie wlasciciela bez slotu albo jezdzca: %', row_to_json(r);
  end if;
  raise notice 'PASS: wlasciciel dostaje swoje powiadomienia ze slotem i jezdzcem z samym zapisem oczekujacym';
end $$;

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"abababab-abab-abab-abab-abababababab","role":"authenticated"}';

do $$
declare
  r record;
  v_count int;
begin
  select count(*) into v_count from public.get_my_notifications();
  if v_count <> 2 then
    raise exception 'FAIL 24: jezdziec dostal % powiadomien zamiast 2', v_count;
  end if;

  select * into r from public.get_my_notifications() n where n.kind = 'booking_rejected';
  if r.booking_id <> current_setting('app.zofia_14')::bigint or r.reason <> 'Karol tego dnia choruje'
     or r.instructor_name <> 'Karol Jasny' or r.stable_name <> 'Stadnina Pod Dębem' or r.hour <> 14 then
    raise exception 'FAIL 25: powiadomienie o odrzuceniu bez slotu albo powodu: %', row_to_json(r);
  end if;
  raise notice 'PASS: jezdziec dostaje swoje powiadomienia ze slotem i powodem';
end $$;

\echo '=== Data ostatniego otwarcia strony „Powiadomienia” ==='

do $$
declare
  v_seen timestamptz;
begin
  if exists (select 1 from public.notification_views) then
    raise exception 'FAIL 26: data otwarcia istnieje przed pierwszym otwarciem';
  end if;

  v_seen := public.mark_notifications_seen();
  if v_seen is distinct from now()
     or (select seen_at from public.notification_views
         where profile_id = 'abababab-abab-abab-abab-abababababab') is distinct from now() then
    raise exception 'FAIL 27: otwarcie strony nie ustawilo daty na teraz (%)', v_seen;
  end if;
  -- Drugie otwarcie nadpisuje te sama date (jedna na uzytkownika).
  perform public.mark_notifications_seen();
  if (select count(*) from public.notification_views) <> 1 then
    raise exception 'FAIL 28: wiecej niz jedna data otwarcia uzytkownika';
  end if;
  raise notice 'PASS: otwarcie strony ustawia jedna date ostatniego otwarcia na teraz';

  begin
    update public.notification_views set seen_at = now() - interval '1 year';
    raise exception 'FAIL 29: uzytkownik zmienil date otwarcia wprost';
  exception when insufficient_privilege then
    raise notice 'PASS: daty otwarcia nie zmienia sie wprost (42501)';
  end;
end $$;

reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd","role":"authenticated"}';

do $$
begin
  if exists (select 1 from public.notification_views) then
    raise exception 'FAIL 30: uzytkownik widzi cudza date otwarcia';
  end if;
  raise notice 'PASS: kazdy widzi tylko swoja date otwarcia';
end $$;

reset role;

rollback;

\echo '=== Powiadomienia: koniec (ROLLBACK) ==='
