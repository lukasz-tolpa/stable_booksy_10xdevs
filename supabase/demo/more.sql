-- Wiecej danych demo dla Stadniny Pod Dębem - do przeklikania aplikacji lokalnie.
--
-- Ladowanie:  npm run db:demo:more   (po `npx supabase db reset`; najpierw laduje history.sql)
--
-- NIE laduje go seed ani setup e2e. Po zaladowaniu `npm run test:db` i `npm run test:e2e`
-- wymagaja ponownego `npx supabase db reset` (testy licza wiersze seeda i historii).
--
-- Pisze jako postgres z pominieciem save_schedule_day, wiec sama trzyma regule sumy
-- (suma limitow w godzinie <= liczba koni dnia), jednego jezdzca na godzine i jednego
-- jezdzca na konia w godzinie.
--
-- Zawartosc (dni seeda i history.sql zostaja nietkniete: jutro, ostatnie 24 dni, dzien sprzed 30):
--   * 8 nowych jezdzcow (haslo sekret123), jeden bez imienia i nazwiska
--   * konie: Siwy, Fiona, Bursztyn (weekendy) i zdezaktywowany Dukat (tylko dni starsze niz 60)
--   * instruktorzy bez kont: Magdalena Sowa i zdezaktywowany Paweł Kruk (dni starsze niz 60)
--   * grafik bez poniedzialkow od 120 dni wstecz do 21 dni naprzod, razem z dzisiejszym:
--     dni robocze 15-20, weekendy 9-15
--   * zapisy: w przeszlosci ok. 75% miejsc (jazdy), dzis ok. 65%, w przyszlosci coraz mniej;
--     w przyszlosci wiele zapisow jeszcze bez konia (do przydzialu); kilka jazd bez konia
--   * odwolania jezdzcow i osrodka, jazdy bez jezdzca (ADR-0001) w dniach starszych niz 60
--
-- Idempotentne: druga proba konczy sie komunikatem, bez zmian.

do $$
declare
  v_stable bigint;
  v_riders uuid[];
begin
  select id into strict v_stable from public.stables where name = 'Stadnina Pod Dębem';

  if not exists (select 1 from public.schedule_days where stable_id = v_stable and day < current_date) then
    raise exception 'Najpierw zaladuj historie demo: npm run db:demo';
  end if;

  if exists (select 1 from auth.users where email = 'zofia.mazur@example.com') then
    raise notice 'Dodatkowe dane demo sa juz zaladowane - bez zmian.';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- Konta jezdzcow
  -- -------------------------------------------------------------------------

  create temp table demo_new_riders (id uuid, email text, full_name text) on commit drop;
  insert into demo_new_riders values
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', 'zofia.mazur@example.com',       'Zofia Mazur'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', 'kacper.wojcik@example.com',     'Kacper Wójcik'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000003', 'maja.lewandowska@example.com',  'Maja Lewandowska'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000004', 'jan.zielinski@example.com',     'Jan Zieliński'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000005', 'lena.szymanska@example.com',    'Lena Szymańska'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000006', 'michal.kaminski@example.com',   'Michał Kamiński'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000007', 'oliwia.dabrowska@example.com',  'Oliwia Dąbrowska'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-000000000008', 'jezdziec.bez.nazwy@example.com', null);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  select '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated', r.email,
         extensions.crypt('sekret123', extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}',
         case when r.full_name is null then jsonb_build_object('role', 'rider')
              else jsonb_build_object('role', 'rider', 'full_name', r.full_name) end,
         now(), now()
  from demo_new_riders r;

  -- Jak w seed.sql: NULL w tych kolumnach wywala logowanie GoTrue (500).
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

  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, jsonb_build_object('sub', u.id::text, 'email', u.email),
         'email', u.id::text, now(), now(), now()
  from auth.users u
  join demo_new_riders r on r.id = u.id;

  -- Pula jezdzcow: Anna, Piotr i nowi. Wiecej niz miejsc w godzinie (max 7), wiec rotacja
  -- po numerze miejsca daje jednego jezdzca najwyzej raz w godzinie.
  v_riders := array['33333333-3333-3333-3333-333333333333'::uuid, '44444444-4444-4444-4444-444444444444'::uuid]
              || array(select id from demo_new_riders order by id);

  -- -------------------------------------------------------------------------
  -- Konie i instruktorzy
  -- -------------------------------------------------------------------------

  insert into public.horses (stable_id, name, notes, active) values
    (v_stable, 'Siwy',     'Siwy wałach, cierpliwy przy nauce kłusa.', true),
    (v_stable, 'Fiona',    'Młoda klacz, skoczna, dla zaawansowanych.', true),
    (v_stable, 'Bursztyn', 'Kuc, pracuje w weekendy z dziećmi.', true),
    (v_stable, 'Dukat',    'Na emeryturze od dwóch miesięcy.', false);

  insert into public.instructors (stable_id, name, active) values
    (v_stable, 'Magdalena Sowa', true),
    (v_stable, 'Paweł Kruk', false);

  -- -------------------------------------------------------------------------
  -- Grafik
  -- -------------------------------------------------------------------------

  create temp table demo_days (id bigint, day date, weekend boolean, old boolean) on commit drop;

  with ins as (
    insert into public.schedule_days (stable_id, day, open_hour, close_hour)
    select v_stable, d::date,
           case when extract(isodow from d) in (6, 7) then 9 else 15 end,
           case when extract(isodow from d) in (6, 7) then 15 else 20 end
    from generate_series(current_date - 120, current_date + 21, interval '1 day') as d
    where extract(isodow from d) <> 1
      and d::date not between current_date - 24 and current_date - 1
      and d::date not in (current_date - 30, current_date + 1)
    returning id, day
  )
  insert into demo_days
  select id, day, extract(isodow from day) in (6, 7), day < current_date - 60 from ins;

  insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
  select d.id, h.id, v_stable
  from demo_days d
  join public.horses h on h.stable_id = v_stable
  where h.name in ('Bella', 'Kasztan', 'Siwy', 'Fiona')
     or (h.name in ('Iskra', 'Bursztyn') and d.weekend)
     or (h.name = 'Dukat' and d.old);

  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  select d.id, i.id, v_stable
  from demo_days d
  join public.instructors i on i.stable_id = v_stable
  where i.name in ('Joanna Wrona', 'Karol Jasny', 'Magdalena Sowa')
     or (i.name = 'Paweł Kruk' and d.old);

  -- Suma limitow = liczba koni dnia: w tygodniu 2+1+1 (= 4 konie), w weekend 2+2+2 (= 6),
  -- w dniach starszych niz 60 dochodzi Paweł z 1 miejscem i Dukat.
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select d.id, i.id, hr,
         case
           when i.name = 'Paweł Kruk' then 1
           when d.weekend then 2
           when i.name = 'Joanna Wrona' then 2
           else 1
         end
  from demo_days d
  join public.schedule_days sd on sd.id = d.id
  join public.schedule_day_instructors sdi on sdi.schedule_day_id = d.id
  join public.instructors i on i.id = sdi.instructor_id
  cross join lateral generate_series(sd.open_hour, sd.close_hour - 1) as hr;

  -- -------------------------------------------------------------------------
  -- Zapisy
  -- -------------------------------------------------------------------------

  -- Kazde miejsce w godzinie dostaje numer k (1..suma limitow); k-te miejsce bierze k-tego
  -- konia dnia, wiec kon ma najwyzej jednego jezdzca w godzinie. Wynik losowania z hashu daty,
  -- godziny i miejsca - ten sam przy kazdym zaladowaniu w danym dniu.
  create temp table demo_seats on commit drop as
  select s.schedule_day_id, s.instructor_id, s.hour, d.day, d.old,
         row_number() over (partition by s.schedule_day_id, s.hour order by s.instructor_id, g) as k
  from public.schedule_slots s
  join demo_days d on d.id = s.schedule_day_id
  cross join lateral generate_series(1, s.seats) as g;

  create temp table demo_draw on commit drop as
  select st.*,
         abs(hashtext(st.day::text || '/' || st.hour || '/' || st.k)) % 100 as roll,
         abs(hashtext('kon/' || st.day::text || '/' || st.hour || '/' || st.k)) % 100 as horse_roll,
         -- prog wypelnienia: przeszlosc 75, dzis 65, potem od 70 malejaco do ok. 20
         case
           when st.day < current_date then 75
           when st.day = current_date then 65
           else greatest(20, 74 - (st.day - current_date) * 5 / 2)
         end as fill,
         v_riders[1 + ((st.k + st.hour + extract(doy from st.day)::int) % array_length(v_riders, 1))] as rider
  from demo_seats st;

  insert into public.bookings (schedule_day_id, instructor_id, horse_id, hour, rider_id)
  select dr.schedule_day_id,
         dr.instructor_id,
         case
           -- kilka jazd bez konia w przeszlosci (ADR-0002)
           when dr.day < current_date and dr.horse_roll < 3 then null
           -- dalsza przyszlosc: osrodek jeszcze nie przydzielil wiekszosci koni
           when dr.day > current_date + 3 and dr.horse_roll < 60 then null
           else h.horse_id
         end,
         dr.hour,
         case when dr.old and dr.roll % 23 = 0 then null else dr.rider end
  from demo_draw dr
  join (
    select sdh.schedule_day_id, sdh.horse_id,
           row_number() over (partition by sdh.schedule_day_id order by sdh.horse_id) as k
    from public.schedule_day_horses sdh
    join demo_days d on d.id = sdh.schedule_day_id
  ) h on h.schedule_day_id = dr.schedule_day_id and h.k = dr.k
  where dr.roll < dr.fill;

  -- Odwolania na czesci niezajetych miejsc: co trzecie przez osrodek, reszta przez jezdzca.
  insert into public.bookings (schedule_day_id, instructor_id, hour, rider_id, status, cancelled_at, cancelled_by)
  select dr.schedule_day_id,
         dr.instructor_id,
         dr.hour,
         dr.rider,
         'cancelled',
         least(dr.day::timestamptz - interval '20 hours', now()),
         case when dr.roll % 3 = 0 then 'stable' else 'rider' end
  from demo_draw dr
  where dr.roll >= dr.fill and dr.roll % 4 = 0;

  raise notice 'Dodatkowe dane demo zaladowane.';
end
$$;

select count(*) filter (where sd.day < current_date and b.status = 'active') as jazdy_minione,
       count(*) filter (where sd.day >= current_date and b.status = 'active') as zapisy_od_dzis,
       count(*) filter (where b.status = 'cancelled') as odwolania,
       count(*) filter (where b.status = 'active' and b.rider_id is null) as bez_jezdzca,
       count(*) filter (where b.status = 'active' and b.horse_id is null) as bez_konia,
       count(distinct b.rider_id) as jezdzcy,
       min(sd.day) as od,
       max(sd.day) as do
from public.bookings b
join public.schedule_days sd on sd.id = b.schedule_day_id
join public.stables s on s.id = sd.stable_id
where s.name = 'Stadnina Pod Dębem';
