-- Migracja: anonimizacja zapisow przy usunieciu konta jezdzca (ADR-0001)
--
-- Stan sprzed migracji: bookings.rider_id NOT NULL ... ON DELETE CASCADE - usuniecie konta
-- kasowalo wszystkie zapisy jezdzca i zmienialo wstecz statystyki osrodka.
--
-- Regula (docs/adr/0001-anonimizacja-zapisow-przy-usunieciu-konta.md):
--   * przeszle zapisy - jazdy i odwolania - zostaja w bazie bez jezdzca,
--   * przyszle aktywne zapisy sa kasowane i zwalniaja sloty,
--   * "przeszly" = godzina slotu juz sie skonczyla w strefie Europe/Warsaw; to ta sama
--     granica co definicja jazdy w statystykach (src/lib/stats/stats.ts, slotEndedAt).
--
-- Dwa mechanizmy, oba w bazie:
--   1. klucz obcy bookings.rider_id -> profiles z ON DELETE SET NULL: zapis przezywa
--      usuniecie profilu i traci powiazanie z osoba,
--   2. trigger BEFORE DELETE na profiles: zanim klucz obcy odepnie jezdzca, kasuje jego
--      aktywne zapisy, ktorych godzina jeszcze sie nie skonczyla.
--
-- RLS na bookings nie wymaga zmian: polityka odczytu to "moj zapis LUB zapis w moim
-- grafiku", wiec zapis bez jezdzca widzi wylacznie osrodek, do ktorego nalezy dzien
-- (dowod: supabase/tests/rider_deletion_anonymisation.sql).

-- ---------------------------------------------------------------------------
-- Zapis moze nie miec jezdzca
-- ---------------------------------------------------------------------------

alter table public.bookings alter column rider_id drop not null;

alter table public.bookings drop constraint bookings_rider_id_fkey;

alter table public.bookings
  add constraint bookings_rider_id_fkey
  foreign key (rider_id) references public.profiles (id) on delete set null;

comment on column public.bookings.rider_id is
  'Jezdziec, ktory zlozyl zapis. NULL = jezdziec zanonimizowany: konto usunieto, zapis zostal w historii osrodka bez powiazania z osoba (ADR-0001).';
comment on constraint bookings_rider_id_fkey on public.bookings is
  'SET NULL, nie CASCADE - usuniecie konta jezdzca nie kasuje historii osrodka. Przyszle aktywne zapisy kasuje wczesniej trigger profiles_release_future_bookings.';

-- ---------------------------------------------------------------------------
-- Granica "godzina slotu juz sie skonczyla"
-- ---------------------------------------------------------------------------

create or replace function private.booking_slot_ended(p_day date, p_hour smallint, p_at timestamptz default now())
returns boolean
language sql
stable
set search_path = ''
as $$
  -- Porownanie czasu sciennego w strefie osrodka: slot (dzien, godzina) trwa godzine
  -- i konczy sie o (godzina + 1):00. Godzina trwajaca nie jest zakonczona; konczaca
  -- sie dokladnie teraz - jest.
  select p_day + make_interval(hours => p_hour + 1) <= (p_at at time zone 'Europe/Warsaw');
$$;

comment on function private.booking_slot_ended(date, smallint, timestamptz) is
  'Czy godzina slotu juz sie skonczyla wzgledem p_at, w strefie Europe/Warsaw. Ta sama granica co definicja jazdy w statystykach osrodka; p_at jest parametrem, zeby granice dalo sie sprawdzic na zadanym czasie.';

revoke execute on function private.booking_slot_ended(date, smallint, timestamptz) from public, anon;

-- ---------------------------------------------------------------------------
-- Trigger: usuniecie profilu zwalnia przyszle aktywne zapisy
-- ---------------------------------------------------------------------------

create or replace function public.release_future_bookings_of_deleted_profile()
returns trigger
language plpgsql
-- SECURITY DEFINER celowo: bookings nie ma polityki DELETE, a regula ma zadzialac
-- niezaleznie od tego, kto i jaka sciezka usuwa konto.
security definer
set search_path = ''
as $$
begin
  delete from public.bookings b
  using public.schedule_days sd
  where sd.id = b.schedule_day_id
    and b.rider_id = old.id
    and b.status = 'active'
    and not private.booking_slot_ended(sd.day, b.hour);

  -- Pozostale zapisy (jazdy oraz odwolania) odpina klucz obcy: ON DELETE SET NULL.
  return old;
end;
$$;

comment on function public.release_future_bookings_of_deleted_profile() is
  'ADR-0001: przy usunieciu konta jezdzca kasuje jego aktywne zapisy, ktorych godzina jeszcze sie nie skonczyla - sloty wracaja do puli. Przeszle zapisy zostaja i sa anonimizowane przez klucz obcy bookings_rider_id_fkey.';

revoke execute on function public.release_future_bookings_of_deleted_profile() from public, anon, authenticated;

create trigger profiles_release_future_bookings
before delete on public.profiles
for each row execute function public.release_future_bookings_of_deleted_profile();
