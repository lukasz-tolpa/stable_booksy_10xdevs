-- Zapis jezdzca na miejsce u instruktora (#41, ADR-0002, GLOSSARY "Slot", "Limit miejsc").
--
-- Przelaczenie modelu: zapis wskazuje slot (dzien grafiku, instruktor, godzina) zamiast pary
-- kon x godzina. Kon przy zapisie staje sie opcjonalny (przydziela go osrodek - #42).
--
-- JEDYNA migracja kasujaca dane: znikaja dotychczasowe zapisy i dni grafiku (razem z konmi,
-- instruktorami i slotami w dniach - kaskada). Konta, stadniny, konie i instruktorzy zostaja.
-- W bazie byly wylacznie dane testowe (potwierdzone przez wlasciciela projektu, #38).
--
-- Kody odmow zapisu (tlumaczenie dla jezdzca: src/lib/bookings/errors.ts):
--   SB009  brak wolnych miejsc w slocie (takze slot z limitem zero)       - wyzwalacz
--   23505  drugi aktywny zapis jezdzca na te godzine dnia                 - bookings_rider_hour_key
--   23503  dzien albo slot instruktora zniknal (zmiana grafiku w trakcie) - wyzwalacz
--   23514  godzina poza zakresem pracy dnia                               - wyzwalacz
--   42501  jezdziec wpisuje inny podmiot jako odwolujacego, przywraca odwolany zapis albo
--          zmienia kolumny poza odwolaniem (uprawnienia kolumnowe)
-- Kody odmow zapisu grafiku dokladane do save_schedule_day (tlumaczenie: src/lib/schedule/errors.ts):
--   SB010  limit miejsc ponizej liczby aktywnych zapisow w slocie (komunikat niesie godzine)
--   SB011  wypisanie z dnia instruktora, ktory ma w nim aktywne zapisy
--   SB004  zmienia znaczenie: kon przydzielony do aktywnego zapisu (dawniej: jakikolwiek zapis)
--
-- Serializacja (gwarancja "udaje sie dokladnie tyle zapisow, ile miejsc"):
--   * wyzwalacz zapisu bierze FOR SHARE na wierszu dnia - czeka na trwajacy zapis grafiku
--     (save_schedule_day trzyma FOR UPDATE na dniu), wiec kontrole funkcji (SB002, SB010, SB011)
--     widza kazdy zapis, ktory zdazyl przed nimi,
--   * potem FOR UPDATE na wierszu slotu - rownolegle zapisy na ten sam slot licza aktywne zapisy
--     po kolei. Kolejnosc blokad (dzien, potem slot) jest ta sama co w funkcji - bez zakleszczen.
-- Dowody: supabase/tests/booking_seats.sql, concurrent_seat_booking.sh, schedule_change_guardrails.sql.

-- ---------------------------------------------------------------------------
-- 1. Kasowanie danych starego modelu
-- ---------------------------------------------------------------------------

delete from public.bookings;
-- Kaskada: schedule_day_horses, schedule_day_instructors, schedule_slots.
delete from public.schedule_days;

-- ---------------------------------------------------------------------------
-- 2. Nowy ksztalt bookings
-- ---------------------------------------------------------------------------

drop trigger bookings_within_working_hours on public.bookings;
drop function public.enforce_booking_within_working_hours();
drop index public.bookings_active_slot_key;
alter table public.bookings drop constraint bookings_scheduled_horse_fkey;

alter table public.bookings alter column horse_id drop not null;
alter table public.bookings add column instructor_id bigint not null;
alter table public.bookings add column cancelled_by text;

-- Zapis pamieta dzien, instruktora i godzine NIEZALEZNIE od istnienia slotu: odwolany zapis
-- przetrwa wypisanie instruktora z dnia i skrocenie dnia. Dlatego klucze obce ida do dnia
-- i do instruktora, nie do schedule_slots; istnienie slotu sprawdza wyzwalacz przy zapisie.
alter table public.bookings
  add constraint bookings_schedule_day_fkey
  foreign key (schedule_day_id) references public.schedule_days (id) on delete restrict;

alter table public.bookings
  add constraint bookings_instructor_fkey
  foreign key (instructor_id) references public.instructors (id) on delete restrict;

-- Kon (opcjonalny) musi pracowac tego dnia. MATCH SIMPLE: zapis bez konia nie jest sprawdzany.
-- RESTRICT zastepuje dawny bookings_scheduled_horse_fkey: konia z przydzialem nie da sie wypisac.
alter table public.bookings
  add constraint bookings_assigned_horse_fkey
  foreign key (schedule_day_id, horse_id)
  references public.schedule_day_horses (schedule_day_id, horse_id) on delete restrict;

alter table public.bookings
  add constraint bookings_cancelled_by_check check (cancelled_by in ('rider', 'stable'));
alter table public.bookings
  add constraint bookings_cancelled_by_consistency_check
  check ((status = 'cancelled') = (cancelled_by is not null));
-- Konia ma tylko aktywny zapis - odwolanie czysci przydzial (wyzwalacz ponizej).
alter table public.bookings
  add constraint bookings_horse_only_when_active_check check (status = 'active' or horse_id is null);

comment on column public.bookings.instructor_id is
  'Instruktor slotu. Razem z schedule_day_id i hour wskazuje slot; nie jest kluczem obcym do schedule_slots, bo odwolany zapis przetrwa wypisanie instruktora z dnia (ADR-0002).';
comment on column public.bookings.horse_id is
  'Kon przydzielony przez osrodek; NULL = jeszcze bez konia. Wylacznie przy zapisie aktywnym.';
comment on column public.bookings.cancelled_by is
  'Kto odwolal: rider (jezdziec) albo stable (osrodek). Istnieje wtedy i tylko wtedy, gdy zapis jest odwolany.';

-- Jeden aktywny zapis jezdzca na godzine dnia grafiku (czyli w jednym osrodku), takze u innego
-- instruktora. Indeks, nie wyzwalacz: rownolegle proby tego samego jezdzca rozstrzyga unikalnosc.
create unique index bookings_rider_hour_key
  on public.bookings (schedule_day_id, hour, rider_id)
  where status = 'active';

-- Kon ma najwyzej jeden aktywny zapis w danej godzinie dnia.
create unique index bookings_horse_hour_key
  on public.bookings (schedule_day_id, hour, horse_id)
  where status = 'active' and horse_id is not null;

-- Liczenie zajetosci slotu w wyzwalaczu i w RPC.
create index bookings_active_slot_idx
  on public.bookings (schedule_day_id, instructor_id, hour)
  where status = 'active';
create index bookings_instructor_id_idx on public.bookings (instructor_id);

-- ---------------------------------------------------------------------------
-- 3. Wyzwalacz: slot istnieje, godzina w zakresie, limit miejsc
-- ---------------------------------------------------------------------------

create or replace function public.enforce_booking_seat_limit()
returns trigger
language plpgsql
-- SECURITY DEFINER celowo: blokady i liczenie musza widziec wszystkie zapisy slotu, a jezdziec
-- nie ma uprawnien do blokowania wierszy grafiku.
security definer
set search_path = ''
as $$
declare
  v_open smallint;
  v_close smallint;
  v_seats smallint;
  v_taken int;
begin
  -- Odwolany zapis nie zajmuje miejsca (wstawiaja takie wylacznie dane demo i testy).
  if new.status <> 'active' then
    return new;
  end if;

  -- FOR SHARE: czekamy na trwajacy zapis grafiku tego dnia i czytamy jego wynik.
  select sd.open_hour, sd.close_hour into v_open, v_close
  from public.schedule_days sd
  where sd.id = new.schedule_day_id
  for share;

  if not found then
    raise exception 'Grafik dnia o id % nie istnieje', new.schedule_day_id using errcode = '23503';
  end if;

  if new.hour < v_open or new.hour >= v_close then
    raise exception 'Godzina % jest poza zakresem pracy osrodka [%, %)', new.hour, v_open, v_close
      using errcode = '23514';
  end if;

  -- FOR UPDATE na slocie serializuje zapisy na ten sam slot; obnizenie limitu blokuje ten sam wiersz.
  select s.seats into v_seats
  from public.schedule_slots s
  where s.schedule_day_id = new.schedule_day_id
    and s.instructor_id = new.instructor_id
    and s.hour = new.hour
  for update;

  if not found then
    raise exception 'Instruktor % nie pracuje w dniu % o godzinie %', new.instructor_id, new.schedule_day_id, new.hour
      using errcode = '23503';
  end if;

  select count(*) into v_taken
  from public.bookings b
  where b.schedule_day_id = new.schedule_day_id
    and b.instructor_id = new.instructor_id
    and b.hour = new.hour
    and b.status = 'active'
    and b.id is distinct from new.id;

  if v_taken >= v_seats then
    raise exception 'Brak wolnych miejsc w slocie (limit %, zajete %)', v_seats, v_taken
      using errcode = 'SB009';
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_seat_limit() is
  'Limit miejsc slotu (#41): blokuje wiersz dnia (FOR SHARE) i slotu (FOR UPDATE), liczy aktywne zapisy. Kody: SB009 brak miejsc, 23503 brak dnia/slotu, 23514 godzina poza zakresem.';

revoke execute on function public.enforce_booking_seat_limit() from public, anon, authenticated;

create trigger bookings_seat_limit
before insert or update of schedule_day_id, instructor_id, hour, status on public.bookings
for each row execute function public.enforce_booking_seat_limit();

-- ---------------------------------------------------------------------------
-- 4. Wyzwalacz: odwolanie (kto odwolal, przydzial konia, brak przywracania)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_booking_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- NULL dla postgres (migracje, dane demo, testy) - wtedy pole ustawia piszacy.
  v_role text := private.current_role();
begin
  if old.status = 'cancelled' then
    if new.status is distinct from old.status or new.cancelled_by is distinct from old.cancelled_by then
      raise exception 'Odwolanego zapisu nie mozna przywrocic ani zmienic odwolujacego'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'cancelled' then
    -- Brak pola zostawiamy CHECK-owi spojnosci (23514) - tu tylko wpis innego podmiotu.
    if v_role is not null and new.cancelled_by is not null and new.cancelled_by <> v_role then
      raise exception 'Jako odwolujacego mozna wpisac wylacznie siebie (%)', v_role
        using errcode = '42501';
    end if;
    -- Konia ma tylko aktywny zapis: odwolanie zwalnia konia w tej godzinie.
    new.horse_id := null;
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_cancellation() is
  'Odwolanie zapisu (#41): odwolujacy = rola wolajacego (rider/stable), przydzial konia czyszczony, odwolanego zapisu nie da sie przywrocic. Spojnosc pola ze statusem pilnuje CHECK bookings_cancelled_by_consistency_check.';

revoke execute on function public.enforce_booking_cancellation() from public, anon, authenticated;

create trigger bookings_cancellation
before update of status, cancelled_by on public.bookings
for each row execute function public.enforce_booking_cancellation();

-- ---------------------------------------------------------------------------
-- 5. Uprawnienia i polityki zapisu
-- ---------------------------------------------------------------------------

-- Z aplikacji zmienia sie wylacznie odwolanie. Przeniesienie zapisu na inny slot ominieloby limit,
-- a przydzial konia (#42) dostanie osobne uprawnienie kolumnowe dla osrodka.
revoke update on public.bookings from anon, authenticated;
grant update (status, cancelled_at, cancelled_by) on public.bookings to authenticated;

drop policy bookings_insert_own_as_rider on public.bookings;

create policy bookings_insert_own_as_rider
  on public.bookings
  for insert
  to authenticated
  with check (
    rider_id = (select auth.uid())
    and (select private.current_role()) = 'rider'
    and status = 'active'
  );

-- ---------------------------------------------------------------------------
-- 6. Zajetosc slotow dla jezdzca (zastepuje get_taken_slots)
-- ---------------------------------------------------------------------------

drop function public.get_taken_slots(bigint, date);

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
  group by b.instructor_id, b.hour;
$$;

comment on function public.get_slot_occupancy(bigint, date) is
  'Liczba aktywnych zapisow na slot (instruktor x godzina) osrodka w danym dniu. Security definer: omija RLS bookings swiadomie, ale zwraca wylacznie liczby - bez rider_id ani zadnej tozsamosci jezdzca.';

revoke execute on function public.get_slot_occupancy(bigint, date) from public, anon;
grant execute on function public.get_slot_occupancy(bigint, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. save_schedule_day: ochrona aktywnych zapisow (SB010, SB011, nowe SB004)
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
        using errcode = 'SB011';
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
      using errcode = 'SB010';
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
      using errcode = 'SB007';
  end if;

  return v_day_id;
end;
$$;

comment on function public.save_schedule_day(date, int, int, bigint[], bigint[], jsonb) is
  'Jedyna droga zapisu grafiku dnia (godziny, konie, instruktorzy, limity) - w jednej transakcji, regula sumy limitow na stanie koncowym. p_seats: [{instructor_id, hour, seats}], brakujaca godzina = 0. Kody odmow w naglowkach migracji 20261113090000 i 20261114090000.';
