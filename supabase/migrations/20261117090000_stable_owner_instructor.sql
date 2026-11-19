-- Wlasciciel osrodka: konto osrodka staje sie instruktorem wlascicielem (#71, ADR-0004,
-- GLOSSARY "Wlasciciel", "Instruktor").
--
-- Zmiana modelu:
--   * rola konta `stable` znika na rzecz `instructor` (`rider` bez zmian, rola nadal niezmienna),
--   * instruktor dostaje opcjonalne, unikalne powiazanie z kontem (`instructors.account_id`);
--     z aplikacji nie da sie go ustawic ani zmienic - powstaje przy zakladaniu osrodka
--     (`public.create_stable`), a w kolejnych ticketach przy przyjeciu zaproszenia,
--   * osrodek nadal zapisuje wlasciciela (`stables.owner_id`); konto wlasciciela jest zarazem
--     powiazane z instruktorem tego osrodka,
--   * kontekst osrodka w bazie wynika z powiazania konta z AKTYWNYM instruktorem
--     (`private.current_stable_id()`); wszystko, co dotad mogl robic osrodek, wymaga
--     wlasciciela (`private.owned_stable_id()`).
--
-- JEDYNA migracja kasujaca konta: istniejace konta osrodkow (rola `stable`) znikaja razem z ich
-- stadninami, konmi, instruktorami, grafikiem i zapisami w tym grafiku (ADR-0004: brak danych
-- produkcyjnych). Konta jezdzcow zostaja.
--
-- Nowe kody odmow:
--   SB012  dezaktywacja instruktora bedacego wlascicielem osrodka - wyzwalacz instructors_owner_stays_active
--   42501  zalozenie osrodka przez konto inne niz `instructor`; bezposredni INSERT do `stables`
--   23505  zalozenie osrodka przez konto juz powiazane z instruktorem (takze drugi osrodek)
-- Dowod: supabase/tests/stable_owner_account.sql; dotychczasowe dowody przepisane na persone
-- wlasciciela (rls_isolation, schedule_day_save, stable_booking_actions, instructors_name_and_access).

-- ---------------------------------------------------------------------------
-- 1. Kasowanie kont osrodkow (ADR-0004)
-- ---------------------------------------------------------------------------

-- Zapisy najpierw: klucze obce bookings -> schedule_days / instructors sa RESTRICT.
delete from public.bookings b
using public.schedule_days sd, public.stables s, public.profiles p
where b.schedule_day_id = sd.id
  and sd.stable_id = s.id
  and s.owner_id = p.id
  and p.role = 'stable';

-- Kaskada: profiles -> stables -> horses, instructors, schedule_days (i dalej).
delete from auth.users u
using public.profiles p
where p.id = u.id
  and p.role = 'stable';

-- ---------------------------------------------------------------------------
-- 2. Rola konta: `instructor` zamiast `stable`
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('instructor', 'rider'));

comment on column public.profiles.role is
  'Rola konta: instructor = instruktor osrodka (wlasciciel albo instruktor z zaproszenia; kim jest, mowi powiazanie w instructors), rider = Jezdziec (zapisuje sie na jazdy). Niezmienna po zalozeniu konta.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    -- Twarde mapowanie zamiast przepisania wartosci z metadanych: nieznana rola nie moze
    -- wywalic rejestracji na constraincie - kazda inna wartosc daje jezdzca.
    case new.raw_user_meta_data ->> 'role'
      when 'instructor' then 'instructor'
      else 'rider'
    end,
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Powiazanie instruktora z kontem
-- ---------------------------------------------------------------------------

-- SET NULL: usuniecie konta zostawia instruktora przy dniach i dawnych zapisach (konto
-- wlasciciela i tak kasuje kaskadowo cala stadnine).
alter table public.instructors
  add column account_id uuid references public.profiles (id) on delete set null;

-- Jedno konto to najwyzej jeden instruktor (i odwrotnie - kolumna jest w wierszu instruktora).
alter table public.instructors
  add constraint instructors_account_id_key unique (account_id);

comment on column public.instructors.account_id is
  'Konto instruktora (opcjonalne, unikalne). Ustawiane wylacznie przez funkcje security definer (zalozenie osrodka, przyjecie zaproszenia) - rola authenticated nie ma INSERT ani UPDATE tej kolumny.';

-- Z aplikacji instruktora dodaje sie wylacznie z nazwa; powiazania z kontem nie da sie wpisac.
revoke insert on public.instructors from anon, authenticated;
grant insert (stable_id, name) on public.instructors to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Kontekst zalogowanego
-- ---------------------------------------------------------------------------

create or replace function private.current_instructor_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select i.id
  from public.instructors i
  where i.account_id = (select auth.uid())
    and i.active;
$$;

comment on function private.current_instructor_id() is
  'Id aktywnego instruktora powiazanego z zalogowanym kontem, albo NULL (jezdziec, konto bez osrodka, instruktor zdezaktywowany).';

create or replace function private.current_stable_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select i.stable_id
  from public.instructors i
  where i.account_id = (select auth.uid())
    and i.active;
$$;

comment on function private.current_stable_id() is
  'Osrodek, do ktorego nalezy zalogowane konto - przez powiazanie z AKTYWNYM instruktorem - albo NULL. Dezaktywacja instruktora oproznia kontekst, wiec polityki odcinaja dostep bez osobnej logiki. NIE oznacza uprawnien wlasciciela - do tego private.owned_stable_id().';

create or replace function private.is_stable_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.instructors i
    join public.stables s on s.id = i.stable_id and s.owner_id = i.account_id
    where i.account_id = (select auth.uid())
      and i.active
  );
$$;

comment on function private.is_stable_owner() is
  'Czy zalogowane konto jest wlascicielem osrodka, do ktorego nalezy (powiazany aktywny instruktor + stables.owner_id).';

create or replace function private.owned_stable_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.instructors i
  join public.stables s on s.id = i.stable_id and s.owner_id = i.account_id
  where i.account_id = (select auth.uid())
    and i.active;
$$;

comment on function private.owned_stable_id() is
  'Osrodek, ktorego WLASCICIELEM jest zalogowane konto, albo NULL. Fundament wszystkich polityk i funkcji zmieniajacych dane osrodka (to, co dotad robilo konto osrodka).';

revoke execute on function private.current_instructor_id() from public, anon;
revoke execute on function private.is_stable_owner() from public, anon;
revoke execute on function private.owned_stable_id() from public, anon;
grant execute on function private.current_instructor_id() to authenticated;
grant execute on function private.is_stable_owner() to authenticated;
grant execute on function private.owned_stable_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Zakladanie osrodka: osrodek + instruktor wlasciciel w jednej transakcji
-- ---------------------------------------------------------------------------

-- Bezposredni INSERT do stables znika - osrodek bez instruktora wlasciciela nie moze powstac.
drop policy stables_insert_own on public.stables;
revoke insert on public.stables from anon, authenticated;

create or replace function public.create_stable(p_name text, p_city text, p_instructor_name text)
returns bigint
language plpgsql
-- SECURITY DEFINER celowo: rola authenticated nie ma INSERT na stables ani na instructors.account_id.
-- Wlasciciela bierze z sesji, nigdy z argumentu.
security definer
set search_path = ''
as $$
declare
  v_account uuid := auth.uid();
  v_stable bigint;
begin
  if v_account is null or private.current_role() is distinct from 'instructor' then
    raise exception 'Osrodek zaklada wylacznie konto instruktora' using errcode = '42501';
  end if;

  -- Konto instruktora nalezy do jednego osrodka; drugi rownolegly zapis odbije sie od
  -- stables_owner_id_key albo instructors_account_id_key (tez 23505).
  if exists (select 1 from public.instructors i where i.account_id = v_account) then
    raise exception 'Konto jest juz instruktorem osrodka' using errcode = '23505';
  end if;

  insert into public.stables (owner_id, name, city)
  values (v_account, p_name, p_city)
  returning id into v_stable;

  insert into public.instructors (stable_id, name, account_id)
  values (v_stable, p_instructor_name, v_account);

  return v_stable;
end;
$$;

comment on function public.create_stable(text, text, text) is
  'Zakladanie osrodka (#71): osrodek i instruktor wlasciciel powiazany z kontem w jednej transakcji. Kody: 42501 konto nie-instructor, 23505 konto juz powiazane z instruktorem, 23514 pusta nazwa osrodka/miejscowosc/nazwa instruktora.';

revoke execute on function public.create_stable(text, text, text) from public, anon;
grant execute on function public.create_stable(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Wlasciciela nie da sie dezaktywowac
-- ---------------------------------------------------------------------------

create or replace function public.enforce_instructor_owner_stays_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.active and not new.active and exists (
    select 1 from public.stables s
    where s.id = new.stable_id and s.owner_id = new.account_id
  ) then
    raise exception 'Wlasciciela osrodka nie mozna dezaktywowac' using errcode = 'SB012';
  end if;
  return new;
end;
$$;

comment on function public.enforce_instructor_owner_stays_active() is
  'Osrodek ma zawsze aktywnego wlasciciela (#71, GLOSSARY "Wlasciciel"): dezaktywacja instruktora wlasciciela - SB012, takze jako postgres.';

revoke execute on function public.enforce_instructor_owner_stays_active() from public, anon, authenticated;

create trigger instructors_owner_stays_active
before update of active on public.instructors
for each row execute function public.enforce_instructor_owner_stays_active();

-- ---------------------------------------------------------------------------
-- 7. Polityki osrodka wymagaja wlasciciela
-- ---------------------------------------------------------------------------

alter policy horses_insert_own_stable on public.horses
  with check (stable_id = (select private.owned_stable_id()));

alter policy horses_update_own_stable on public.horses
  using (stable_id = (select private.owned_stable_id()))
  with check (stable_id = (select private.owned_stable_id()));

alter policy horses_delete_own_stable on public.horses
  using (stable_id = (select private.owned_stable_id()));

alter policy instructors_insert_own_stable on public.instructors
  with check (stable_id = (select private.owned_stable_id()));

alter policy instructors_update_own_stable on public.instructors
  using (stable_id = (select private.owned_stable_id()))
  with check (stable_id = (select private.owned_stable_id()));

alter policy bookings_select_own_or_my_stable on public.bookings
  using (
    rider_id = (select auth.uid())
    or exists (
      select 1
      from public.schedule_days sd
      where sd.id = bookings.schedule_day_id
        and sd.stable_id = (select private.owned_stable_id())
    )
  );

alter policy bookings_update_own_or_my_stable on public.bookings
  using (
    rider_id = (select auth.uid())
    or exists (
      select 1
      from public.schedule_days sd
      where sd.id = bookings.schedule_day_id
        and sd.stable_id = (select private.owned_stable_id())
    )
  )
  with check (
    rider_id = (select auth.uid())
    or exists (
      select 1
      from public.schedule_days sd
      where sd.id = bookings.schedule_day_id
        and sd.stable_id = (select private.owned_stable_id())
    )
  );

create or replace function private.is_rider_of_my_stable(p_rider_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    join public.schedule_days sd on sd.id = b.schedule_day_id
    where b.rider_id = p_rider_id
      and sd.stable_id = (select private.owned_stable_id())
  );
$$;

comment on function private.is_rider_of_my_stable(uuid) is
  'Uzywana przez polityke odczytu profili - wlasciciel musi widziec nazwisko jezdzca na liscie zapisow dnia (FR-005). SECURITY DEFINER omija zagniezdzone RLS na bookings.';

-- ---------------------------------------------------------------------------
-- 8. Wyzwalacze zapisu: "osrodek" to wlasciciel
-- ---------------------------------------------------------------------------

-- Wartosc `cancelled_by = 'stable'` zostaje i znaczy "odwolal osrodek" (czyli wlasciciel).
create or replace function public.enforce_booking_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- NULL dla postgres (migracje, dane demo, testy) - wtedy pole ustawia piszacy.
  v_actor text := case private.current_role()
    when 'rider' then 'rider'
    when 'instructor' then 'stable'
  end;
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
    if v_actor is not null and new.cancelled_by is not null and new.cancelled_by <> v_actor then
      raise exception 'Jako odwolujacego mozna wpisac wylacznie siebie (%)', v_actor
        using errcode = '42501';
    end if;
    -- Konia ma tylko aktywny zapis: odwolanie zwalnia konia w tej godzinie.
    new.horse_id := null;
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_cancellation() is
  'Odwolanie zapisu (#41, #71): odwolujacy = rola wolajacego (rider -> rider, instructor -> stable, czyli osrodek), przydzial konia czyszczony, odwolanego zapisu nie da sie przywrocic. Ktore zapisy - polityka UPDATE (wlasny zapis albo osrodek wlasciciela).';

create or replace function public.enforce_booking_horse_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() NULL dla postgres (migracje, dane demo, testy) - wtedy przydzial jest dozwolony.
  -- Odwolanie czysci konia samo (bookings_cancellation odpala wczesniej - kolejnosc alfabetyczna),
  -- wiec jezdziec odwolujacy zapis z jawnym horse_id = null nie jest tu odrzucany.
  if new.horse_id is distinct from old.horse_id
     and new.status = 'active'
     and (select auth.uid()) is not null
     and not private.is_stable_owner() then
    raise exception 'Konia do zapisu przydziela wylacznie wlasciciel osrodka' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_horse_assignment() is
  'Przydzial konia (#42, #71): horse_id zapisu aktywnego zmienia wylacznie wlasciciel osrodka (42501 dla jezdzca i instruktora). Kon z dnia i jeden zapis konia w godzinie pilnuja FK bookings_assigned_horse_fkey i indeks bookings_horse_hour_key.';

-- ---------------------------------------------------------------------------
-- 9. save_schedule_day - cialo z 20261116090000, stadnina wlasciciela zamiast kontekstu konta
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
  v_stable bigint := private.owned_stable_id();
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
    raise exception 'Grafik dnia zapisuje wylacznie wlasciciel osrodka'
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
  'Jedyna droga zapisu grafiku dnia (godziny, konie, instruktorzy, limity) - w jednej transakcji, regula sumy limitow na stanie koncowym; wylacznie wlasciciel osrodka (private.owned_stable_id, 42501). p_seats: [{instructor_id, hour, seats}], brakujaca godzina = 0. Kody odmow w naglowkach migracji 20261113090000 i 20261114090000; dane odmow (DETAIL, JSON) w 20261116090000.';
