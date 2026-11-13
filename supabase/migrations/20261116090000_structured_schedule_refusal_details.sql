-- Dane odmow zapisu grafiku w polu DETAIL (przeglad #38, punkt 3).
--
-- Aplikacja (`scheduleErrorMessage`, src/lib/schedule/errors.ts) czytala dotad liczby z TRESCI
-- `raise exception` regexem - kazda zmiana zdania psula komunikat dla osrodka. Teraz liczby
-- ida w DETAIL jako obiekt JSON (PostgREST oddaje go w polu `details`), a tresc komunikatu
-- jest tylko dla czlowieka i moze sie dowolnie zmieniac. Kontrakt DETAIL:
--   SB001  zmiana daty dnia z aktywnymi zapisami        {"bookings": n}
--   SB002  zawezenie godzin pod aktywnymi zapisami      {"bookings": n}
--   SB007  suma limitow w godzinie ponad liczbe koni    {"hour": h, "seats": suma, "horses": n}
--   SB010  limit slotu ponizej liczby aktywnych zapisow {"hour": h, "seats": limit, "bookings": n}
--   SB011  wypisanie instruktora z aktywnymi zapisami   {"bookings": n}
-- Kody, kolejnosc kontroli i pozostale odmowy bez zmian (naglowki 20261113090000, 20261114090000).
-- Dowod: supabase/tests/schedule_day_save.sql (SB007), schedule_change_guardrails.sql
-- (SB001, SB002, SB010, SB011).

-- ---------------------------------------------------------------------------
-- 1. Straznik zmiany grafiku (SB001, SB002) - tresc z 20260811090000, DETAIL nowy
-- ---------------------------------------------------------------------------

create or replace function public.enforce_schedule_change_keeps_bookings()
returns trigger
language plpgsql
-- SECURITY DEFINER celowo: straznik musi widziec WSZYSTKIE zapisy dnia, a nie tylko
-- te, ktore polityka odczytu pokazuje wolajacemu.
security definer
set search_path = ''
as $$
declare
  v_conflicts int;
begin
  -- Zmiana daty: kazdy aktywny zapis tego dnia wedrowalby na inny termin, a jezdziec
  -- nie dowiedzialby sie o tym. Blokujemy niezaleznie od godzin.
  if new.day is distinct from old.day then
    select count(*)
      into v_conflicts
    from public.bookings b
    where b.schedule_day_id = old.id
      and b.status = 'active';

    if v_conflicts > 0 then
      raise exception 'Nie mozna zmienic daty dnia: ma % aktywnych zapisow', v_conflicts
        using errcode = 'SB001',
              detail = jsonb_build_object('bookings', v_conflicts)::text;
    end if;
  end if;

  -- Zmiana godzin: blokujemy WYLACZNIE zmiany, po ktorych istniejacy aktywny zapis
  -- wypadlby poza zakres [open_hour, close_hour). Rozszerzenie dnia ma przechodzic.
  if new.open_hour is distinct from old.open_hour or new.close_hour is distinct from old.close_hour then
    select count(*)
      into v_conflicts
    from public.bookings b
    where b.schedule_day_id = old.id
      and b.status = 'active'
      and (b.hour < new.open_hour or b.hour >= new.close_hour);

    if v_conflicts > 0 then
      raise exception 'Nie mozna zawezic godzin pracy: % aktywnych zapisow wypadloby poza zakres', v_conflicts
        using errcode = 'SB002',
              detail = jsonb_build_object('bookings', v_conflicts)::text;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_schedule_change_keeps_bookings() is
  'Straznik decyzji z Otwartego pytania #2 PRD. Kody bledu: SB001 = zmiana daty dnia z zapisami, SB002 = zawezenie godzin pod zapisem. DETAIL: {"bookings": n} (migracja 20261116090000).';

-- ---------------------------------------------------------------------------
-- 2. save_schedule_day - cialo z 20261114090000, DETAIL przy SB007, SB010, SB011
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
-- musi widziec wszystkie zapisy dnia. Stadnine bierze z sesji, nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
  v_stable bigint := private.current_stable_id();
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
    raise exception 'Grafik dnia zapisuje wylacznie wlasciciel stadniny'
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
  'Jedyna droga zapisu grafiku dnia (godziny, konie, instruktorzy, limity) - w jednej transakcji, regula sumy limitow na stanie koncowym. p_seats: [{instructor_id, hour, seats}], brakujaca godzina = 0. Kody odmow w naglowkach migracji 20261113090000 i 20261114090000; dane odmow (DETAIL, JSON) w 20261116090000.';
