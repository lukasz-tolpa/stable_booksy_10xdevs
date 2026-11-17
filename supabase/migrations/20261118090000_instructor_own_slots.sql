-- „Moje sloty”: instruktor z kontem czyta wylacznie swoje sloty (#72, ADR-0004,
-- GLOSSARY "Instruktor").
--
-- Od #71 wszystko, co zmienia dane osrodka, wymaga wlasciciela (private.owned_stable_id()).
-- Odczyt byl jednak otwarty: polityki SELECT na grafiku, koniach, instruktorach i osrodkach to
-- `using (true)` - katalog dla jezdzca. Ta migracja zaweza odczyt dla konta `instructor`,
-- ktore nie jest wlascicielem:
--   * jezdziec i wlasciciel czytaja jak dotad (private.reads_catalogue()),
--   * instruktor czyta: swoje sloty i przypisanie do dnia, dni grafiku, w ktorych ma slot,
--     swoj wiersz instruktora, swoj osrodek oraz AKTYWNE zapisy na swoje sloty,
--   * koni, koni dnia, innych instruktorow, ich slotow i zapisow, ani niczego z innego
--     osrodka - nie czyta,
--   * imie i nazwisko jezdzca i przydzielonego konia czyta przez public.get_my_slot_bookings,
--     ograniczona do jego slotow - RLS na profiles zostaje bez zmian (widzi je tylko wlasciciel),
--   * zajetosc slotow (public.get_slot_occupancy) - tylko dla wlasnych slotow.
-- Kontekst instruktora to private.current_instructor_id() (AKTYWNY instruktor powiazany z
-- kontem), wiec dezaktywacja odcina odczyt bez osobnej logiki. Zapisy na jazde zostaja
-- wylacznie dla roli `rider` (polityka bookings_insert_own_as_rider bez zmian).
--
-- Dowod: supabase/tests/instructor_account_access.sql.

-- ---------------------------------------------------------------------------
-- 1. Kto czyta katalog osrodkow
-- ---------------------------------------------------------------------------

create or replace function private.reads_catalogue()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_role() = 'rider', false) or private.is_stable_owner();
$$;

comment on function private.reads_catalogue() is
  'Czy zalogowane konto czyta katalog osrodkow jak dotad (grafik, konie, instruktorzy wszystkich osrodkow): jezdziec albo wlasciciel. Instruktor bez praw wlasciciela - nie; czyta tylko swoje sloty (#72).';

revoke execute on function private.reads_catalogue() from public, anon;
grant execute on function private.reads_catalogue() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Polityki odczytu
-- ---------------------------------------------------------------------------

alter policy stables_select_authenticated on public.stables
  using (
    (select private.reads_catalogue())
    or id = (select private.current_stable_id())
  );

alter policy horses_select_authenticated on public.horses
  using ((select private.reads_catalogue()));

alter policy schedule_day_horses_select_authenticated on public.schedule_day_horses
  using ((select private.reads_catalogue()));

-- Wlasny wiersz takze po dezaktywacji (account_id, nie current_instructor_id): middleware
-- rozpoznaje po nim konto instruktora z osrodkiem.
alter policy instructors_select_authenticated on public.instructors
  using (
    (select private.reads_catalogue())
    or account_id = (select auth.uid())
  );

alter policy schedule_slots_select_authenticated on public.schedule_slots
  using (
    (select private.reads_catalogue())
    or instructor_id = (select private.current_instructor_id())
  );

alter policy schedule_day_instructors_select_authenticated on public.schedule_day_instructors
  using (
    (select private.reads_catalogue())
    or instructor_id = (select private.current_instructor_id())
  );

alter policy schedule_days_select_authenticated on public.schedule_days
  using (
    (select private.reads_catalogue())
    or exists (
      select 1
      from public.schedule_slots s
      where s.schedule_day_id = schedule_days.id
        and s.instructor_id = (select private.current_instructor_id())
    )
  );

-- Instruktor czyta aktywne zapisy na swoje sloty; zmienia je nadal wylacznie wlasciciel
-- (polityka bookings_update_own_or_my_stable bez zmian).
alter policy bookings_select_own_or_my_stable on public.bookings
  using (
    rider_id = (select auth.uid())
    or exists (
      select 1
      from public.schedule_days sd
      where sd.id = bookings.schedule_day_id
        and sd.stable_id = (select private.owned_stable_id())
    )
    or (
      status = 'active'
      and instructor_id = (select private.current_instructor_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Zapisani na moje sloty - imie i nazwisko jezdzca i przydzielony kon
-- ---------------------------------------------------------------------------

create or replace function public.get_my_slot_bookings(p_from date)
returns table (day date, hour smallint, rider_name text, horse_name text, anonymised boolean)
language sql
stable
-- SECURITY DEFINER celowo: instruktor nie czyta profili jezdzcow ani koni wprost. Funkcja
-- bierze instruktora z sesji (nigdy z argumentu) i zwraca wylacznie aktywne zapisy na jego sloty.
security definer
set search_path = ''
as $$
  select sd.day, b.hour, p.full_name, h.name, b.rider_id is null
  from public.bookings b
  join public.schedule_days sd on sd.id = b.schedule_day_id
  left join public.profiles p on p.id = b.rider_id
  left join public.horses h on h.id = b.horse_id
  where b.instructor_id = private.current_instructor_id()
    and b.status = 'active'
    and sd.day >= p_from
  order by sd.day, b.hour, p.full_name;
$$;

comment on function public.get_my_slot_bookings(date) is
  'Aktywne zapisy na sloty zalogowanego instruktora od p_from: dzien, godzina, imie i nazwisko jezdzca (NULL - bez nazwiska albo zanonimizowany, wtedy anonymised), przydzielony kon (NULL - bez konia). Instruktor z private.current_instructor_id(): jezdziec, konto bez osrodka i instruktor zdezaktywowany dostaja zero wierszy (#72).';

revoke execute on function public.get_my_slot_bookings(date) from public, anon;
grant execute on function public.get_my_slot_bookings(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Zajetosc slotow: instruktor tylko dla swoich
-- ---------------------------------------------------------------------------

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
    and (private.reads_catalogue() or b.instructor_id = private.current_instructor_id())
  group by b.instructor_id, b.hour;
$$;

comment on function public.get_slot_occupancy(bigint, date) is
  'Liczba aktywnych zapisow na slot (instruktor x godzina) osrodka w danym dniu. Security definer: omija RLS bookings swiadomie, ale zwraca wylacznie liczby - bez rider_id ani zadnej tozsamosci jezdzca. Instruktor bez praw wlasciciela dostaje tylko swoje sloty (#72).';
