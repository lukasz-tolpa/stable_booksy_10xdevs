-- Instruktor z uprawnieniem uklada grafik dnia (#79, spec #77, ADR-0004,
-- GLOSSARY "Uprawnienie do układania grafiku", "Instruktor").
--
-- #78 wprowadzil znacznik `instructors.arranges_schedule`; ta migracja z niego korzysta:
--   * private.schedule_stable_id() - osrodek, ktorego grafik zalogowane konto moze ukladac:
--     osrodek wlasciciela albo osrodek AKTYWNEGO instruktora z uprawnieniem, inaczej NULL.
--     Odebranie uprawnienia i dezaktywacja (wyzwalacz z #78 zeruje znacznik) oprozniaja go od
--     razu, bez osobnej logiki. public.schedule_stable_id() - ten sam wynik dla aplikacji
--     (strona grafiku czyta dzien przez filtr po osrodku).
--   * public.save_schedule_day bierze osrodek z pomocnika zamiast private.owned_stable_id();
--     odmowa bez uprawnienia - ten sam kod 42501. Reszta ciala bez zmian (20261117090000):
--     te same reguly i kody dla wlasciciela i instruktora, wygrywa ostatni zapis, bez autora.
--   * Odczyt potrzebny formularzowi: dni grafiku, konie dnia, instruktorzy dnia, sloty, konie
--     i instruktorzy osrodka (polityki SELECT) oraz zajetosc slotow (get_slot_occupancy) -
--     dodatkowo dla osrodka z pomocnika. Zapisy z danymi jezdzcow (bookings, profiles),
--     statystyki, zaproszenia, odwolania, zmiany koni i instruktorow - bez zmian, tylko wlasciciel.
--
-- Dowod: supabase/tests/schedule_arranging.sql.

-- ---------------------------------------------------------------------------
-- 1. Pomocnik: osrodek, ktorego grafik wywolujacy moze ukladac
-- ---------------------------------------------------------------------------

create or replace function private.schedule_stable_id()
returns bigint
language sql
stable
-- SECURITY DEFINER celowo: kolumny account_id i arranges_schedule sa zamkniete dla authenticated.
security definer
set search_path = ''
as $$
  select coalesce(
    private.owned_stable_id(),
    (
      select i.stable_id
      from public.instructors i
      where i.account_id = (select auth.uid())
        and i.active
        and i.arranges_schedule
    )
  );
$$;

comment on function private.schedule_stable_id() is
  'Osrodek, ktorego grafik dnia zalogowane konto moze ukladac: osrodek wlasciciela albo aktywnego instruktora z uprawnieniem do ukladania grafiku (instructors.arranges_schedule), inaczej NULL. Tylko grafik - pozostale prawa wlasciciela daje private.owned_stable_id().';

revoke execute on function private.schedule_stable_id() from public, anon;
grant execute on function private.schedule_stable_id() to authenticated;

create or replace function public.schedule_stable_id()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select private.schedule_stable_id();
$$;

comment on function public.schedule_stable_id() is
  'Dla aplikacji: osrodek, ktorego grafik zalogowane konto moze ukladac (private.schedule_stable_id), albo NULL.';

revoke execute on function public.schedule_stable_id() from public, anon;
grant execute on function public.schedule_stable_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Odczyt formularza grafiku
-- ---------------------------------------------------------------------------

-- Wyrazenia jak w 20261118090000 plus osrodek z pomocnika.
alter policy horses_select_authenticated on public.horses
  using (
    (select private.reads_catalogue())
    or stable_id = (select private.schedule_stable_id())
  );

alter policy schedule_day_horses_select_authenticated on public.schedule_day_horses
  using (
    (select private.reads_catalogue())
    or stable_id = (select private.schedule_stable_id())
  );

alter policy instructors_select_authenticated on public.instructors
  using (
    (select private.reads_catalogue())
    or account_id = (select auth.uid())
    or stable_id = (select private.schedule_stable_id())
  );

alter policy schedule_day_instructors_select_authenticated on public.schedule_day_instructors
  using (
    (select private.reads_catalogue())
    or instructor_id = (select private.current_instructor_id())
    or stable_id = (select private.schedule_stable_id())
  );

alter policy schedule_slots_select_authenticated on public.schedule_slots
  using (
    (select private.reads_catalogue())
    or instructor_id = (select private.current_instructor_id())
    or exists (
      select 1
      from public.schedule_day_instructors sdi
      where sdi.schedule_day_id = schedule_slots.schedule_day_id
        and sdi.instructor_id = schedule_slots.instructor_id
        and sdi.stable_id = (select private.schedule_stable_id())
    )
  );

alter policy schedule_days_select_authenticated on public.schedule_days
  using (
    (select private.reads_catalogue())
    or stable_id = (select private.schedule_stable_id())
    or exists (
      select 1
      from public.schedule_slots s
      where s.schedule_day_id = schedule_days.id
        and s.instructor_id = (select private.current_instructor_id())
    )
  );

create or replace function public.get_slot_occupancy(p_stable_id bigint, p_day date)
returns table (instructor_id bigint, hour smallint, taken int)
language sql
stable
security definer
set search_path = ''
as $$
  select b.instructor_id, b.hour, count(*)::int
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  where sd.stable_id = p_stable_id
    and sd.day = p_day
    and b.status = 'active'
    and (
      private.reads_catalogue()
      or sd.stable_id = private.schedule_stable_id()
      or b.instructor_id = private.current_instructor_id()
    )
  group by b.instructor_id, b.hour;
$$;

comment on function public.get_slot_occupancy(bigint, date) is
  'Liczba aktywnych zapisow na slot (instruktor x godzina) osrodka w danym dniu. Security definer: omija RLS bookings swiadomie, ale zwraca wylacznie liczby - bez rider_id ani zadnej tozsamosci jezdzca. Instruktor bez praw wlasciciela dostaje tylko swoje sloty (#72), z uprawnieniem do ukladania grafiku - wszystkie sloty swojego osrodka (#79).';

-- ---------------------------------------------------------------------------
-- 3. save_schedule_day - cialo z 20261117090000, osrodek z private.schedule_stable_id()
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

  -- Pelna siatka instruktor x godzina: godzina bez podanej wartosci ma limit zero.
  -- UPSERT, nie DELETE + INSERT: wiersz slotu przetrwa edycje, bo blokuje go zapis jezdzca.
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select v_day_id, i, h, coalesce(s.seats, 0)
  from unnest(v_instructors) i
  cross join generate_series(p_open_hour, p_close_hour - 1) h
  left join jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int)
    on s.instructor_id = i and s.hour = h
  on conflict (schedule_day_id, instructor_id, hour) do update
    set seats = excluded.seats
    where public.schedule_slots.seats is distinct from excluded.seats;

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
  'Jedyna droga zapisu grafiku dnia (godziny, konie, instruktorzy, limity) - w jednej transakcji, regula sumy limitow na stanie koncowym; wlasciciel osrodka albo aktywny instruktor z uprawnieniem do ukladania grafiku (private.schedule_stable_id, 42501). p_seats: [{instructor_id, hour, seats}], brakujaca godzina = 0. Kody odmow w naglowkach migracji 20261113090000 i 20261114090000; dane odmow (DETAIL, JSON) w 20261116090000.';
