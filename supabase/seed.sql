-- Dane demo dla lokalnego srodowiska (F-01, faza 3).
-- Ladowane automatycznie przez `npx supabase db reset`. NIE trafiaja na zdalny projekt.
--
-- Zawartosc:
--   * dwa osrodki - drugi istnieje po to, zeby bylo czego NIE widziec w tescie izolacji;
--     wlasciciel kazdego to konto `instructor` powiazane z instruktorem swojego osrodka
--     (Marek Dębowski, Ewa Rzecka - ADR-0004), bez miejsc w grafiku
--   * instruktorka z kontem, ktora nie jest wlascicielka: Joanna Wrona w Stadninie Pod Dębem
--     (konto `instructor` 9999..., #72) - widzi wylacznie swoje sloty („Moje sloty”)
--   * dwoch jezdzcow - kazdy zapisany w innym osrodku
--   * pensjonariuszka Katarzyna Zając (12121212...) bez zapisu, z koniem pensjonatowym Hrabia Pod Dębem
--     (blok #114 na koncu pliku)
--   * pojutrze Pod Dębem: slot treningowy Marka Dębowskiego o 10 na Dużym placu, bez zapisow
--     (blok #115 na koncu pliku)
--   * grafik na jutro w obu stadninach + po jednym aktywnym zapisie
--
-- Haslo wszystkich kont: sekret123
--
-- Profile powstaja triggerem public.handle_new_user() - tutaj wstawiamy wylacznie auth.users.
-- Wiersze auth.identities sa wymagane, zeby logowanie e-mail + haslo dzialalo.

-- ---------------------------------------------------------------------------
-- Konta
-- ---------------------------------------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated', 'authenticated', 'osrodek.debem@example.com',
    extensions.crypt('sekret123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"instructor","full_name":"Marek Dębowski"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'osrodek.rzeka@example.com',
    extensions.crypt('sekret123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"instructor","full_name":"Ewa Rzecka"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-3333-3333-333333333333',
    'authenticated', 'authenticated', 'anna.kowalska@example.com',
    extensions.crypt('sekret123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"rider","full_name":"Anna Kowalska"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44444444-4444-4444-4444-444444444444',
    'authenticated', 'authenticated', 'piotr.nowak@example.com',
    extensions.crypt('sekret123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"rider","full_name":"Piotr Nowak"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '99999999-9999-9999-9999-999999999999',
    'authenticated', 'authenticated', 'joanna.wrona@example.com',
    extensions.crypt('sekret123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"instructor","full_name":"Joanna Wrona"}',
    now(), now()
  );

-- GoTrue wczytuje ponizsze kolumny do niepustych stringow Go. Zostawione jako NULL
-- wywalaja logowanie bledem 500 "Database error querying schema" - konta wygladaja
-- na poprawne w bazie, a nikt sie nie zaloguje. Musza byc pustymi stringami.
update auth.users
   set confirmation_token         = '',
       recovery_token             = '',
       email_change               = '',
       email_change_token_new     = '',
       email_change_token_current = '',
       phone_change               = '',
       phone_change_token         = '',
       reauthentication_token     = ''
 where confirmation_token is null;

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  now(), now(), now()
from auth.users u;

-- ---------------------------------------------------------------------------
-- Stadniny i konie
-- ---------------------------------------------------------------------------

insert into public.stables (owner_id, name, city, description)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Stadnina Pod Dębem', 'Kraków',
    'Kameralna stajnia na obrzeżach miasta, jazdy rekreacyjne i nauka od podstaw.'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Stajnia Nad Rzeką', 'Wieliczka',
    'Stajnia z krytą ujeżdżalnią, zajęcia także przy złej pogodzie.'
  );

insert into public.horses (stable_id, name, notes)
select s.id, h.name, h.notes
from public.stables s
join (
  values
    ('Stadnina Pod Dębem', 'Bella',   'Spokojna, dobra dla początkujących.'),
    ('Stadnina Pod Dębem', 'Kasztan', 'Żywy temperament, dla średnio zaawansowanych.'),
    ('Stadnina Pod Dębem', 'Iskra',   'Klacz, pracuje wyłącznie w weekendy.'),
    ('Stajnia Nad Rzeką',  'Grom',    'Wysoki wałach, wymaga pewnej ręki.'),
    ('Stajnia Nad Rzeką',  'Luna',    'Bardzo łagodna, często pod dzieci.')
) as h(stable_name, name, notes) on h.stable_name = s.name;

-- ---------------------------------------------------------------------------
-- Grafik na jutro
-- ---------------------------------------------------------------------------

-- Data liczona wzgledem current_date, zeby seed nie starzal sie z dnia na dzien.
insert into public.schedule_days (stable_id, day, open_hour, close_hour)
select s.id, current_date + 1, d.open_hour, d.close_hour
from public.stables s
join (
  values
    ('Stadnina Pod Dębem', 10::smallint, 16::smallint),
    ('Stajnia Nad Rzeką',   9::smallint, 14::smallint)
) as d(stable_name, open_hour, close_hour) on d.stable_name = s.name;

-- Pod Dębem pracuja Bella i Kasztan (Iskra ma wolne - weekendowa).
-- Nad Rzeką pracuje wylacznie Grom.
insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
select sd.id, h.id, h.stable_id
from public.schedule_days sd
join public.horses h on h.stable_id = sd.stable_id
where h.name in ('Bella', 'Kasztan', 'Grom');

-- ---------------------------------------------------------------------------
-- Instruktorzy i limity miejsc na jutro (#40, #41)
-- ---------------------------------------------------------------------------

-- Seed pisze jako postgres, wiec omija save_schedule_day - limity musza wiec same spelniac
-- regule sumy (suma limitow w godzinie <= liczba koni dnia): Pod Dębem 2 konie, Nad Rzeką 1.
insert into public.instructors (stable_id, name)
select s.id, i.name
from public.stables s
join (
  values
    ('Stadnina Pod Dębem', 'Joanna Wrona'),
    ('Stadnina Pod Dębem', 'Karol Jasny'),
    ('Stajnia Nad Rzeką',  'Tomasz Lis')
) as i(stable_name, name) on i.stable_name = s.name;

-- Wlasciciele jako instruktorzy swoich osrodkow (tak jak tworzy ich public.create_stable).
-- Nie pracuja jutro - nie prowadza jazd.
insert into public.instructors (stable_id, name, account_id)
select s.id, p.full_name, p.id
from public.stables s
join public.profiles p on p.id = s.owner_id;

-- Joanna Wrona ma konto (jak po przyjeciu zaproszenia, #74) - instruktorka bez uprawnien
-- wlasciciela, widzi swoje sloty z zapisanymi (#72). Karol i Tomasz zostaja bez kont.
update public.instructors i
   set account_id = '99999999-9999-9999-9999-999999999999'
  from public.stables s
 where s.id = i.stable_id and s.name = 'Stadnina Pod Dębem' and i.name = 'Joanna Wrona';

-- Karol nie pracuje jutro - scenariusz e2e dodaje go w formularzu grafiku (miejsce o 13),
-- a testy bazy dokladaja go jako postgres. Drugi kon Pod Dębem zostawia na to miejsce w sumie.
insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
select sd.id, i.id, i.stable_id
from public.schedule_days sd
join public.instructors i on i.stable_id = sd.stable_id
where i.name in ('Joanna Wrona', 'Tomasz Lis');

-- Pelna siatka godzin dnia, jak tworzy ja save_schedule_day: Joanna i Tomasz po 1 miejscu.
insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
select sdi.schedule_day_id, sdi.instructor_id, h, 1
from public.schedule_day_instructors sdi
join public.schedule_days sd on sd.id = sdi.schedule_day_id
cross join lateral generate_series(sd.open_hour, sd.close_hour - 1) h;

-- ---------------------------------------------------------------------------
-- Zapisy
-- ---------------------------------------------------------------------------

-- Anna jezdzi Pod Dębem u Joanny o 11, Piotr Nad Rzeką u Tomasza o 10 - oba bez konia
-- (przydzial konia nalezy do osrodka). Kazdy zapis w innej stadninie - material dla testu
-- izolacji RLS. Zarezerwowane sloty testow: Karol@13 (petla jezdzca e2e), Joanna@14
-- (odmowa e2e), Joanna@12 (skrypt wspolbieznosci test:db).
insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status)
select sd.id, i.id, b.hour, b.rider_id, 'active'
from (
  values
    ('Stadnina Pod Dębem', 'Joanna Wrona', 11::smallint, '33333333-3333-3333-3333-333333333333'::uuid),
    ('Stajnia Nad Rzeką',  'Tomasz Lis',   10::smallint, '44444444-4444-4444-4444-444444444444'::uuid)
) as b(stable_name, instructor_name, hour, rider_id)
join public.stables s on s.name = b.stable_name
join public.schedule_days sd on sd.stable_id = s.id
join public.instructors i on i.stable_id = s.id and i.name = b.instructor_name;

-- ---------------------------------------------------------------------------
-- #113 Place (spec #112). Kazdy osrodek dostal przy zalozeniu plac "Plac" (wyzwalacz
-- stables_default_place), a sloty bez placu trafily na niego. Pod Dębem ma dwa place:
-- "Hala" (dawny "Plac", jutrzejsze sloty Joanny) i "Duży plac"; Nad Rzeką zostaje z jednym.
-- ---------------------------------------------------------------------------

update public.places p
   set name = 'Hala'
  from public.stables s
 where s.id = p.stable_id and s.name = 'Stadnina Pod Dębem' and p.name = 'Plac';

insert into public.places (stable_id, name)
select s.id, 'Duży plac' from public.stables s where s.name = 'Stadnina Pod Dębem';

-- ---------------------------------------------------------------------------
-- #114 Pensjonariusz z koniem pensjonatowym (spec #112, GLOSSARY „Pensjonariusz”)
-- ---------------------------------------------------------------------------

-- Katarzyna Zając (12121212..., haslo sekret123) - konto jezdzca bez zadnego zapisu; jej kon
-- pensjonatowy Hrabia stoi w Stadninie Pod Dębem od 90 dni (pobyt trwa). Hrabia nie jest koniem
-- pracujacym (SB046), wiec nie zmienia reguly sumy limitow. Blok wlasny, na koncu pliku - konta wyzej
-- dostaly juz tokeny i tozsamosci, wiec ten robi to samo tylko dla swojego konta.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
)
values (
  '00000000-0000-0000-0000-000000000000',
  '12121212-1212-1212-1212-121212121212',
  'authenticated', 'authenticated', 'katarzyna.zajac@example.com',
  extensions.crypt('sekret123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  '{"role":"rider","full_name":"Katarzyna Zając"}',
  now(), now(),
  '', '', '', '', '', '', '', ''
);

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
)
values (
  gen_random_uuid(),
  '12121212-1212-1212-1212-121212121212',
  jsonb_build_object('sub', '12121212-1212-1212-1212-121212121212', 'email', 'katarzyna.zajac@example.com'),
  'email',
  '12121212-1212-1212-1212-121212121212',
  now(), now(), now()
);

with horse as (
  insert into public.horses (stable_id, name, notes, kind)
  select s.id, 'Hrabia', 'Koń pensjonatowy Katarzyny Zając.', 'boarding'
  from public.stables s
  where s.name = 'Stadnina Pod Dębem'
  returning id, stable_id
), owner as (
  insert into public.horse_owners (horse_id, stable_id, rider_id)
  select id, stable_id, '12121212-1212-1212-1212-121212121212' from horse
  returning horse_id, stable_id
)
insert into public.horse_stays (horse_id, stable_id, arrival_day)
select horse_id, stable_id, current_date - 90 from owner;

-- ---------------------------------------------------------------------------
-- #115 Slot treningowy (spec #112, GLOSSARY „Slot treningowy”)
-- ---------------------------------------------------------------------------

-- Pojutrze Pod Dębem: wlasciciel Marek Dębowski prowadzi o 10 slot treningowy (2 miejsca) na Dużym placu;
-- o 11 nie prowadzi jazdy. Dzien ma same sloty treningowe, wiec jezdziec rekreacyjny go nie widzi, a
-- pensjonariuszka Katarzyna widzi i zapisuje sie na Hrabi. Bez koni dnia - slot treningowy nie liczy sie do
-- sumy limitow (SB007). Bez zapisow: boarding_horses.sql zaklada, ze Katarzyna nie ma zadnego zapisu.
-- created_at o minute wczesniej - szkic grafiku (ostatnio ulozony dzien) zostaje jutrzejszym dniem.
insert into public.schedule_days (stable_id, day, open_hour, close_hour, created_at)
select s.id, current_date + 2, 10, 12, now() - interval '1 minute'
from public.stables s
where s.name = 'Stadnina Pod Dębem';

insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
select sd.id, i.id, i.stable_id
from public.schedule_days sd
join public.stables s on s.id = sd.stable_id
join public.instructors i on i.stable_id = s.id and i.account_id = s.owner_id
where s.name = 'Stadnina Pod Dębem' and sd.day = current_date + 2;

insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id, kind)
select sdi.schedule_day_id, sdi.instructor_id, v.hour, v.seats, p.id, 'training'
from public.schedule_day_instructors sdi
join public.schedule_days sd on sd.id = sdi.schedule_day_id
join public.places p on p.stable_id = sd.stable_id and p.name = 'Duży plac'
cross join (values (10::smallint, 2::smallint), (11::smallint, 0::smallint)) as v(hour, seats)
where sd.day = current_date + 2;
