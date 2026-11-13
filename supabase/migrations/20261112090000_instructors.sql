-- Instruktorzy osrodka (#39, ADR-0002, GLOSSARY "Instruktor").
--
-- Instruktor to osoba prowadzaca jazdy, bez wlasnego konta - dodaje go i dezaktywuje
-- osrodek. Tabela jest czysto addytywna: grafik dnia, zapisy i strona jezdzca jej jeszcze
-- nie uzywaja (#40, #41).
--
-- Gwarancje w bazie:
--   * nazwa unikalna w osrodku bez wzgledu na wielkosc liter i spacje na brzegach, takze
--     wsrod nieaktywnych (`instructors_stable_name_key`, 23505),
--   * nazwy nie da sie zmienic: rola authenticated ma UPDATE wylacznie na kolumnie `active`,
--   * instruktora sie nie usuwa: brak polityki DELETE (dezaktywacja zamiast usuniecia,
--     zeby zostal przy dniach juz ulozonych i przy dawnych zapisach).
-- Dowod: supabase/tests/instructors_name_and_access.sql.

create table public.instructors (
  id bigint generated always as identity primary key,
  stable_id bigint not null references public.stables (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint instructors_id_stable_id_key unique (id, stable_id),
  constraint instructors_name_not_blank check (length(btrim(name)) > 0)
);

comment on table public.instructors is
  'Instruktor prowadzacy jazdy w osrodku. Bez konta; nazwa unikalna w osrodku i niezmienna; dezaktywowany, nigdy usuwany.';
comment on constraint instructors_id_stable_id_key on public.instructors is
  'Cel zlozonego klucza obcego z instruktorow pracujacych danego dnia (#40) - wymusza, ze instruktor i dzien grafiku naleza do tej samej stadniny.';

-- Unikalnosc nazwy jako indeks wyrazeniowy: Postgres nie przyjmuje wyrazen w ograniczeniu
-- UNIQUE. Nazwa indeksu jest kontraktem z aplikacja (src/lib/instructors/errors.ts).
-- Prowadzacy `stable_id` obsluguje tez listowanie instruktorow osrodka.
create unique index instructors_stable_name_key
  on public.instructors (stable_id, lower(btrim(name)));

alter table public.instructors enable row level security;

-- Zmienia sie wylacznie flaga aktywnosci. Odebranie UPDATE na pozostalych kolumnach
-- (nazwa, stadnina) dziala niezaleznie od polityk RLS.
revoke update on public.instructors from anon, authenticated;
grant update (active) on public.instructors to authenticated;

-- Jezdziec widzi nazwe instruktora przy slocie, wiec odczyt jest otwarty dla zalogowanych.
create policy instructors_select_authenticated
  on public.instructors
  for select
  to authenticated
  using (true);

create policy instructors_insert_own_stable
  on public.instructors
  for insert
  to authenticated
  with check (stable_id = (select private.current_stable_id()));

create policy instructors_update_own_stable
  on public.instructors
  for update
  to authenticated
  using (stable_id = (select private.current_stable_id()))
  with check (stable_id = (select private.current_stable_id()));
