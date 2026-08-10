-- Migracja: grafik dnia i rezerwacje (F-01, faza 2)
--
-- Zakres:
--   * public.schedule_days       - zakres godzin pracy osrodka na konkretna date
--   * public.schedule_day_horses - konie pracujace danego dnia
--   * public.bookings            - zapisy jezdzcow na slot (dzien x kon x godzina)
--   * czesciowy indeks unikalny blokujacy dubla konia w slocie
--   * trigger pilnujacy godziny w zakresie pracy osrodka
--   * RLS na wszystkich trzech tabelach + poszerzenie polityki odczytu profili
--
-- Regula biznesowa PRD ma trzy czlony i kazdy jest egzekwowany innym mechanizmem bazy:
--   1. "kon pracuje tego dnia"        -> zlozony klucz obcy bookings -> schedule_day_horses
--   2. "kon z tej samej stadniny"     -> zdenormalizowane stable_id w dwoch kluczach obcych
--   3. "godzina w zakresie pracy"     -> trigger (CHECK nie siega innego wiersza)
-- Na wierzchu tego siedzi czlon czwarty: "slot niezajety" -> czesciowy indeks unikalny.

-- ---------------------------------------------------------------------------
-- Wspolny trigger znacznika modyfikacji
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- public.schedule_days
-- ---------------------------------------------------------------------------

create table public.schedule_days (
  id bigint generated always as identity primary key,
  stable_id bigint not null references public.stables (id) on delete cascade,
  day date not null,
  open_hour smallint not null,
  close_hour smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_days_stable_id_day_key unique (stable_id, day),
  constraint schedule_days_id_stable_id_key unique (id, stable_id),
  constraint schedule_days_open_hour_check check (open_hour between 0 and 23),
  constraint schedule_days_close_hour_check check (close_hour between 1 and 24),
  constraint schedule_days_hours_order_check check (close_hour > open_hour)
);

comment on table public.schedule_days is
  'Grafik osrodka na konkretna date: zakres godzin pracy (FR-003).';
comment on column public.schedule_days.close_hour is
  'Godzina zamkniecia jako przedzial polotwarty [open_hour, close_hour). Zakres 10-16 daje sloty 10, 11, 12, 13, 14, 15 - szesc jazd, ostatnia konczy sie o 16.';
comment on constraint schedule_days_id_stable_id_key on public.schedule_days is
  'Cel zlozonego klucza obcego z schedule_day_horses - razem z horses_id_stable_id_key wymusza, ze kon i dzien naleza do tej samej stadniny.';

create trigger schedule_days_set_updated_at
before update on public.schedule_days
for each row execute function public.set_updated_at();

alter table public.schedule_days enable row level security;

-- ---------------------------------------------------------------------------
-- public.schedule_day_horses
-- ---------------------------------------------------------------------------

create table public.schedule_day_horses (
  schedule_day_id bigint not null,
  horse_id bigint not null,
  stable_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (schedule_day_id, horse_id),
  constraint schedule_day_horses_day_fkey
    foreign key (schedule_day_id, stable_id)
    references public.schedule_days (id, stable_id) on delete cascade,
  constraint schedule_day_horses_horse_fkey
    foreign key (horse_id, stable_id)
    references public.horses (id, stable_id) on delete cascade
);

comment on table public.schedule_day_horses is
  'Konie pracujace danego dnia (FR-004). Zdublowane stable_id w obu kluczach obcych uniemozliwia przypisanie cudzego konia do wlasnego dnia - bez tego potrzebny bylby trigger.';

create index schedule_day_horses_horse_id_stable_id_idx
  on public.schedule_day_horses (horse_id, stable_id);

alter table public.schedule_day_horses enable row level security;

-- ---------------------------------------------------------------------------
-- public.bookings
-- ---------------------------------------------------------------------------

create table public.bookings (
  id bigint generated always as identity primary key,
  schedule_day_id bigint not null,
  horse_id bigint not null,
  hour smallint not null,
  rider_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active',
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bookings_hour_check check (hour between 0 and 23),
  constraint bookings_status_check check (status in ('active', 'cancelled')),
  constraint bookings_cancelled_at_consistency_check
    check ((status = 'cancelled') = (cancelled_at is not null)),
  constraint bookings_scheduled_horse_fkey
    foreign key (schedule_day_id, horse_id)
    references public.schedule_day_horses (schedule_day_id, horse_id)
    on delete restrict
);

comment on table public.bookings is
  'Zapis jezdzca na slot (dzien x kon x godzina).';
comment on constraint bookings_scheduled_horse_fkey on public.bookings is
  'RESTRICT, nie CASCADE - usuniecie konia z dnia majacego aktywny zapis ma sie nie udac. Zapisy nie moga zniknac po cichu; decyzja co pokazac osrodkowi nalezy do S-02 (Otwarte pytanie #2 PRD).';

-- Guardrail wspolbieznosci: jedyny obiekt, od ktorego zalezy NFR PRD.
-- Druga rownolegla proba zapisu na ten sam slot dostaje 23505 niezaleznie od
-- liczby instancji aplikacji. Warunek na status sprawia, ze odwolanie zapisu
-- (S-06) natychmiast zwalnia slot, nie kasujac historii.
create unique index bookings_active_slot_key
  on public.bookings (schedule_day_id, horse_id, hour)
  where status = 'active';

create index bookings_rider_id_idx on public.bookings (rider_id);
create index bookings_schedule_day_id_hour_idx on public.bookings (schedule_day_id, hour);

alter table public.bookings enable row level security;

-- ---------------------------------------------------------------------------
-- Trigger: godzina w zakresie pracy osrodka
-- ---------------------------------------------------------------------------

create or replace function public.enforce_booking_within_working_hours()
returns trigger
language plpgsql
-- SECURITY DEFINER celowo: walidacja nie moze zalezec od tego, czy polityka
-- odczytu na schedule_days akurat pokazuje ten wiersz wolajacemu.
security definer
set search_path = ''
as $$
declare
  v_open smallint;
  v_close smallint;
begin
  select sd.open_hour, sd.close_hour
    into v_open, v_close
  from public.schedule_days sd
  where sd.id = new.schedule_day_id;

  if v_open is null then
    raise exception 'Grafik dnia o id % nie istnieje', new.schedule_day_id
      using errcode = '23503';
  end if;

  if new.hour < v_open or new.hour >= v_close then
    raise exception 'Godzina % jest poza zakresem pracy osrodka [%, %)', new.hour, v_open, v_close
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_booking_within_working_hours() is
  'Trzeci czlon reguly alokacji. Wlasny errcode 23514 pozwala S-04 odroznic "poza godzinami pracy" od "slot zajety" (23505).';

create trigger bookings_within_working_hours
before insert or update of hour, schedule_day_id on public.bookings
for each row execute function public.enforce_booking_within_working_hours();

-- ---------------------------------------------------------------------------
-- Funkcja pomocnicza: czy to jezdziec z zapisem w mojej stadninie
-- ---------------------------------------------------------------------------

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
      and sd.stable_id = (select private.current_stable_id())
  );
$$;

comment on function private.is_rider_of_my_stable(uuid) is
  'Uzywana przez polityke odczytu profili - osrodek musi widziec nazwisko jezdzca na liscie zapisow dnia (FR-005). SECURITY DEFINER omija zagniezdzone RLS na bookings.';

revoke execute on function private.is_rider_of_my_stable(uuid) from public, anon;
grant execute on function private.is_rider_of_my_stable(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Polityki RLS: schedule_days
-- ---------------------------------------------------------------------------

-- Grafik jest publiczny dla zalogowanych - jezdziec musi widziec godziny pracy osrodka.
create policy schedule_days_select_authenticated
  on public.schedule_days
  for select
  to authenticated
  using (true);

create policy schedule_days_insert_own_stable
  on public.schedule_days
  for insert
  to authenticated
  with check (stable_id = (select private.current_stable_id()));

create policy schedule_days_update_own_stable
  on public.schedule_days
  for update
  to authenticated
  using (stable_id = (select private.current_stable_id()))
  with check (stable_id = (select private.current_stable_id()));

create policy schedule_days_delete_own_stable
  on public.schedule_days
  for delete
  to authenticated
  using (stable_id = (select private.current_stable_id()));

-- ---------------------------------------------------------------------------
-- Polityki RLS: schedule_day_horses
-- ---------------------------------------------------------------------------

create policy schedule_day_horses_select_authenticated
  on public.schedule_day_horses
  for select
  to authenticated
  using (true);

create policy schedule_day_horses_insert_own_stable
  on public.schedule_day_horses
  for insert
  to authenticated
  with check (stable_id = (select private.current_stable_id()));

create policy schedule_day_horses_update_own_stable
  on public.schedule_day_horses
  for update
  to authenticated
  using (stable_id = (select private.current_stable_id()))
  with check (stable_id = (select private.current_stable_id()));

create policy schedule_day_horses_delete_own_stable
  on public.schedule_day_horses
  for delete
  to authenticated
  using (stable_id = (select private.current_stable_id()));

-- ---------------------------------------------------------------------------
-- Polityki RLS: bookings
-- ---------------------------------------------------------------------------

-- Jezdziec widzi swoje zapisy, osrodek widzi zapisy w swoim grafiku (FR-005).
create policy bookings_select_own_or_my_stable
  on public.bookings
  for select
  to authenticated
  using (
    rider_id = (select auth.uid())
    or exists (
      select 1
      from public.schedule_days sd
      where sd.id = bookings.schedule_day_id
        and sd.stable_id = (select private.current_stable_id())
    )
  );

create policy bookings_insert_own_as_rider
  on public.bookings
  for insert
  to authenticated
  with check (
    rider_id = (select auth.uid())
    and (select private.current_role()) = 'rider'
  );

-- Aktualizacja obsluguje odwolanie zapisu (S-06) po obu stronach.
create policy bookings_update_own_or_my_stable
  on public.bookings
  for update
  to authenticated
  using (
    rider_id = (select auth.uid())
    or exists (
      select 1
      from public.schedule_days sd
      where sd.id = bookings.schedule_day_id
        and sd.stable_id = (select private.current_stable_id())
    )
  )
  with check (
    rider_id = (select auth.uid())
    or exists (
      select 1
      from public.schedule_days sd
      where sd.id = bookings.schedule_day_id
        and sd.stable_id = (select private.current_stable_id())
    )
  );

-- Brak polityki DELETE: odwolanie zapisu to zmiana statusu, nie kasowanie wiersza.

-- ---------------------------------------------------------------------------
-- Poszerzenie polityki odczytu profili
-- ---------------------------------------------------------------------------

-- Wersja z fazy 1 pozwalala czytac wylacznie wlasny profil. Lista zapisow dnia
-- (FR-005) wymaga, zeby osrodek widzial takze profil jezdzca, ktory sie zapisal.
drop policy profiles_select_own on public.profiles;

create policy profiles_select_own_or_my_rider
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or private.is_rider_of_my_stable(id)
  );
