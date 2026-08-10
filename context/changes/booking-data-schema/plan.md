# F-01 — Model danych rezerwacji z regułą braku dubla konia — Implementation Plan

## Overview

Zbudowanie warstwy danych całego MVP: tabele domenowe (profil z rolą, stadnina, konie, grafik dnia, zapisy), twarde ograniczenia integralności egzekwowane przez Postgresa oraz polityki RLS izolujące dane ośrodków. Do tego dane demo i typy TypeScript, żeby kolejne slice'y (S-01 … S-06) startowały z typowanych zapytań na wypełnionej bazie.

Kluczowy guardrail PRD — „żadnej podwójnej rezerwacji tego samego konia w tym samym slocie", odporny na współbieżność — mieszka w częściowym indeksie unikalnym, nie w kodzie aplikacji.

## Current State Analysis

- **Baza: pusta.** `supabase/config.toml` istnieje i repo jest zlinkowane ze zdalnym projektem (`supabase/.temp/linked-project.json` → ref `yghtipqggvpckhlkalsa`), ale katalog `supabase/migrations/` **nie istnieje**. F-01 tworzy pierwszą migrację w historii projektu.
- **Auth działa, ale nie zna ról.** `src/pages/api/auth/signup.ts:13` woła `supabase.auth.signUp({ email, password })` bez `options.data`. `src/env.d.ts` deklaruje wyłącznie `App.Locals.user`. Nie ma tabeli `profiles`, więc dziś nie ma gdzie zapisać roli ani na czym oprzeć jakiejkolwiek polityki RLS.
- **Klient SSR gotowy.** `src/lib/supabase.ts:9` tworzy `createServerClient` na kluczu anon z sesją w ciasteczkach — czyli zapytania trafiają do bazy jako rola `authenticated` z `auth.uid()` bieżącego użytkownika. To dokładnie ten model, którego wymaga pełne RLS.
- **Brak frameworku testów.** CI (`.github/workflows/ci.yml`) uruchamia `npm run lint` + `npm run build` na `main`, bez bazy. (Uwaga: `AGENTS.md:7` twierdzi, że CI działa na `master` — to zapis nieaktualny, naprawiony commitem `ef9062a`; plan koryguje go w fazie 4.)
- **`zod` figuruje w konwencjach (`AGENTS.md:33`), ale nie jest zainstalowany.** F-01 go nie potrzebuje (zero kodu aplikacji), więc instalacja zostaje slice'owi, który pierwszy przyjmie dane z formularza (S-01).
- **CLI Supabase jest w devDependencies** (`supabase ^2.23.4`), lokalny stack wymaga Dockera (`npx supabase start`). `project_id` w `config.toml` to nadal `10x-astro-starter` — z tego wynikają nazwy kontenerów lokalnych.

## Desired End State

Po zakończeniu planu:

1. Dwie migracje w `supabase/migrations/` odtwarzają cały model domeny od zera przez `npx supabase db reset`, a ten sam zestaw jest wypchnięty na zdalny projekt.
2. Próba wstawienia drugiego aktywnego zapisu na tę samą parę (koń, godzina) tego samego dnia kończy się błędem `23505` — także gdy obie próby lecą równolegle z osobnych połączeń.
3. Konto ośrodka nie jest w stanie odczytać ani zmodyfikować grafiku, koni ani zapisów cudzej stadniny — sprawdzone skryptem, nie tylko deklaracją.
4. `npx supabase db reset` ładuje `supabase/seed.sql`: jeden ośrodek z końmi, jeden jeździec, jeden dzień grafiku z zakresem godzin i przypisanymi końmi, jeden przykładowy zapis.
5. `src/db/database.types.ts` odzwierciedla schemat, `src/types.ts` eksportuje aliasy encji, `npm run lint` i `npm run build` przechodzą.

### Key Discoveries:

- **Reguła „koń pracuje tego dnia" da się wyrazić deklaratywnie.** Klucz obcy złożony z `bookings(schedule_day_id, horse_id)` do `schedule_day_horses(schedule_day_id, horse_id)` wymusza ją bez triggera — zapis nie może wskazać konia, którego ośrodek nie przydzielił do tego dnia.
- **Reguła „koń z tej samej stadniny co grafik" też.** `schedule_day_horses` niesie zdenormalizowane `stable_id` i wskazuje dwoma złożonymi kluczami obcymi na `horses(id, stable_id)` oraz `schedule_days(id, stable_id)` — baza sama pilnuje, że koń i dzień należą do jednej stadniny.
- **Reguła „godzina w zakresie pracy" wymaga triggera.** `CHECK` widzi tylko własny wiersz, a `open_hour`/`close_hour` leżą w `schedule_days`. To jedyne ograniczenie realizowane proceduralnie.
- **Polityki RLS muszą używać `(select auth.uid())`, nie `auth.uid()`** — inaczej funkcja jest wołana per wiersz (`references/security-rls-performance.md`, wpływ 5-10x).
- **Postgres nie zna `ADD CONSTRAINT IF NOT EXISTS`** (`references/schema-constraints.md`) — migracje idą jako `create table` z ograniczeniami inline, bez prób idempotencji w stylu `IF NOT EXISTS` na constraintach.
- Typy skalarne wg `references/schema-data-types.md`: `bigint generated always as identity` na kluczach głównych tabel domenowych, `text` zamiast `varchar(n)`, `timestamptz` zamiast `timestamp`, `date` na dzień grafiku. `profiles.id` jest wyjątkiem — musi być `uuid`, bo to klucz obcy do `auth.users(id)`.

## What We're NOT Doing

- **Żadnego kodu aplikacji**: bez endpointów, formularzy, stron, komponentów, walidatorów `zod`, warstwy `src/lib/services/`. F-01 kończy się na typach.
- **Bez rejestracji z wyborem roli w UI** — `signup.ts` nie jest ruszany; trigger czyta rolę z metadanych użytkownika i ma bezpieczny fallback. Podpięcie wyboru roli do formularza to S-01.
- **Bez tworzenia stadniny przez ośrodek** — tabela i polityki są, ale przepływ „załóż stadninę" należy do S-01/S-02.
- **Bez rozstrzygania Otwartego pytania #2 PRD** (co się dzieje z zapisami przy zmianie grafiku). Schemat celowo zajmuje pozycję zachowawczą: `on delete restrict` na kluczu z `bookings` do `schedule_day_horses` sprawia, że usunięcie konia z dnia mającego aktywne zapisy **nie przechodzi**. Zapisy nie mogą zniknąć po cichu, a S-02 musi świadomie zaprojektować ostrzeżenie — czego wprost wymaga kryterium akceptacji US-02.
- **Bez dziennego limitu godzin pracy konia** — PRD §Non-Goals, kandydat na v2.
- **Bez reguły „jeździec nie może mieć dwóch zapisów o tej samej godzinie"** — nie ma jej w guardrailach PRD; gdyby okazała się potrzebna, to drugi indeks częściowy w S-04, nie zmiana modelu.
- **Bez wpięcia testów bazy do CI** — obecny workflow nie ma bazy, a stawianie usługi Postgresa w GitHub Actions to osobna zmiana.
- **Bez zmiany `project_id` w `config.toml`** — kosmetyka, która przemianowałaby lokalne kontenery i uderzyła w skrypty tej zmiany.

## Implementation Approach

Model opiera się na trzech decyzjach z sesji planowania:

**Slot = `(schedule_day, horse, hour)`.** Godzina to `smallint` w zakresie 0-23, dzień to `date` w `schedule_days`. Żadnych `timestamptz` na slotach — PRD zamraża długość slotu na 1 h, a rozbicie na datę i godzinę usuwa całą klasę błędów o jedną godzinę przy zmianie czasu i sprowadza unikalność slotu do zwykłego indeksu.

**Godziny pracy jako półotwarty przedział `[open_hour, close_hour)`.** „Ośrodek pracuje 10–16" znaczy sloty 10, 11, 12, 13, 14, 15 — sześć jazd, ostatnia kończy się o 16. Ta konwencja jest zapisana w komentarzu kolumny w bazie, bo od niej zależy poprawność każdego wyliczenia wolnych slotów w S-04.

**Guardrail w indeksie, nie w kodzie.** `unique index … where status = 'active'` — druga równoległa próba dostaje `23505` niezależnie od liczby instancji Workera, a odwołanie zapisu (S-06) zwalnia slot jednym `UPDATE`, bez kasowania historii.

Dostęp: pełne RLS na wszystkich tabelach, aplikacja pracuje na kluczu anon z sesją użytkownika (tak jak dziś `src/lib/supabase.ts`). Dwie funkcje pomocnicze w schemacie `private` (`current_stable_id()`, `current_role()`) trzymają logikę „kim jest ten użytkownik" w jednym miejscu zamiast powielać podzapytanie w kilkunastu politykach.

## Critical Implementation Details

**Kolejność w fazie 1.** Trigger na `auth.users` musi być `security definer` z `set search_path = ''`, bo wykonuje się w kontekście wewnętrznego zapisu Supabase Auth, gdzie `public` nie jest w ścieżce wyszukiwania. Bez tego rejestracja użytkownika zacznie się wywalać na produkcji, a błąd zobaczysz dopiero jako „Database error saving new user" z Auth — nie w migracji.

**Schemat `private` a widoczność w API.** Funkcje pomocnicze idą do schematu `private`, którego nie ma na liście `api.schemas` w `config.toml` (`public`, `graphql_public`) — nie da się ich zawołać przez PostgREST. Rola `authenticated` musi jednak mieć `execute`, bo wyrażenia polityk RLS wykonują się z uprawnieniami użytkownika pytającego. Odbierz `execute` roli `anon` i `public`.

**Wpływ generowanych typów na lint.** `npm run lint` to ESLint z regułami typowanymi, a `supabase gen types` produkuje plik z konstrukcjami, które potrafią zapalić reguły. Jeśli lint się wywali na `src/db/database.types.ts`, dopisz ten plik do `ignores` w `eslint.config.js` — nie „naprawiaj" pliku generowanego ręcznie, bo następne wygenerowanie skasuje poprawki.

## Phase 1: Tożsamość i stadnina

### Overview

Pierwsza migracja: profil użytkownika z rolą (spięty z `auth.users` triggerem), stadnina, konie i polityki RLS dla tej trójki. Po tej fazie w bazie da się odpowiedzieć na pytanie „kim jest ten użytkownik i którą stadniną zarządza" — bez tego żadna kolejna polityka nie ma na czym się oprzeć.

### Changes Required:

#### 1. Migracja tożsamości i stadniny

**File**: `supabase/migrations/20260810090000_identity_and_stables.sql`

**Intent**: Utworzyć schemat `private` z funkcjami pomocniczymi do RLS oraz tabele `profiles`, `stables`, `horses` wraz z indeksami i politykami. Dzięki temu w bazie istnieje pojęcie roli i własności stadniny, na którym opiera się cały guardrail izolacji z PRD §Access Control.

**Contract**:

- `public.profiles` — `id uuid primary key references auth.users(id) on delete cascade`, `role text not null check (role in ('stable','rider'))`, `full_name text`, `created_at timestamptz not null default now()`.
- `public.stables` — `id bigint generated always as identity primary key`, `owner_id uuid not null references public.profiles(id) on delete cascade`, `name text not null`, `city text not null`, `description text`, `created_at timestamptz not null default now()`; `unique (owner_id)` (jedno konto ośrodka = jedna stadnina, zgodnie z „admin zarządza wyłącznie własnym ośrodkiem"); `unique (id, owner_id)` nie jest potrzebne.
- `public.horses` — `id bigint generated always as identity primary key`, `stable_id bigint not null references public.stables(id) on delete cascade`, `name text not null`, `notes text`, `active boolean not null default true`, `created_at timestamptz not null default now()`, plus **`unique (id, stable_id)`** — ten drugi, pozornie zbędny klucz unikalny jest celem złożonego klucza obcego z fazy 2 i bez niego faza 2 się nie skompiluje.
- `private.current_stable_id() returns bigint` i `private.current_role() returns text` — obie `language sql stable security definer set search_path = ''`, obie filtrują po `(select auth.uid())`; `grant execute … to authenticated`, `revoke … from anon, public`.
- Trigger `on auth.users after insert` wywołujący `public.handle_new_user()`:

```sql
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
    coalesce(nullif(new.raw_user_meta_data ->> 'role', ''), 'rider'),
    nullif(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;
```

  Fallback na `'rider'` jest świadomy: dopóki S-01 nie przekazuje roli w `options.data`, każda rejestracja daje konto jeźdźca zamiast błędu.

- Trigger `before update on public.profiles` blokujący zmianę `role` (jeździec nie awansuje się sam na ośrodek).
- Indeksy: `horses(stable_id)`. `stables(owner_id)` jest pokryty kluczem unikalnym.
- Polityki (`enable row level security` na każdej tabeli, polityki per operacja, wszystkie `to authenticated`, wszystkie predykaty przez `(select auth.uid())`):
  - `profiles`: SELECT — własny wiersz **lub** jeździec mający zapis w mojej stadninie (potrzebne dla FR-005, gdzie ośrodek widzi nazwisko jeźdźca); UPDATE — własny wiersz; brak INSERT/DELETE dla użytkowników (wiersze powstają triggerem, który omija RLS).
  - `stables`: SELECT — wszyscy zalogowani (katalog z FR-006); INSERT — `owner_id = (select auth.uid())` **i** `private.current_role() = 'stable'`; UPDATE/DELETE — tylko właściciel.
  - `horses`: SELECT — wszyscy zalogowani (jeździec musi widzieć imię konia w slocie); INSERT/UPDATE/DELETE — `stable_id = (select private.current_stable_id())`.

  Polityka SELECT na `profiles` odwołuje się do `bookings`, których jeszcze nie ma — dlatego jej wersja pełna powstaje dopiero w fazie 2. W fazie 1 wchodzi wariant minimalny („własny wiersz"), a faza 2 go zastępuje.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` przechodzi bez błędów i stosuje migrację
- Rejestracja użytkownika przez lokalne Auth tworzy wiersz w `public.profiles` z rolą `rider` (weryfikacja zapytaniem po `supabase db reset` + `auth.admin.createUser` albo wstawką testową)
- `npm run lint` przechodzi

#### Manual Verification:

- Zmiana `role` we własnym profilu jest odrzucana przez trigger
- Konto z rolą `rider` nie jest w stanie wstawić wiersza do `stables`

**Implementation Note**: Po tej fazie i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie ręcznego sprawdzenia, zanim przejdziesz dalej.

---

## Phase 2: Grafik dnia i rezerwacje

### Overview

Druga migracja: `schedule_days`, `schedule_day_horses`, `bookings` wraz z całym zestawem ograniczeń, które realizują regułę biznesową z PRD, oraz politykami RLS. Tu powstaje najważniejszy artefakt całej zmiany — częściowy indeks unikalny blokujący dubel konia.

### Changes Required:

#### 1. Migracja grafiku i zapisów

**File**: `supabase/migrations/20260810090100_schedule_and_bookings.sql`

**Intent**: Osadzić w bazie grafik dnia (zakres godzin + konie pracujące) oraz zapisy, tak by wszystkie trzy człony reguły alokacji z PRD §Business Logic — „godzina w zakresie pracy", „koń przydzielony na ten dzień", „slot niezajęty" — były egzekwowane przez bazę, a nie przez wołającego.

**Contract**:

- `public.schedule_days` — `id bigint generated always as identity primary key`, `stable_id bigint not null references public.stables(id) on delete cascade`, `day date not null`, `open_hour smallint not null check (open_hour between 0 and 23)`, `close_hour smallint not null check (close_hour between 1 and 24)`, `check (close_hour > open_hour)`, `created_at`/`updated_at timestamptz`; `unique (stable_id, day)`; `unique (id, stable_id)` jako cel złożonego klucza obcego. Komentarz kolumny `close_hour` zapisuje konwencję przedziału półotwartego: „zakres 10–16 daje sloty 10…15".
- `public.schedule_day_horses` — `schedule_day_id bigint not null`, `horse_id bigint not null`, `stable_id bigint not null`, `primary key (schedule_day_id, horse_id)`, dwa złożone klucze obce:

```sql
foreign key (schedule_day_id, stable_id)
  references public.schedule_days (id, stable_id) on delete cascade,
foreign key (horse_id, stable_id)
  references public.horses (id, stable_id) on delete cascade
```

  Zdublowane `stable_id` w obu kluczach jest tym, co uniemożliwia przypisanie cudzego konia do własnego dnia — bez tego trzeba by triggera.

- `public.bookings` — `id bigint generated always as identity primary key`, `schedule_day_id bigint not null`, `horse_id bigint not null`, `hour smallint not null check (hour between 0 and 23)`, `rider_id uuid not null references public.profiles(id) on delete cascade`, `status text not null default 'active' check (status in ('active','cancelled'))`, `cancelled_at timestamptz`, `created_at timestamptz not null default now()`, `check ((status = 'cancelled') = (cancelled_at is not null))`, oraz:

```sql
foreign key (schedule_day_id, horse_id)
  references public.schedule_day_horses (schedule_day_id, horse_id)
  on delete restrict
```

  `restrict` (nie `cascade`) jest decyzją świadomą — patrz „What We're NOT Doing".

- **Guardrail współbieżności** — jedyny obiekt, od którego zależy NFR PRD:

```sql
create unique index bookings_active_slot_key
  on public.bookings (schedule_day_id, horse_id, hour)
  where status = 'active';
```

- Trigger `before insert or update of hour, schedule_day_id on public.bookings` sprawdzający `hour >= open_hour and hour < close_hour` dla wskazanego dnia; przy naruszeniu `raise exception` z własnym `errcode` (np. `23514`), żeby S-04 mógł odróżnić „poza godzinami pracy" od „slot zajęty".
- Indeksy: `bookings(rider_id)` (polityka RLS jeźdźca), `bookings(schedule_day_id, hour)` (lista zapisów dnia z FR-005 i wyliczanie wolnych slotów), `schedule_day_horses(horse_id, stable_id)` (drugi klucz obcy — `references/schema-foreign-key-indexes.md`), `schedule_days(stable_id, day)` pokryty kluczem unikalnym.
- Polityki:
  - `schedule_days`, `schedule_day_horses`: SELECT — wszyscy zalogowani; INSERT/UPDATE/DELETE — `stable_id = (select private.current_stable_id())`.
  - `bookings`: SELECT — `rider_id = (select auth.uid())` **lub** dzień należy do mojej stadniny; INSERT — `rider_id = (select auth.uid())` i `private.current_role() = 'rider'`; UPDATE — własny zapis (odwołanie) lub zapis w mojej stadninie; brak DELETE (odwołanie to zmiana statusu).
- Zastąpienie polityki SELECT na `profiles` wersją pełną, dopuszczającą odczyt profilu jeźdźca, który ma zapis w mojej stadninie.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` przechodzi i stosuje obie migracje po kolei
- Drugi `insert` tego samego aktywnego slotu w jednej sesji kończy się błędem `23505`
- Zapis na godzinę spoza `[open_hour, close_hour)` jest odrzucany przez trigger
- Zapis wskazujący konia nieprzypisanego do tego dnia jest odrzucany przez klucz obcy (`23503`)
- Po `update … set status = 'cancelled', cancelled_at = now()` ten sam slot da się zapisać ponownie
- `npm run lint` przechodzi

#### Manual Verification:

- Próba usunięcia konia z dnia mającego aktywny zapis jest odrzucana (`restrict`) — potwierdza, że zapisy nie znikają po cichu

**Implementation Note**: Po tej fazie i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie ręcznego sprawdzenia, zanim przejdziesz dalej.

---

## Phase 3: Dane demo i dowód guardrailów

### Overview

Dane, na których widać, że model żyje, oraz dwa skrypty dowodzące dwóch obietnic F-01: braku dubla przy współbieżności i izolacji danych między ośrodkami. To jest ta część, której roadmapa oczekuje jako „ścieżki weryfikacji NFR współbieżności" dla S-04.

### Changes Required:

#### 1. Dane demo

**File**: `supabase/seed.sql`

**Intent**: Wypełnić lokalną bazę minimalnym, ale kompletnym stanem: dwa ośrodki (drugi istnieje wyłącznie po to, żeby było czego nie widzieć), jeździec, konie, jeden dzień grafiku z zakresem godzin i przypisanymi końmi, jeden aktywny zapis. Bez tego S-02 i S-03 zaczynają od klikania danych w panelu.

**Contract**: Wstawki do `auth.users` (hasło przez `crypt(…, gen_salt('bf'))`, `raw_user_meta_data` z rolą — profil powstanie triggerem z fazy 1), następnie `stables`, `horses`, `schedule_days`, `schedule_day_horses`, `bookings`. Stałe, jawnie wpisane UUID-y użytkowników, żeby skrypty z tej fazy mogły się do nich odwoływać. Dzień grafiku liczony jako `current_date + 1`, żeby seed nie starzał się z dnia na dzień.

#### 2. Dowód braku dubla przy współbieżności

**File**: `supabase/tests/concurrent_double_booking.sh`

**Intent**: Wystrzelić kilka jednoczesnych, niezależnych połączeń próbujących zapisać ten sam slot i sprawdzić, że dokładnie jedno kończy się sukcesem, a pozostałe dostają `23505`. Weryfikacja w jednej sesji (faza 2) dowodzi, że indeks istnieje; dopiero ta dowodzi wymagania NFR.

**Contract**: Skrypt bash uruchamiający N (domyślnie 5) równoległych `psql` przeciw lokalnej bazie (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, port z `config.toml`), zliczający kody wyjścia i kończący się niezerowo, jeśli liczba sukcesów ≠ 1. Przed startem czyści zapisy testowego slotu. Wymaga uruchomionego `npx supabase start`; jeśli `psql` nie ma na hoście, wariant zapasowy woła go przez `docker exec` w kontenerze bazy (nazwa pochodna od `project_id` z `config.toml`).

#### 3. Dowód izolacji ośrodków

**File**: `supabase/tests/rls_isolation.sql`

**Intent**: Potwierdzić, że konto ośrodka A nie odczyta ani nie zmieni grafiku, koni i zapisów ośrodka B — czyli że guardrail PRD §Access Control faktycznie działa, a nie tylko został opisany w migracji.

**Contract**: Skrypt wcielający się kolejno w obu właścicieli i jeźdźca:

```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid właściciela A>","role":"authenticated"}';
```

  a następnie asercje: `select` na cudzych `bookings` zwraca 0 wierszy, `update` cudzego `horses` dotyka 0 wierszy, `insert` do `schedule_days` z cudzym `stable_id` jest odrzucony przez `with check`. Każda asercja jako `do $$ … raise exception …` — skrypt ma się wywalić, gdy izolacja przecieka.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` ładuje `seed.sql` bez błędów i tworzy profile dla obu zasianych użytkowników
- `supabase/tests/concurrent_double_booking.sh` kończy się kodem 0 (dokładnie jeden sukces na 5 równoległych prób)
- `supabase/tests/rls_isolation.sql` przechodzi bez wyjątku

#### Manual Verification:

- Zalogowanie się w aplikacji (`npm run dev`) kontem ośrodka z seeda działa i `context.locals.user` zawiera właściwe id

**Implementation Note**: Po tej fazie i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie ręcznego sprawdzenia, zanim przejdziesz dalej.

---

## Phase 4: Typy, wypchnięcie na zdalny projekt i dokumentacja

### Overview

Domknięcie fundamentu: schemat trafia na zdalny projekt, a kod aplikacji dostaje typy, z których będą korzystać wszystkie kolejne slice'y. Plus poprawienie nieaktualnych zapisów w dokumentacji, na które kolejny agent by się nadział.

### Changes Required:

#### 1. Wygenerowane typy bazy

**File**: `src/db/database.types.ts`

**Intent**: Dać zapytaniom Supabase pełne typowanie, żeby S-01 i dalsze nie pisały nietypowanych odpowiedzi. Plik jest generowany — nigdy nie edytowany ręcznie.

**Contract**: Wynik `npx supabase gen types typescript --local`. Nagłówek pliku zawiera komentarz „plik generowany, nie edytować + komenda do regeneracji". Jeśli `npm run lint` zapala się na tym pliku, dopisz go do `ignores` w `eslint.config.js`.

#### 2. Typy domenowe

**File**: `src/types.ts`

**Intent**: Wystawić czytelne aliasy encji (`Profile`, `Stable`, `Horse`, `ScheduleDay`, `Booking`) wyprowadzone z typów generowanych, zgodnie z konwencją „shared types → `src/types.ts`" z `CLAUDE.md.scaffold:42`. Slice'y importują `@/types`, nie surowy plik generowany.

**Contract**: Aliasy typu `export type Booking = Database["public"]["Tables"]["bookings"]["Row"]` plus unia `UserRole = 'stable' | 'rider'`. Bez DTO warstwy API — te powstaną, gdy powstanie API.

#### 3. Wypchnięcie schematu na zdalny projekt

**File**: (operacja CLI, bez pliku)

**Intent**: Zrównać zdalny projekt `yghtipqggvpckhlkalsa` z migracjami z repo, żeby build i deploy z `main` działały przeciw właściwemu schematowi.

**Contract**: `npx supabase db push`. `seed.sql` **nie** leci na zdalny — dane demo są wyłącznie lokalne.

#### 4. Aktualizacja dokumentacji

**File**: `AGENTS.md`, `context/foundation/roadmap.md`

**Intent**: Naprawić zapis o CI (`AGENTS.md:7` mówi o `master`, workflow działa na `main`), dopisać do `AGENTS.md` sekcję o migracjach i skryptach weryfikacyjnych oraz przestawić status F-01 w roadmapie.

**Contract**: W `AGENTS.md` — korekta reguły o CI, wzmianka o `supabase/tests/` i o tym, że `src/db/database.types.ts` jest generowany. W `roadmap.md` — status F-01 z `ready` na `done` w tabeli „At a glance" i w sekcji F-01. Wpis w sekcji „Done" należy do `/10x-archive`, nie do tej fazy.

### Success Criteria:

#### Automated Verification:

- `npx supabase gen types typescript --local` generuje plik zawierający wszystkie pięć tabel
- `npm run lint` przechodzi
- `npm run build` przechodzi
- `npx supabase db push` kończy się sukcesem, a `npx supabase migration list` pokazuje obie migracje jako zastosowane lokalnie i zdalnie

#### Manual Verification:

- Import `Booking` z `@/types` podpowiada się w edytorze z właściwymi polami
- Tabele widoczne w panelu zdalnego projektu, RLS włączone na każdej z nich

**Implementation Note**: To ostatnia faza — po niej zmiana jest gotowa do przeglądu.

---

## Testing Strategy

### Unit Tests:

Brak — w projekcie nie ma frameworku testów jednostkowych, a F-01 nie dowozi kodu, który dałoby się nim objąć. Wprowadzenie frameworku zostaje slice'owi, który pierwszy napisze logikę w TypeScripcie (najpewniej S-04).

### Integration Tests:

Rolę testów integracyjnych pełnią skrypty z fazy 3, uruchamiane przeciw lokalnej bazie:

- `supabase/tests/concurrent_double_booking.sh` — NFR współbieżności (5 równoległych prób, oczekiwany dokładnie 1 sukces).
- `supabase/tests/rls_isolation.sql` — izolacja danych między ośrodkami i rolami.

Nie są wpięte do CI, bo obecny workflow nie stawia bazy. Uruchamiać świadomie po każdej zmianie schematu lub polityk.

### Manual Testing Steps:

1. `npx supabase start` (wymaga Dockera), następnie `npx supabase db reset` — migracje + seed powinny przejść bez błędu.
2. `bash supabase/tests/concurrent_double_booking.sh` — oczekiwany komunikat o dokładnie jednym sukcesie i kod wyjścia 0.
3. `psql … -f supabase/tests/rls_isolation.sql` — brak wyjątku.
4. Spróbować w panelu lokalnego Studia usunąć konia z dnia, który ma aktywny zapis — operacja ma zostać odrzucona.
5. `npm run dev` i zalogowanie kontem ośrodka z seeda — sesja działa, `dashboard.astro` się otwiera.

## Performance Considerations

Wolumen danych jest mały (PRD: `data_volume: small`, `qps: low`), więc jedyne realne zagrożenie to RLS wykonywane per wiersz. Stąd dwa twarde wymagania w migracjach: każde odwołanie do `auth.uid()` i funkcji pomocniczych opakowane w `(select …)`, oraz indeks na każdej kolumnie występującej w predykacie polityki (`horses.stable_id`, `bookings.rider_id`, `bookings.schedule_day_id`). Wyliczanie wolnych slotów w S-04 będzie skanować jeden dzień jednej stadniny — indeks `bookings(schedule_day_id, hour)` w zupełności to pokrywa.

## Migration Notes

Baza jest pusta, więc nie ma danych do przeniesienia — obie migracje to czyste `create`. Wycofanie na tym etapie oznacza po prostu `npx supabase db reset` lokalnie; na zdalnym projekcie, gdyby zaszła potrzeba, `drop table … cascade` w kolejności odwrotnej do zależności plus usunięcie triggera z `auth.users`. Warto zrobić to teraz, dopóki nie ma prawdziwych użytkowników — po pierwszym wdrożeniu zmiany schematu będą już wymagały migracji przyrostowych.

## References

- Roadmapa F-01: `context/foundation/roadmap.md:54-65`
- Reguła biznesowa i NFR współbieżności: `context/foundation/prd.md:96-108`
- Model dostępu i guardraile: `context/foundation/prd.md:42-45`, `context/foundation/prd.md:110-118`
- Konwencje migracji i typów: `CLAUDE.md.scaffold:39-42`, `AGENTS.md:17`
- Istniejący klient SSR i przepływ auth: `src/lib/supabase.ts:9`, `src/middleware.ts`, `src/pages/api/auth/signup.ts:13`
- Reguły Postgres: `supabase-postgres-best-practices/references/{security-rls-basics,security-rls-performance,schema-constraints,schema-data-types,schema-primary-keys,schema-foreign-key-indexes}.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tożsamość i stadnina

#### Automated

- [x] 1.1 `npx supabase db reset` przechodzi bez błędów i stosuje migrację — e2e3adc
- [x] 1.2 Rejestracja użytkownika tworzy wiersz w `public.profiles` z rolą `rider` — e2e3adc
- [x] 1.3 `npm run lint` przechodzi — e2e3adc

#### Manual

- [x] 1.4 Zmiana `role` we własnym profilu jest odrzucana przez trigger — e2e3adc
- [x] 1.5 Konto z rolą `rider` nie jest w stanie wstawić wiersza do `stables` — e2e3adc

### Phase 2: Grafik dnia i rezerwacje

#### Automated

- [x] 2.1 `npx supabase db reset` stosuje obie migracje po kolei
- [x] 2.2 Drugi `insert` tego samego aktywnego slotu kończy się błędem `23505`
- [x] 2.3 Zapis na godzinę spoza `[open_hour, close_hour)` jest odrzucany przez trigger
- [x] 2.4 Zapis na konia nieprzypisanego do dnia jest odrzucany przez klucz obcy (`23503`)
- [x] 2.5 Po odwołaniu zapisu ten sam slot da się zapisać ponownie
- [x] 2.6 `npm run lint` przechodzi

#### Manual

- [x] 2.7 Próba usunięcia konia z dnia mającego aktywny zapis jest odrzucana (`restrict`)

### Phase 3: Dane demo i dowód guardrailów

#### Automated

- [ ] 3.1 `npx supabase db reset` ładuje `seed.sql` i tworzy profile zasianych użytkowników
- [ ] 3.2 `supabase/tests/concurrent_double_booking.sh` kończy się kodem 0
- [ ] 3.3 `supabase/tests/rls_isolation.sql` przechodzi bez wyjątku

#### Manual

- [ ] 3.4 Logowanie kontem ośrodka z seeda działa w `npm run dev`

### Phase 4: Typy, wypchnięcie na zdalny projekt i dokumentacja

#### Automated

- [ ] 4.1 `supabase gen types` generuje plik zawierający wszystkie pięć tabel
- [ ] 4.2 `npm run lint` przechodzi
- [ ] 4.3 `npm run build` przechodzi
- [ ] 4.4 `npx supabase db push` kończy się sukcesem, `migration list` pokazuje obie migracje lokalnie i zdalnie

#### Manual

- [ ] 4.5 Import `Booking` z `@/types` podpowiada się z właściwymi polami
- [ ] 4.6 Tabele widoczne w panelu zdalnego projektu, RLS włączone na każdej
