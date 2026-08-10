-- Dane demo dla lokalnego srodowiska (F-01, faza 3).
-- Ladowane automatycznie przez `npx supabase db reset`. NIE trafiaja na zdalny projekt.
--
-- Zawartosc:
--   * dwa osrodki - drugi istnieje po to, zeby bylo czego NIE widziec w tescie izolacji
--   * dwoch jezdzcow - kazdy zapisany w innym osrodku
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
    '{"role":"stable","full_name":"Marek Debowski"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated', 'authenticated', 'osrodek.rzeka@example.com',
    extensions.crypt('sekret123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"role":"stable","full_name":"Ewa Rzecka"}',
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
    'Stadnina Pod Debem', 'Krakow',
    'Kameralna stajnia na obrzezach miasta, jazdy rekreacyjne i nauka od podstaw.'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Stajnia Nad Rzeka', 'Wieliczka',
    'Stajnia z krytą ujezdzalnia, zajecia takze przy zlej pogodzie.'
  );

insert into public.horses (stable_id, name, notes)
select s.id, h.name, h.notes
from public.stables s
join (
  values
    ('Stadnina Pod Debem', 'Bella',   'Spokojna, dobra dla poczatkujacych.'),
    ('Stadnina Pod Debem', 'Kasztan', 'Zywy temperament, dla srednio zaawansowanych.'),
    ('Stadnina Pod Debem', 'Iskra',   'Klacz, pracuje wylacznie w weekendy.'),
    ('Stajnia Nad Rzeka',  'Grom',    'Wysoki wallach, wymaga pewnej reki.'),
    ('Stajnia Nad Rzeka',  'Luna',    'Bardzo lagodna, czesto pod dzieci.')
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
    ('Stadnina Pod Debem', 10::smallint, 16::smallint),
    ('Stajnia Nad Rzeka',   9::smallint, 14::smallint)
) as d(stable_name, open_hour, close_hour) on d.stable_name = s.name;

-- Pod Debem pracuja Bella i Kasztan (Iskra ma wolne - weekendowa).
-- Nad Rzeka pracuje wylacznie Grom.
insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
select sd.id, h.id, h.stable_id
from public.schedule_days sd
join public.horses h on h.stable_id = sd.stable_id
where h.name in ('Bella', 'Kasztan', 'Grom');

-- ---------------------------------------------------------------------------
-- Zapisy
-- ---------------------------------------------------------------------------

-- Anna jezdzi Pod Debem o 11, Piotr Nad Rzeka o 10.
-- Kazdy zapis w innej stadninie - to jest material dla testu izolacji RLS.
insert into public.bookings (schedule_day_id, horse_id, hour, rider_id)
select sd.id, h.id, b.hour, b.rider_id
from (
  values
    ('Stadnina Pod Debem', 'Bella', 11::smallint, '33333333-3333-3333-3333-333333333333'::uuid),
    ('Stajnia Nad Rzeka',  'Grom',  10::smallint, '44444444-4444-4444-4444-444444444444'::uuid)
) as b(stable_name, horse_name, hour, rider_id)
join public.stables s on s.name = b.stable_name
join public.schedule_days sd on sd.stable_id = s.id
join public.horses h on h.stable_id = s.id and h.name = b.horse_name;
