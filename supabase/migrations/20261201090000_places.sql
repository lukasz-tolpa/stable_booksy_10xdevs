-- Place osrodka i plac przy slocie (#113, spec #112, ADR-0005, GLOSSARY "Plac", "Slot").
--
-- Plac to nazwane miejsce jazd w osrodku (hala, duzy plac, lonzownik). Kazdy slot odbywa sie
-- na jednym placu; plac ustawia osrodek przy ukladaniu grafiku dnia.
--
-- Gwarancje w bazie:
--   * public.places: nazwa unikalna w osrodku bez wzgledu na wielkosc liter i spacje na brzegach,
--     takze wsrod nieaktywnych (`places_stable_name_key`, 23505), 1-60 znakow; zmienia sie tylko
--     nazwa i aktywnosc (grant kolumnowy), placu sie nie usuwa (DELETE odebrany, 42501).
--     Zaklada, zmienia i dezaktywuje wlasciciel (private.owned_stable_id()); czytaja jezdzcy
--     (katalog, dzien osrodka) i konta osrodka (private.current_stable_id()) - inne osrodki nie.
--   * osrodek ma zawsze co najmniej jeden aktywny plac: dezaktywacji ostatniego odmawia wyzwalacz
--     `places_keep_one_active` (SB033, takze dla postgres), a nowy osrodek dostaje plac "Plac"
--     od razu przy zalozeniu (wyzwalacz `stables_default_place`, takze INSERT z seeda).
--   * schedule_slots.place_id NOT NULL. Istniejace osrodki dostaja po jednym placu "Plac"
--     i wszystkie ich sloty trafiaja na niego. Wiersz slotu bez placu (INSERT postgresa: seed,
--     historia demo, testy) dostaje pierwszy aktywny plac osrodka; plac spoza osrodka slotu
--     odrzuca wyzwalacz `schedule_slots_place` (SB030).
--   * public.save_schedule_day przyjmuje plac w kazdym wpisie p_seats ({instructor_id, hour,
--     seats, place_id}); brak place_id = plac, na ktorym slot juz jest, a nowy slot - pierwszy
--     aktywny plac osrodka. Odmowy:
--       SB030 plac spoza osrodka,
--       SB031 nieaktywny plac w dniu, ktory jeszcze go nie uzywa (zostaje w dniach juz ulozonych),
--       SB032 zmiana placu slotu z aktywnymi zapisami (DETAIL {"hour", "bookings"}).
--
-- Kody SB030-SB033 (#113); nastepny wolny: SB034.
-- Dowod: supabase/tests/places.sql.

-- ---------------------------------------------------------------------------
-- 1. Katalog placow
-- ---------------------------------------------------------------------------

create table public.places (
  id bigint generated always as identity primary key,
  stable_id bigint not null references public.stables (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint places_name_length check (length(btrim(name)) between 1 and 60)
);

comment on table public.places is
  'Plac osrodka - nazwane miejsce jazd (GLOSSARY "Plac"). Nazwa unikalna w osrodku; dezaktywowany, nigdy usuwany; osrodek ma zawsze co najmniej jeden aktywny.';

-- Nazwa indeksu jest kontraktem z aplikacja (src/lib/places/errors.ts).
create unique index places_stable_name_key on public.places (stable_id, lower(btrim(name)));

alter table public.places enable row level security;

revoke update, delete, truncate on public.places from anon, authenticated;
grant update (name, active) on public.places to authenticated;

create policy places_select_authenticated
  on public.places
  for select
  to authenticated
  using (
    coalesce((select private.current_role()) = 'rider', false)
    or stable_id = (select private.current_stable_id())
  );

create policy places_insert_own_stable
  on public.places
  for insert
  to authenticated
  with check (stable_id = (select private.owned_stable_id()));

create policy places_update_own_stable
  on public.places
  for update
  to authenticated
  using (stable_id = (select private.owned_stable_id()))
  with check (stable_id = (select private.owned_stable_id()));

-- Ostatni aktywny plac zostaje aktywny - inaczej osrodek nie ulozylby zadnego nowego dnia.
create or replace function private.places_keep_one_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active and not new.active and not exists (
    select 1 from public.places p
    where p.stable_id = new.stable_id and p.active and p.id <> new.id
  ) then
    raise exception 'Osrodek musi miec co najmniej jeden aktywny plac' using errcode = 'SB033';
  end if;
  return new;
end;
$$;

create trigger places_keep_one_active
  before update of active on public.places
  for each row execute function private.places_keep_one_active();

-- Pierwszy aktywny plac osrodka (najstarszy), a gdy zadnego nie ma - najstarszy w ogole.
create or replace function private.default_place_id(p_stable_id bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
  from public.places p
  where p.stable_id = p_stable_id
  order by p.active desc, p.id
  limit 1;
$$;

comment on function private.default_place_id(bigint) is
  'Plac, na ktory trafia slot bez wskazanego placu: najstarszy aktywny plac osrodka (dla osrodka z jednym placem - ten plac).';

revoke execute on function private.default_place_id(bigint) from public, anon, authenticated;

-- Nowy osrodek od razu ma plac - grafik ukladany bez wybierania placu dziala jak dotad.
create or replace function private.stables_default_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.places (stable_id, name) values (new.id, 'Plac');
  return new;
end;
$$;

create trigger stables_default_place
  after insert on public.stables
  for each row execute function private.stables_default_place();

insert into public.places (stable_id, name)
select s.id, 'Plac' from public.stables s;

-- ---------------------------------------------------------------------------
-- 2. Plac przy slocie
-- ---------------------------------------------------------------------------

alter table public.schedule_slots add column place_id bigint references public.places (id);

comment on column public.schedule_slots.place_id is
  'Plac, na ktorym odbywa sie slot (#113). Ustawia save_schedule_day; INSERT bez placu dostaje private.default_place_id osrodka.';

update public.schedule_slots s
   set place_id = private.default_place_id(sd.stable_id)
  from public.schedule_days sd
 where sd.id = s.schedule_day_id;

alter table public.schedule_slots alter column place_id set not null;

create index schedule_slots_place_id_idx on public.schedule_slots (place_id);

create or replace function private.schedule_slots_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stable bigint;
begin
  select sd.stable_id into v_stable from public.schedule_days sd where sd.id = new.schedule_day_id;

  if new.place_id is null then
    new.place_id := private.default_place_id(v_stable);
  elsif not exists (select 1 from public.places p where p.id = new.place_id and p.stable_id = v_stable) then
    raise exception 'Plac spoza osrodka' using errcode = 'SB030';
  end if;

  return new;
end;
$$;

create trigger schedule_slots_place
  before insert or update of place_id on public.schedule_slots
  for each row execute function private.schedule_slots_place();

-- ---------------------------------------------------------------------------
-- 3. save_schedule_day - cialo z 20261122090000 plus plac slotu
-- ---------------------------------------------------------------------------

create or replace function public.save_schedule_day(
  p_day date,
  p_open_hour int,
  p_close_hour int,
  p_horse_ids bigint[],
  p_instructor_ids bigint[],
  p_seats jsonb default '[]'::jsonb
)
returns bigint
language plpgsql
-- SECURITY DEFINER celowo: bezposredni zapis do tabel grafiku jest odebrany, a funkcja
-- musi widziec wszystkie zapisy dnia. Stadnine bierze z sesji (private.schedule_stable_id),
-- nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.schedule_stable_id();
  v_horses bigint[] := array(select distinct x from unnest(coalesce(p_horse_ids, '{}')) x);
  v_instructors bigint[] := array(select distinct x from unnest(coalesce(p_instructor_ids, '{}')) x);
  v_seats jsonb := coalesce(p_seats, '[]'::jsonb);
  v_day_id bigint;
  v_default_place bigint;
  v_grid jsonb;
  v_horse_count int;
  v_hour int;
  v_sum int;
  v_count int;
begin
  if v_stable is null then
    raise exception 'Grafik dnia zapisuje wlasciciel osrodka albo instruktor z uprawnieniem do ukladania grafiku'
      using errcode = '42501';
  end if;

  if p_day < (now() at time zone 'Europe/Warsaw')::date then
    raise exception 'Nie mozna ukladac grafiku na dzien miniony %', p_day
      using errcode = 'SB008';
  end if;

  if exists (
    select 1 from unnest(v_horses) h(id)
    where not exists (select 1 from public.horses where id = h.id and stable_id = v_stable)
  ) then
    raise exception 'Kon spoza stadniny' using errcode = 'SB003';
  end if;

  if exists (
    select 1 from unnest(v_instructors) i(id)
    where not exists (select 1 from public.instructors where id = i.id and stable_id = v_stable)
  ) then
    raise exception 'Instruktor spoza stadniny' using errcode = 'SB005';
  end if;

  if jsonb_typeof(v_seats) <> 'array' or exists (
    select 1
    from jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int)
    where s.instructor_id is null or s.hour is null or s.seats is null or s.seats < 0
       or not (s.instructor_id = any (v_instructors))
       or s.hour < p_open_hour or s.hour >= p_close_hour
  ) or exists (
    select 1
    from jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int)
    group by s.instructor_id, s.hour
    having count(*) > 1
  ) then
    raise exception 'Niespojne limity miejsc: godzina poza zakresem dnia, instruktor spoza dnia albo duplikat'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_seats) as s(place_id bigint)
    where s.place_id is not null
      and not exists (select 1 from public.places p where p.id = s.place_id and p.stable_id = v_stable)
  ) then
    raise exception 'Plac spoza osrodka' using errcode = 'SB030';
  end if;

  -- Blokada wiersza dnia serializuje rownolegle zapisy grafiku tego dnia, a takze zapisy
  -- jezdzcow (ich wyzwalacz bierze FOR SHARE na tym wierszu).
  select id into v_day_id
  from public.schedule_days
  where stable_id = v_stable and day = p_day
  for update;

  if exists (
    select 1
    from public.instructors i
    where i.id = any (v_instructors)
      and not i.active
      and not exists (
        select 1 from public.schedule_day_instructors sdi
        where sdi.schedule_day_id = v_day_id and sdi.instructor_id = i.id
      )
  ) then
    raise exception 'Nieaktywnego instruktora nie mozna dodac do dnia' using errcode = 'SB006';
  end if;

  -- Pelna siatka instruktor x godzina ze stanem koncowym: limit (brak = 0) i plac (brak = plac,
  -- na ktorym slot juz jest, a nowy slot - pierwszy aktywny plac osrodka).
  v_default_place := private.default_place_id(v_stable);

  select coalesce(jsonb_agg(jsonb_build_object(
           'instructor_id', i,
           'hour', h,
           'seats', coalesce(s.seats, 0),
           'place_id', coalesce(s.place_id, cur.place_id, v_default_place)
         )), '[]'::jsonb)
    into v_grid
  from unnest(v_instructors) i
  cross join generate_series(p_open_hour, p_close_hour - 1) h
  left join jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int, place_id bigint)
    on s.instructor_id = i and s.hour = h
  left join public.schedule_slots cur
    on cur.schedule_day_id = v_day_id and cur.instructor_id = i and cur.hour = h;

  -- Nieaktywny plac zostaje w dniu, ktory juz go uzywa; do innego dnia nie trafia.
  if exists (
    select 1
    from jsonb_to_recordset(v_grid) as g(place_id bigint)
    join public.places p on p.id = g.place_id
    where not p.active
      and not exists (
        select 1 from public.schedule_slots cur
        where cur.schedule_day_id = v_day_id and cur.place_id = p.id
      )
  ) then
    raise exception 'Nieaktywnego placu nie mozna dodac do dnia' using errcode = 'SB031';
  end if;

  -- Zapisani jezdzcy nie wedruja na inny plac bez wiedzy osrodka (najwczesniejsza godzina).
  select g.hour, count(*)
    into v_hour, v_count
  from jsonb_to_recordset(v_grid) as g(instructor_id bigint, hour int, place_id bigint)
  join public.schedule_slots cur
    on cur.schedule_day_id = v_day_id and cur.instructor_id = g.instructor_id and cur.hour = g.hour
  join public.bookings b
    on b.schedule_day_id = v_day_id and b.instructor_id = g.instructor_id and b.hour = g.hour
   and b.status = 'active'
  where cur.place_id <> g.place_id
  group by g.instructor_id, g.hour
  order by g.hour
  limit 1;

  if v_hour is not null then
    raise exception 'Nie mozna zmienic placu slotu o godzinie %, ktory ma % aktywnych zapisow', v_hour, v_count
      using errcode = 'SB032',
            detail = jsonb_build_object('hour', v_hour, 'bookings', v_count)::text;
  end if;

  -- Konia ma tylko aktywny zapis (CHECK bookings_horse_only_when_active_check), wiec odwolane
  -- zapisy nie blokuja wypisania konia.
  if v_day_id is not null and exists (
    select 1 from public.bookings b
    where b.schedule_day_id = v_day_id
      and b.horse_id is not null
      and not (b.horse_id = any (v_horses))
  ) then
    raise exception 'Nie mozna wypisac konia przydzielonego do zapisu w tym dniu' using errcode = 'SB004';
  end if;

  -- Przed DELETE z schedule_day_instructors - kaskada skasowalaby sloty.
  if v_day_id is not null then
    select count(*) into v_count
    from public.bookings b
    where b.schedule_day_id = v_day_id
      and b.status = 'active'
      and not (b.instructor_id = any (v_instructors));

    if v_count > 0 then
      raise exception 'Nie mozna wypisac instruktora, ktory ma % aktywnych zapisow w tym dniu', v_count
        using errcode = 'SB011',
              detail = jsonb_build_object('bookings', v_count)::text;
    end if;
  end if;

  -- Zmiana godzin przechodzi przez wyzwalacz schedule_days_protect_bookings (SB002).
  insert into public.schedule_days (stable_id, day, open_hour, close_hour)
  values (v_stable, p_day, p_open_hour, p_close_hour)
  on conflict (stable_id, day) do update
    set open_hour = excluded.open_hour, close_hour = excluded.close_hour
  returning id into v_day_id;

  delete from public.schedule_day_horses
  where schedule_day_id = v_day_id and not (horse_id = any (v_horses));

  insert into public.schedule_day_horses (schedule_day_id, horse_id, stable_id)
  select v_day_id, h, v_stable from unnest(v_horses) h
  on conflict do nothing;

  -- Wypisanie instruktora kasuje kaskadowo jego sloty; odwolane zapisy zostaja (brak FK do slotu).
  delete from public.schedule_day_instructors
  where schedule_day_id = v_day_id and not (instructor_id = any (v_instructors));

  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  select v_day_id, i, v_stable from unnest(v_instructors) i
  on conflict do nothing;

  delete from public.schedule_slots
  where schedule_day_id = v_day_id and (hour < p_open_hour or hour >= p_close_hour);

  -- UPSERT, nie DELETE + INSERT: wiersz slotu przetrwa edycje, bo blokuje go zapis jezdzca.
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id)
  select v_day_id, g.instructor_id, g.hour, g.seats, g.place_id
  from jsonb_to_recordset(v_grid) as g(instructor_id bigint, hour int, seats int, place_id bigint)
  on conflict (schedule_day_id, instructor_id, hour) do update
    set seats = excluded.seats, place_id = excluded.place_id
    where public.schedule_slots.seats is distinct from excluded.seats
       or public.schedule_slots.place_id is distinct from excluded.place_id;

  -- Limit nie moze spasc ponizej liczby aktywnych zapisow w slocie (najwczesniejsza godzina).
  select s.hour, s.seats, count(*)
    into v_hour, v_sum, v_count
  from public.schedule_slots s
  join public.bookings b
    on b.schedule_day_id = s.schedule_day_id
   and b.instructor_id = s.instructor_id
   and b.hour = s.hour
   and b.status = 'active'
  where s.schedule_day_id = v_day_id
  group by s.instructor_id, s.hour, s.seats
  having count(*) > s.seats
  order by s.hour
  limit 1;

  if v_hour is not null then
    raise exception 'Limit miejsc o godzinie % (%) jest nizszy niz liczba aktywnych zapisow w slocie (%)',
      v_hour, v_sum, v_count
      using errcode = 'SB010',
            detail = jsonb_build_object('hour', v_hour, 'seats', v_sum, 'bookings', v_count)::text;
  end if;

  -- Regula sumy limitow na STANIE KONCOWYM: konie i limity sa juz zapisane.
  select count(*) into v_horse_count from public.schedule_day_horses where schedule_day_id = v_day_id;

  select s.hour, sum(s.seats)
    into v_hour, v_sum
  from public.schedule_slots s
  where s.schedule_day_id = v_day_id
  group by s.hour
  having sum(s.seats) > v_horse_count
  order by s.hour
  limit 1;

  if v_hour is not null then
    raise exception 'Suma limitow miejsc o godzinie % (%) przekracza liczbe koni pracujacych tego dnia (%)',
      v_hour, v_sum, v_horse_count
      using errcode = 'SB007',
            detail = jsonb_build_object('hour', v_hour, 'seats', v_sum, 'horses', v_horse_count)::text;
  end if;

  return v_day_id;
end;
$$;

comment on function public.save_schedule_day(date, int, int, bigint[], bigint[], jsonb) is
  'Jedyna droga zapisu grafiku dnia (godziny, konie, instruktorzy, limity, place slotow) - w jednej transakcji, regula sumy limitow na stanie koncowym; wlasciciel osrodka albo aktywny instruktor z uprawnieniem do ukladania grafiku (private.schedule_stable_id, 42501). p_seats: [{instructor_id, hour, seats, place_id}], brakujaca godzina = 0, brak place_id = dotychczasowy plac slotu albo pierwszy aktywny plac osrodka. Kody odmow w naglowkach migracji 20261113090000, 20261114090000 i 20261201090000; dane odmow (DETAIL, JSON) w 20261116090000.';
