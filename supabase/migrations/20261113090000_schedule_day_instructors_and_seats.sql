-- Grafik dnia z instruktorami i limitami miejsc (#40, ADR-0002, GLOSSARY "Slot", "Limit miejsc").
--
-- Zakres:
--   * public.schedule_day_instructors - instruktorzy pracujacy danego dnia (wzorzec: konie w dniu),
--   * public.schedule_slots           - slot (dzien grafiku, instruktor, godzina) z limitem miejsc,
--   * public.save_schedule_day        - JEDYNA droga zapisu grafiku dnia, jedna transakcja,
--   * odebranie bezposredniego zapisu do tabel grafiku (dni, konie w dniu, instruktorzy w dniu,
--     sloty) rolom anon i authenticated.
--
-- Zapis jezdzca na pare kon x godzina (bookings) nie zmienia sie w tym kroku - limity jeszcze
-- nie wplywaja na to, co widzi jezdziec (#41).
--
-- Kody odmow funkcji (tlumaczenie: src/lib/schedule/errors.ts):
--   SB002  zawezenie godzin pod aktywnym zapisem (wyzwalacz z S-02, bez zmian)
--   SB003  kon spoza stadniny                    (dawniej APP001 w aplikacji)
--   SB004  wypisanie konia z zapisami w dniu     (dawniej APP002 w aplikacji)
--   SB005  instruktor spoza stadniny
--   SB006  nieaktywny instruktor dodawany do dnia, w ktorym go nie bylo
--   SB007  suma limitow miejsc w godzinie ponad liczbe koni dnia (komunikat niesie godzine)
--   SB008  dzien miniony (czas Europe/Warsaw; dzisiejszy dzien edytowalny w calosci)
--   22023  niespojne limity (godzina poza zakresem dnia, instruktor spoza dnia, duplikat)
--   42501  wolajacy nie jest wlascicielem stadniny
-- Dowod: supabase/tests/schedule_day_save.sql.

-- ---------------------------------------------------------------------------
-- public.schedule_day_instructors
-- ---------------------------------------------------------------------------

create table public.schedule_day_instructors (
  schedule_day_id bigint not null,
  instructor_id bigint not null,
  stable_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (schedule_day_id, instructor_id),
  constraint schedule_day_instructors_day_fkey
    foreign key (schedule_day_id, stable_id)
    references public.schedule_days (id, stable_id) on delete cascade,
  constraint schedule_day_instructors_instructor_fkey
    foreign key (instructor_id, stable_id)
    references public.instructors (id, stable_id) on delete cascade
);

comment on table public.schedule_day_instructors is
  'Instruktorzy pracujacy danego dnia. Zdublowane stable_id w obu kluczach obcych wymusza, ze instruktor i dzien naleza do tej samej stadniny (wzorzec: schedule_day_horses).';

create index schedule_day_instructors_instructor_id_stable_id_idx
  on public.schedule_day_instructors (instructor_id, stable_id);

alter table public.schedule_day_instructors enable row level security;

-- ---------------------------------------------------------------------------
-- public.schedule_slots
-- ---------------------------------------------------------------------------

create table public.schedule_slots (
  schedule_day_id bigint not null,
  instructor_id bigint not null,
  hour smallint not null,
  seats smallint not null default 0,
  primary key (schedule_day_id, instructor_id, hour),
  constraint schedule_slots_day_instructor_fkey
    foreign key (schedule_day_id, instructor_id)
    references public.schedule_day_instructors (schedule_day_id, instructor_id) on delete cascade,
  constraint schedule_slots_hour_check check (hour between 0 and 23),
  constraint schedule_slots_seats_check check (seats >= 0)
);

comment on table public.schedule_slots is
  'Slot: jedna godzina jednego instruktora w dniu grafiku z limitem miejsc (0 = instruktor w tej godzinie nie prowadzi jazdy). Instruktor w dniu ma wiersz dla KAZDEJ godziny zakresu pracy dnia - pilnuje tego save_schedule_day, jedyna droga zapisu.';

create index schedule_slots_instructor_id_idx on public.schedule_slots (instructor_id);

alter table public.schedule_slots enable row level security;

-- ---------------------------------------------------------------------------
-- Odczyt: publiczny dla zalogowanych, jak grafik dnia (jezdziec zobaczy sloty w #41)
-- ---------------------------------------------------------------------------

create policy schedule_day_instructors_select_authenticated
  on public.schedule_day_instructors
  for select
  to authenticated
  using (true);

create policy schedule_slots_select_authenticated
  on public.schedule_slots
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Zapis: wylacznie przez funkcje
-- ---------------------------------------------------------------------------

-- Odebranie uprawnien dziala niezaleznie od RLS: bezposredni INSERT/UPDATE/DELETE konczy sie
-- 42501 takze dla wlasciciela, wiec zadna droga nie omija reguly sumy limitow.
revoke insert, update, delete, truncate on public.schedule_days from anon, authenticated;
revoke insert, update, delete, truncate on public.schedule_day_horses from anon, authenticated;
revoke insert, update, delete, truncate on public.schedule_day_instructors from anon, authenticated;
revoke insert, update, delete, truncate on public.schedule_slots from anon, authenticated;

-- Polityki zapisu po odebraniu uprawnien sa martwe - usuwamy je, zeby nie sugerowaly drogi zapisu.
drop policy schedule_days_insert_own_stable on public.schedule_days;
drop policy schedule_days_update_own_stable on public.schedule_days;
drop policy schedule_days_delete_own_stable on public.schedule_days;
drop policy schedule_day_horses_insert_own_stable on public.schedule_day_horses;
drop policy schedule_day_horses_update_own_stable on public.schedule_day_horses;
drop policy schedule_day_horses_delete_own_stable on public.schedule_day_horses;

-- ---------------------------------------------------------------------------
-- public.save_schedule_day
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

  -- Blokada wiersza dnia serializuje rownolegle zapisy tego samego dnia.
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

  -- Liczymy WSZYSTKIE zapisy, takze odwolane: FK bookings_scheduled_horse_fkey (RESTRICT)
  -- nie filtruje po statusie, wiec bez tej kontroli odmowa przyszlaby jako 23503.
  if v_day_id is not null and exists (
    select 1 from public.bookings b
    where b.schedule_day_id = v_day_id and not (b.horse_id = any (v_horses))
  ) then
    raise exception 'Nie mozna wypisac konia, ktory ma zapisy w tym dniu' using errcode = 'SB004';
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

  -- Wypisanie instruktora kasuje kaskadowo jego sloty.
  delete from public.schedule_day_instructors
  where schedule_day_id = v_day_id and not (instructor_id = any (v_instructors));

  insert into public.schedule_day_instructors (schedule_day_id, instructor_id, stable_id)
  select v_day_id, i, v_stable from unnest(v_instructors) i
  on conflict do nothing;

  delete from public.schedule_slots
  where schedule_day_id = v_day_id and (hour < p_open_hour or hour >= p_close_hour);

  -- Pelna siatka instruktor x godzina: godzina bez podanej wartosci ma limit zero.
  -- UPSERT, nie DELETE + INSERT: wiersz slotu ma przetrwac edycje (w #41 blokuje go zapis).
  insert into public.schedule_slots (schedule_day_id, instructor_id, hour, seats)
  select v_day_id, i, h, coalesce(s.seats, 0)
  from unnest(v_instructors) i
  cross join generate_series(p_open_hour, p_close_hour - 1) h
  left join jsonb_to_recordset(v_seats) as s(instructor_id bigint, hour int, seats int)
    on s.instructor_id = i and s.hour = h
  on conflict (schedule_day_id, instructor_id, hour) do update
    set seats = excluded.seats
    where public.schedule_slots.seats is distinct from excluded.seats;

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
      using errcode = 'SB007';
  end if;

  return v_day_id;
end;
$$;

comment on function public.save_schedule_day(date, int, int, bigint[], bigint[], jsonb) is
  'Jedyna droga zapisu grafiku dnia (godziny, konie, instruktorzy, limity) - w jednej transakcji, regula sumy limitow na stanie koncowym. p_seats: [{instructor_id, hour, seats}], brakujaca godzina = 0. Kody odmow w naglowku migracji 20261113090000.';

revoke execute on function public.save_schedule_day(date, int, int, bigint[], bigint[], jsonb) from public, anon;
grant execute on function public.save_schedule_day(date, int, int, bigint[], bigint[], jsonb) to authenticated;
