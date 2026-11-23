-- Zmiana grafiku odrzuca zapisy oczekujace (#127, spec #122, ADR 0002, ADR 0006, GLOSSARY „Odrzucenie zapisu”).
--
-- public.save_schedule_day (jedyna droga zapisu grafiku, ADR 0002) - cialo z 20261202090000 plus jeden krok:
--   * Reguly kolizji (SB002, SB010, SB011, SB032, SB048) licza tylko zapisy aktywne, jak dotad - zapis oczekujacy
--     niczego nie blokuje (ADR 0006).
--   * Zapisy oczekujace na slot, ktory znika (instruktor wypisany z dnia, godzina poza skroconym dniem), dostaje
--     limit zero albo zmienia plac lub rodzaj, staja sie odrzucone z powodem „Ośrodek zmienił grafik” (zrodlo
--     schedule_change) przez private.reject_bookings - jedyne miejsce odrzucenia (#125) - w tej samej
--     transakcji. Odmowa dalszej czesci zapisu grafiku (SB010, SB007, SB002) cofa takze odrzucenie.
--   * Zmniejszenie limitu powyzej zera nie dotyka zapisow oczekujacych (nawet gdy czeka ich wiecej niz miejsc).
--   * Zapis oczekujacy na slot, ktory juz sie zaczal, jest wygasly (wyprowadzane przy odczycie) - zmiana grafiku
--     go nie odrzuca, tak jak osrodek nie odrzuca go recznie po starcie slotu (SB064).
--
-- Bez nowych kodow odmowy (SB078-SB079 z zakresu #127 wolne). Dowod: supabase/tests/schedule_change_rejection.sql.

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
    from jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int, kind text)
    where s.instructor_id is null or s.hour is null or s.seats is null or s.seats < 0
       or not (s.instructor_id = any (v_instructors))
       or s.hour < p_open_hour or s.hour >= p_close_hour
       or (s.kind is not null and s.kind not in ('recreation', 'training'))
  ) or exists (
    select 1
    from jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int)
    group by s.instructor_id, s.hour
    having count(*) > 1
  ) then
    raise exception 'Niespojne limity miejsc: godzina poza zakresem dnia, instruktor spoza dnia, nieznany rodzaj slotu albo duplikat'
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

  -- Pelna siatka instruktor x godzina ze stanem koncowym: limit (brak = 0), plac (brak = plac,
  -- na ktorym slot juz jest, a nowy slot - pierwszy aktywny plac osrodka) i rodzaj (brak = rodzaj,
  -- ktory slot juz ma, a nowy slot - rekreacyjny).
  v_default_place := private.default_place_id(v_stable);

  select coalesce(jsonb_agg(jsonb_build_object(
           'instructor_id', i,
           'hour', h,
           'seats', coalesce(s.seats, 0),
           'place_id', coalesce(s.place_id, cur.place_id, v_default_place),
           'kind', coalesce(s.kind, cur.kind, 'recreation')
         )), '[]'::jsonb)
    into v_grid
  from unnest(v_instructors) i
  cross join generate_series(p_open_hour, p_close_hour - 1) h
  left join jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int, place_id bigint, kind text)
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

  -- Rodzaj slotu z zapisami zostaje: rekreacyjni jezdzcy nie trafiaja na trening ani odwrotnie
  -- (najwczesniejsza godzina).
  select g.hour, count(*)
    into v_hour, v_count
  from jsonb_to_recordset(v_grid) as g(instructor_id bigint, hour int, kind text)
  join public.schedule_slots cur
    on cur.schedule_day_id = v_day_id and cur.instructor_id = g.instructor_id and cur.hour = g.hour
  join public.bookings b
    on b.schedule_day_id = v_day_id and b.instructor_id = g.instructor_id and b.hour = g.hour
   and b.status = 'active'
  where cur.kind <> g.kind
  group by g.instructor_id, g.hour
  order by g.hour
  limit 1;

  if v_hour is not null then
    raise exception 'Nie mozna zmienic rodzaju slotu o godzinie %, ktory ma % aktywnych zapisow', v_hour, v_count
      using errcode = 'SB048',
            detail = jsonb_build_object('hour', v_hour, 'bookings', v_count)::text;
  end if;

  -- Konia ma tylko aktywny zapis (CHECK bookings_horse_only_when_active_check), wiec odwolane
  -- zapisy nie blokuja wypisania konia. Konie pensjonatowe przy slotach treningowych nie sa
  -- konmi pracujacymi dnia - tu licza sie wylacznie konie osrodka.
  if v_day_id is not null and exists (
    select 1
    from public.bookings b
    join public.horses h on h.id = b.horse_id and h.kind = 'stable'
    where b.schedule_day_id = v_day_id
      and not (b.horse_id = any (v_horses))
  ) then
    raise exception 'Nie mozna wypisac konia przydzielonego do zapisu w tym dniu' using errcode = 'SB004';
  end if;

  -- Zapisy oczekujace na sloty, ktore po zapisie grafiku nie istnieja (instruktor wypisany, godzina poza
  -- dniem), maja limit zero albo inny plac lub rodzaj - odrzucone „Ośrodek zmienił grafik” (#127). Siatka
  -- v_grid to stan koncowy kazdego slotu dnia. Zapis na slot, ktory juz sie zaczal, jest wygasly i zostaje.
  if v_day_id is not null then
    perform private.reject_bookings(
      array(
        select b.id
        from public.bookings b
        left join public.schedule_slots cur
          on cur.schedule_day_id = b.schedule_day_id and cur.instructor_id = b.instructor_id and cur.hour = b.hour
        where b.schedule_day_id = v_day_id
          and b.status = 'pending'
          and not private.booking_slot_started(p_day, b.hour)
          and not exists (
            select 1
            from jsonb_to_recordset(v_grid) as g(instructor_id bigint, hour int, seats int, place_id bigint, kind text)
            where g.instructor_id = b.instructor_id and g.hour = b.hour
              and g.seats > 0
              and g.place_id = cur.place_id
              and g.kind = cur.kind
          )
      ),
      'schedule_change'
    );
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
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats, place_id, kind)
  select v_day_id, g.instructor_id, g.hour, g.seats, g.place_id, g.kind
  from jsonb_to_recordset(v_grid) as g(instructor_id bigint, hour int, seats int, place_id bigint, kind text)
  on conflict (schedule_day_id, instructor_id, hour) do update
    set seats = excluded.seats, place_id = excluded.place_id, kind = excluded.kind
    where public.schedule_slots.seats is distinct from excluded.seats
       or public.schedule_slots.place_id is distinct from excluded.place_id
       or public.schedule_slots.kind is distinct from excluded.kind;

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

  -- Regula sumy limitow na STANIE KONCOWYM: konie i limity sa juz zapisane. Licza sie tylko sloty
  -- rekreacyjne - sloty treningowe nie zuzywaja koni osrodka.
  select count(*) into v_horse_count from public.schedule_day_horses where schedule_day_id = v_day_id;

  select s.hour, sum(s.seats)
    into v_hour, v_sum
  from public.schedule_slots s
  where s.schedule_day_id = v_day_id
    and s.kind = 'recreation'
  group by s.hour
  having sum(s.seats) > v_horse_count
  order by s.hour
  limit 1;

  if v_hour is not null then
    raise exception 'Suma limitow miejsc slotow rekreacyjnych o godzinie % (%) przekracza liczbe koni pracujacych tego dnia (%)',
      v_hour, v_sum, v_horse_count
      using errcode = 'SB007',
            detail = jsonb_build_object('hour', v_hour, 'seats', v_sum, 'horses', v_horse_count)::text;
  end if;

  return v_day_id;
end;
$$;

comment on function public.save_schedule_day(date, int, int, bigint[], bigint[], jsonb) is
  'Jedyna droga zapisu grafiku dnia (godziny, konie, instruktorzy, limity, place i rodzaje slotow) - w jednej transakcji, regula sumy limitow slotow rekreacyjnych na stanie koncowym; wlasciciel osrodka albo aktywny instruktor z uprawnieniem do ukladania grafiku (private.schedule_stable_id, 42501). p_seats: [{instructor_id, hour, seats, place_id, kind}], brakujaca godzina = 0, brak place_id = dotychczasowy plac slotu albo pierwszy aktywny plac osrodka, brak kind = dotychczasowy rodzaj albo recreation. Odmowy licza tylko zapisy aktywne; zapisy oczekujace na slot, ktory znika, dostaje limit zero albo zmienia plac lub rodzaj (i jeszcze sie nie zaczal), sa odrzucane „Ośrodek zmienił grafik” (private.reject_bookings, #127). Kody odmow w naglowkach migracji 20261113090000, 20261114090000, 20261201090000 i 20261202090000; dane odmow (DETAIL, JSON) w 20261116090000.';
