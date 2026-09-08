# Gwarancje bazodanowe w CI — plan implementacji

## Overview

Trzy ręcznie uruchamiane dowody gwarancji bazodanowych (`supabase/tests/`) stają się bramką CI odpalaną na każdy push i PR do `main`. Mutacje w testach idą przez RLS jako persony z seeda, a nie jako `postgres`, żeby test dowodził tego, co widzi aplikacja. Dwie rozbieżności między kodem a PRD zostają rozstrzygnięte (odwołany zapis przypina konia do dnia — akceptujemy i utrwalamy; cichy sukces w `toggle-active` — naprawiamy), a test-plan §6.2 dostaje wzorzec „jak dodać test integracyjny bazy”. To faza 1 rolloutu z `context/foundation/test-plan.md` §3; pokrywa ryzyka #1, #2, #4.

## Current State Analysis

Z `research.md` (pełne odniesienia tam):

- **Gwarancje siedzą w Postgresie**, aplikacja tylko tłumaczy SQLSTATE na komunikaty. Brak klienta service-role w `src/`; każdy zapis idzie z sesji użytkownika przez RLS (`src/lib/supabase.ts:6-27`).
  - #1: częściowy indeks unikalny `bookings_active_slot_key` (`supabase/migrations/20260810090100_schedule_and_bookings.sql:122-124`) → `23505`.
  - #2: trigger `schedule_days_protect_bookings` (`SB001`/`SB002`, liczy tylko `status = 'active'`, `20260811090000:23-82`) + FK `bookings_scheduled_horse_fkey ... on delete restrict` (`23503`, `20260810090100:107-110`).
  - #4: polityki RLS na `auth.uid()` i `private.current_stable_id()` / `private.current_role()`; middleware pilnuje tylko stron, `/api/**` polega na RLS i jawnych filtrach.
- **Trzy skrypty istnieją i zwracają kody wyjścia**: `concurrent_double_booking.sh` (N procesów `psql`, `exit "$status"`), `rls_isolation.sql` i `schedule_change_guardrails.sql` (`\set ON_ERROR_STOP on`, `raise exception` → exit ≠ 0, `rollback`). Dwa z nich (#1, #2) mutują jako `postgres`, więc RLS jest pominięte. `schedule_change_guardrails.sql:30-34` wybiera zapis przez `limit 1` bez `order by` — niedeterministycznie.
- **CI nie stawia bazy**: `.github/workflows/ci.yml` — job `ci` (lint, `npm test`, build) i `deploy` (`needs: [ci]`, push do main). `ubuntu-latest` ma `psql` 16 i Dockera; `npx supabase db start` stawia samego Postgresa z migracjami i `seed.sql`.
- **Seed jest deterministyczny dla CI**: stałe UUID kont (`1111…` Pod Dębem, `2222…` Nad Rzeką, `3333…` Anna, `4444…` Piotr), dni na `current_date + 1`, po jednym aktywnym zapisie na stadninę. Id stadnin/koni/dni są identity — szukać po nazwie lub owner uuid.
- **Luki odsłonięte przez research**:
  - `src/lib/schedule/queries.ts:95-112` pre-check filtruje `status = 'active'`, a FK RESTRICT liczy też odwołane → przy koniu z samym odwołanym zapisem godziny zapisują się (krok 3), a wypisanie konia odpada (krok 4) z mylącym komunikatem.
  - `src/pages/api/horses/toggle-active.ts:46-56` — UPDATE bez `.select()`; 0 wierszy po filtrze RLS kończy się przekierowaniem bez błędu.
- Test-plan §6.2 to „TBD”; `AGENTS.md:7` twierdzi, że CI robi tylko lint + build (nieaktualne — `npm test` już biegnie).

## Desired End State

Po wdrożeniu:

1. Każdy push i PR do `main` uruchamia job `db-tests`, który stawia lokalnego Postgresa Supabase, ładuje migracje i seed, i odpala `npm run test:db`. Czerwony `db-tests` blokuje `deploy`.
2. `npm run test:db` lokalnie (przy działającym stacku) i w CI przechodzi przez trzy skrypty i kończy się kodem ≠ 0, gdy którykolwiek padnie.
3. Skrypt współbieżności wstawia jako dwoje różnych jeźdźców przez RLS: dokładnie 1 sukces, każda odmowa to `23505` na `bookings_active_slot_key`, na slocie dokładnie 1 aktywny zapis; po odwołaniu zwycięzcy ponowny zapis przechodzi.
4. Skrypt strażnika grafiku edytuje jako właściciel Pod Dębem przez RLS; po każdej odmowie zapis jest nietknięty; odwołany zapis nie blokuje zawężenia godzin, ale przypina konia do dnia (decyzja zaakceptowana, opisana w PRD); obcy właściciel dotyka 0 wierszy.
5. Skrypt izolacji pokrywa dodatkowo: jeźdźca piszącego do tabel ośrodka, ośrodek wstawiający zapis, obce `schedule_days` / `schedule_day_horses` (UPDATE/DELETE/INSERT), odwołanie cudzego zapisu po `id`.
6. `POST /api/horses/toggle-active` z obcym `horseId` przekierowuje z `?error=` i nie zmienia danych.
7. Pre-check wypisania konia w aplikacji zgadza się z FK (liczy wszystkie zapisy), więc odmowa pada przed jakimkolwiek zapisem.
8. Test-plan §6.2 opisuje wzorzec; §3 wiersz Fazy 1 → `complete`; §5 bramka integracyjna → `required`; AGENTS.md mówi prawdę o CI i sposobie uruchamiania.

Weryfikacja końcowa: `gh run list --limit 1` pokazuje zielony run z jobami `ci`, `db-tests`, `deploy`; lokalnie `npm run test:db` PASS; sabotaż każdej gwarancji (drop indeksu / triggera / wyłączenie RLS) czerwieni odpowiedni skrypt.

### Key Discoveries:

- Wzorzec impersonacji bez GoTrue już istnieje i jest zgodny z dokumentacją Supabase: `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'` (`supabase/tests/rls_isolation.sql:17-19`). `reset role` w tej samej transakcji wraca do `postgres`.
- `get diagnostics v = row_count` po UPDATE/DELETE to jedyny sposób odróżnienia „RLS odfiltrowało” od „przeszło” (`rls_isolation.sql:31-36`). Dla właściciela trzeba też asertować `row_count = 1`, inaczej test nie dowodzi, że mutacja w ogóle dotarła do triggera.
- `psql -c` z kilkoma instrukcjami wykonuje je w jednej implicit transakcji, więc `set role` + `set request.jwt.claims` + `insert` w jednym `-c` działa w każdym z N procesów skryptu współbieżności.
- `psql -v VERBOSITY=verbose` dodaje SQLSTATE do stderr (`ERROR:  23505: ...`), co pozwala asertować kod, a nie tylko nazwę indeksu.
- Wzorzec wykrywania 0 wierszy w aplikacji: `.select("id").maybeSingle()` i `data !== null` (`src/lib/bookings/queries.ts:180-193`), odmowa jako „nie znaleziono” (`src/pages/api/bookings/cancel.ts:53-55, 66-69`).
- `supabase db start` nie startuje GoTrue — logowanie przez supabase-js jest niemożliwe, impersonacja w SQL wystarcza. Nie ma w tym planie żadnej migracji.

## What We're NOT Doing

- **Nie zmieniamy schematu ani polityk RLS.** Żadnej migracji. Polityka `bookings_update_own_or_my_stable` (ośrodek może edytować zapisy własnej stadniny) zostaje — PRD mówi, że ośrodek modyfikuje dane własnej stadniny; FR-009 daje odwołanie jeźdźcowi jako funkcję, nie zakaz dla ośrodka. Odmowa w `cancel.ts` to zachowanie endpointu → test HTTP w Fazie 2 rolloutu.
- **Nie naprawiamy asymetrii FK RESTRICT vs. odwołane zapisy.** Decyzja: odwołany zapis świadomie przypina konia do dnia (historia zapisów zostaje przy koniu). Utrwalamy to testem i zdaniem w PRD; wyrównujemy tylko pre-check w aplikacji.
- **Nie piszemy testów HTTP ani harnessu z serwerem Astro / GoTrue.** Scenariusze #4 dowodliwe tylko przez HTTP (jeździec woła endpoint ośrodka, cichy sukces `toggle-active`, ośrodek odwołuje zapis) idą do Fazy 2 (§6.4). Tu poprawka `toggle-active` ma weryfikację manualną.
- **Nie przepisujemy skryptów na Vitest ani pgTAP.** Harness to psql + bash (decyzja z pytań); Vitest integracyjny rozważy Faza 2, jeśli testy endpointów go potrzebują.
- **Nie zmieniamy obecnej semantyki `on delete restrict` przy usuwaniu całego dnia** ani nie dodajemy triggera na `schedule_day_horses`.
- **Nie robimy transakcyjnego RPC dla zapisu grafiku** (decyzja z archiwum S-02, Fix A). Okno wyścigu między pre-checkiem a zapisem zostaje udokumentowane, nie zamknięte.
- **Nie dotykamy `horses.active`** — dezaktywacja konia nie wpływa na przydziały ani zapisy; odnotowane w research, poza zakresem.
- Nie konfigurujemy hooków per-edit (Faza 3 rolloutu), nie piszemy Playwrighta.

## Implementation Approach

Najpierw bramka na istniejących skryptach (Faza 1) — zero zmian semantycznych, żeby zobaczyć zieloną bramkę i zmierzyć czas. Potem jeden skrypt na fazę, każdy w tej samej kolejności: setup danych jako `postgres`, mutacja jako persona przez `set local role authenticated` + claims, asercja na SQLSTATE **i** `row_count` **i** ponowny odczyt stanu, `rollback`. Każda faza kończy się „sabotażem” — celowym wyłączeniem strażnika lokalnie, który musi zaczerwienić skrypt — bo test, który nie potrafi paść, nic nie dowodzi. Zmiany w aplikacji są dwie i małe, oba wg istniejących wzorców. Faza 5 zamyka cookbook i dokumenty.

Oracle: PRD (Guardrails, NFR współbieżności, Access Control, Open Question #2 po doprecyzowaniu). Asercje nazywają kody i stan po operacji, nie polskie komunikaty — te są już pokryte unit testami w `errors.test.ts`.

## Critical Implementation Details

**Kolejność i cykl życia.** `npx supabase db start` wraca po health-checku Postgresa, ale runner skryptów powinien mimo to zrobić krótką pętlę `pg_isready`/`select 1` przed pierwszym testem — na zimnym runnerze pierwsze połączenie po starcie bywa odrzucane. Skrypty muszą iść sekwencyjnie: `rls_isolation.sql` wstawia (i cofa) zapis Anny na Pod Dębem jutro, a skrypt współbieżności usuwa i wstawia na Kasztan@12 bez transakcji — równoległe uruchomienie mogłoby się zderzyć.

**Persony w transakcji.** `set local role` i `set local request.jwt.claims` obowiązują do końca transakcji; przełączenie persony w środku tego samego `begin … rollback` to kolejne `set local`, a powrót do superusera to `reset role`. Setup danych (np. wstawienie odwołanego zapisu) musi się wykonać **przed** pierwszym `set local role`, a odczyt kontrolny po odmowie może iść jako właściciel (polityka SELECT pokazuje zapisy własnej stadniny) albo po `reset role`.

**Sabotaż jako weryfikacja manualna.** Każdy sabotaż wykonuje się na lokalnym stacku i cofa przez `npx supabase db reset`. Nigdy w CI.

**Świeżość seeda lokalnie.** Seed ładuje dni na `current_date + 1` w chwili `db reset`; po dobie te dni to „dziś”, a po dwóch — przeszłość. Każde lokalne uruchomienie testów wymaga seeda z tego samego dnia; strażnik w `run_all.sh` (Faza 1) pilnuje tego jawnie, a setup Fazy 3 może polegać na `current_date + 1` tylko dzięki niemu. W CI problem nie istnieje.

## Phase 1: Runner i bramka CI

### Overview

Zebrać trzy istniejące skrypty pod jedną komendą i uruchomić ją w nowym jobie CI równoległym do `ci`, na który czeka `deploy`. Bez zmian w treści testów — celem jest zielona bramka i zmierzony czas.

### Changes Required:

#### 1. Runner skryptów

**File**: `supabase/tests/run_all.sh` (nowy)

**Intent**: Jedno wejście dla lokalnego użycia i CI: czeka na bazę, odpala trzy skrypty po kolei tym samym `DB_URL`, raportuje PASS/FAIL per skrypt i kończy kodem ≠ 0, jeśli którykolwiek padł (uruchamia wszystkie, nie przerywa na pierwszym — żeby log z CI pokazał pełny obraz).

**Contract**: bash, `set -uo pipefail`; `DB_URL` z domyślną `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (jak w `concurrent_double_booking.sh:16`).
- **Detekcja klienta** (plan-review F1): ta sama logika co w `concurrent_double_booking.sh:19-31` — hostowy `psql "$DB_URL"`, a w razie jego braku `docker exec -i supabase_db_<project_id> psql -U postgres -d postgres` (project_id z `config.toml`). Wyodrębnić ją do `supabase/tests/_psql.sh` source'owanego przez runner i skrypt współbieżności, żeby była w jednym miejscu. Na maszynie autora nie ma hostowego `psql` (zweryfikowane), więc lokalnie idzie gałąź kontenerowa; w CI hostowa. Pliki `.sql` podawać przez **stdin** (`psql_run -v ON_ERROR_STOP=1 -q < <plik>`), nie `-f` — działa identycznie w obu gałęziach i omija mangling ścieżek w Git Bash.
- **Pętla gotowości** (do ~30 s) na `select 1`.
- **Strażnik świeżości seeda** (plan-review F2): przed testami `select exists (select 1 from public.schedule_days where day = current_date + 1)`; gdy `false` — komunikat „Seed jest nieaktualny (dni z seeda nie są na jutro). Uruchom `npx supabase db reset`.” i `exit 1`. Powód: seed liczy `current_date + 1` w momencie ładowania, a lokalna baza po dobie ma dni na „dziś” — filtry `current_date + 1` w skryptach zwracają wtedy 0 wierszy (zweryfikowane 2026-09-08 na lokalnym stacku). W CI wolumen jest zawsze świeży.
- Kolejność: `rls_isolation.sql`, `schedule_change_guardrails.sql`, `concurrent_double_booking.sh` (ten ostatni dostaje `DB_URL` i korzysta z tej samej detekcji). Uruchamia wszystkie, drukuje podsumowanie PASS/FAIL per skrypt, `exit` z liczbą porażek ograniczoną do 1.

#### 2. Skrypt npm

**File**: `package.json`

**Intent**: Nazwać komendę, którą poda cookbook i CI.

**Contract**: `"test:db": "bash supabase/tests/run_all.sh"` obok istniejącego `"test"`. `npm test` pozostaje bez usług (`vitest.config.ts:4-6`).

#### 3. Job CI

**File**: `.github/workflows/ci.yml`

**Intent**: Nowy job `db-tests` równoległy do `ci`; `deploy` czeka na oba. Stawiamy samego Postgresa — to wszystko, czego skrypty potrzebują.

**Contract**: job `db-tests` na `ubuntu-latest`: `actions/checkout@v4`, `actions/setup-node@v4` (`node-version-file: .nvmrc`, `cache: npm`), `npm ci`, `npx supabase db start`, `npm run test:db`. CLI pochodzi z `node_modules` (wersja z lockfile, ta sama co lokalnie) — bez `supabase/setup-cli`. `deploy.needs: [ci, db-tests]`. Sekrety `SUPABASE_URL`/`SUPABASE_KEY` nie są potrzebne w `db-tests`. Triggery bez zmian (push + PR do `main`).

#### 4. Nagłówki skryptów

**File**: `supabase/tests/concurrent_double_booking.sh`, `supabase/tests/rls_isolation.sql`, `supabase/tests/schedule_change_guardrails.sql`

**Intent**: Linia „Uzycie” w każdym nagłówku wskazuje `npm run test:db` jako główną drogę, a `docker exec` jako alternatywę bez hostowego `psql`.

**Contract**: tylko komentarze; treść testów nietknięta.

### Success Criteria:

#### Automated Verification:

- Lokalnie przy działającym stacku i seedzie: `npm run test:db` kończy się kodem 0 i drukuje trzy PASS
- `npm run lint` zielony (YAML i bash nie są lintowane, ale `package.json` przechodzi przez prettier w pre-commit)
- Po pushu: `gh run watch` pokazuje zielone joby `ci`, `db-tests`, `deploy`; job `db-tests` mieści się w ~3 min

#### Manual Verification:

- W logu `db-tests` widać wyjście `supabase db start` (migracje + seed) i trzy nagłówki `===` ze skryptów
- Celowo zepsuty skrypt (np. lokalnie `exit 1` w `run_all.sh` po pierwszym pliku) daje kod ≠ 0 z `npm run test:db`, a pozostałe skrypty i tak się wykonały

**Implementation Note**: Po zakończeniu tej fazy i przejściu automatycznej weryfikacji zatrzymaj się na potwierdzenie manualne (zielony run w GitHub), zanim ruszysz dalej. Checkboxy do tych punktów są w `## Progress` na dole.

---

## Phase 2: Ryzyko #1 — współbieżność pod RLS

### Overview

Skrypt współbieżności wstawia jako dwoje różnych jeźdźców przez RLS, asertuje kod `23505` i nazwę indeksu, dokładnie jeden aktywny zapis, a potem dowodzi, że odwołanie zwalnia slot (predykat indeksu częściowego, nie sama unikalność).

### Changes Required:

#### 1. Skrypt współbieżności

**File**: `supabase/tests/concurrent_double_booking.sh`

**Intent**: Każdy z N procesów `psql` działa jako jeździec (nieparzyste próby Anna `3333…`, parzyste Piotr `4444…`) przez `set role authenticated` + `request.jwt.claims`, z `rider_id` równym `sub` z claims — tak jak wymaga polityka `bookings_insert_own_as_rider`. Setup i odczyt kontrolny zostają jako `postgres`.

**Contract**:
- Zachować: wybór slotu (Pod Dębem, Kasztan, 12 — wolny w seedzie), czyszczenie slotu przed i po, `pg_sleep(0.5)` jako barierę, `wait` per PID, zliczanie sukcesów/odmów, `exit "$status"`.
- Zmienić string `-c` każdej próby na sekwencję: `set role authenticated; set request.jwt.claims = '<json z sub jeźdźca>'; select pg_sleep(0.5); insert … rider_id = '<ten sam uuid>'`. Dodać `-v VERBOSITY=verbose`, żeby stderr niósł SQLSTATE.
- Asercje: `successes == 1`; `active == 1` (jako `postgres`); każda odmowa ma w stderr **zarówno** `23505` **jak i** `bookings_active_slot_key` — odmowa z innym kodem (`42501`, `23503`, `23514`) to błąd konfiguracji testu i FAIL z wypisaniem stderr.
- Ścieżka zwolnienia slotu: jako `postgres` odwołać zwycięzcę (`status='cancelled', cancelled_at=now()` na aktywnym zapisie slotu); jako Anna (przez `set role` + claims) wstawić ponownie na ten sam slot — musi przejść; `active == 1` ponownie; `get_taken_slots(<stable Pod Dębem>, current_date + 1)` wywołane jako Anna **zawiera dokładnie jeden wiersz z `(horse_id = Kasztan, hour = 12)`** — bez asercji na łączną liczbę wierszy, bo funkcja zwraca też seedowy zapis Anny (Bella@11) (plan-review F3). Wszystko z asercjami i sprzątaniem na końcu (usunięcie obu zapisów testowych).
- Zaktualizować nagłówek: co dowodzi, jako kto, `ATTEMPTS` i `DB_URL`.

### Success Criteria:

#### Automated Verification:

- `npm run test:db` PASS lokalnie (z domyślnym `ATTEMPTS=5`)
- `ATTEMPTS=20 bash supabase/tests/concurrent_double_booking.sh` PASS lokalnie — większa presja, ten sam wynik
- Push → `db-tests` zielony

#### Manual Verification:

- Sabotaż: lokalnie `drop index public.bookings_active_slot_key`, uruchomić skrypt → FAIL (więcej niż 1 sukces / więcej niż 1 aktywny); `npx supabase db reset` przywraca
- Sabotaż 2: zamienić claims na uuid ośrodka (`1111…`) w jednej próbie → ta próba odpada z `42501`, skrypt raportuje FAIL „odmowa z innego powodu” — dowód, że test odróżnia RLS od dubla

**Implementation Note**: Zatrzymaj się po sabotażach na potwierdzenie manualne przed Fazą 3.

---

## Phase 3: Ryzyko #2 — strażnik grafiku pod RLS i domknięcie asymetrii

### Overview

Skrypt strażnika grafiku edytuje jako właściciel Pod Dębem przez RLS na deterministycznie wybranym dniu, po każdej odmowie czyta zapis ponownie, dodaje przypadki z odwołanym zapisem (nie blokuje godzin; przypina konia — zaakceptowane) i obcego właściciela. Aplikacja i PRD zostają wyrównane do zaakceptowanej semantyki.

### Changes Required:

#### 1. Skrypt strażnika grafiku

**File**: `supabase/tests/schedule_change_guardrails.sql`

**Intent**: Przepisać strukturę na: setup jako `postgres` → mutacje jako właściciel `1111…` → jedna próba jako obcy właściciel `2222…` → `rollback`. Zastąpić `limit 1` deterministycznym wyborem dnia Pod Dębem na `current_date + 1` przez `stables.owner_id = '1111…'`.

**Contract**:
- Jedna transakcja `begin … rollback`, `\set ON_ERROR_STOP on`, licznik porażek i końcowy `raise exception` jak dziś.
- Setup (`postgres`): id dnia, id Belli i Kasztana, id zapisu Anny (Bella@11); **wstawić odwołany zapis** Anny na Kasztan@12 (`status='cancelled', cancelled_at=now()`); zapamiętać id-y przez `set_config('app.<nazwa>', …, true)` (widoczne po zmianie roli przez `current_setting`).
- Blok właściciela (`set local role authenticated` + claims `1111…`), przypadki:
  1. `close_hour = 11` → `SB002`; ponowny odczyt: zapis Anny `status='active'`, `hour=11`, ten sam `schedule_day_id`/`horse_id`; dzień nadal 10–16.
  2. Rozszerzenie 8–20 → przechodzi z `row_count = 1` (dowód, że RLS wpuściło właściciela do UPDATE), potem przywrócić 10–16.
  3. `day = day + 7` → `SB001`; zapis nietknięty.
  4. Insert pustego dnia `current_date + 30` i zmiana jego daty → przechodzi.
  5. Delete przydziału Belli → `23503`; przydział i zapis nadal istnieją.
  6. Delete całego dnia → `23503`.
  7. **Nowy**: `close_hour = 12` (odcina tylko odwołany Kasztan@12; Bella@11 zostaje w zakresie) → **przechodzi** z `row_count = 1`; odwołany zapis nietknięty; przywrócić 16.
  8. **Nowy, zaakceptowane zachowanie**: delete przydziału Kasztana (ma tylko odwołany zapis) → `23503`. Komentarz w skrypcie: decyzja 2026-09-08 — odwołane zapisy przypinają konia do dnia, historia zostaje przy koniu; zmiana tego zachowania wymaga zmiany schematu i tego testu.
- Blok obcego właściciela (`set local request.jwt.claims` z `2222…` w tej samej transakcji): `update schedule_days set close_hour = 11 where id = <dzień Pod Dębem>` → `row_count = 0` i **brak** wyjątku (RLS filtruje przed triggerem) — to wiąże #2 z #4.
- Nagłówek: dodać opis persony, przypadki 7–8 i odwołanie do PRD Open Question #2.

#### 2. Pre-check w aplikacji zgodny z FK

**File**: `src/lib/schedule/queries.ts`

**Intent**: `assertRemovedHorsesHaveNoBookings` liczy dziś tylko aktywne zapisy, a FK RESTRICT liczy wszystkie — przez to przy koniu z samym odwołanym zapisem godziny zapisują się, zanim wypisanie konia odpadnie. Pre-check ma odmawiać w tej samej sytuacji co baza, żeby odmowa padła przed pierwszym zapisem.

**Contract**: usunąć filtr `status = 'active'` z zapytania w pre-checku (`:95-112`) i poprawić docblock (`:114-121`) — „liczy wszystkie zapisy, także odwołane, bo tak liczy FK RESTRICT”. `APP002` bez zmian. Okno wyścigu między pre-checkiem a zapisem zostaje (decyzja z archiwum S-02).

#### 3. Komunikat dla ośrodka

**File**: `src/lib/schedule/errors.ts`

**Intent**: Komunikat dla `APP002`/`23503` radzi dziś „najpierw doprowadź do ich odwołania”, co przy odwołanym zapisie jest niewykonalne. Ma mówić prawdę: koń z jakimkolwiek zapisem w tym dniu (także odwołanym) zostaje przypięty; wypisać można konia bez zapisów.

**Contract**: komunikat nadal zawiera słowo „konia” i różni się od komunikatu godzin (istniejące testy), nie obiecuje, że odwołanie zapisu odblokuje wypisanie. Docblock stałej `FOREIGN_KEY_VIOLATION` uzupełnić o odwołane zapisy.

#### 4. Unit testy komunikatów

**File**: `src/lib/schedule/errors.test.ts`

**Intent**: `APP001` i `APP002` nie mają dziś testów. Dodać po jednym przypadku: `APP001` daje komunikat o cudzym koniu, różny od `APP002`; `APP002` daje ten sam komunikat co `23503` i zawiera „konia”.

**Contract**: styl pliku — polskie `it()`, bez mocków; importy `HORSE_NOT_IN_STABLE`, `HORSE_HAS_BOOKINGS`.

#### 5. Doprecyzowanie PRD

**File**: `context/foundation/prd.md`

**Intent**: Open Question #2, podpunkt „Konie”, dostaje zdanie utrwalające decyzję: przydział konia do dnia, do którego odnosi się jakikolwiek zapis (aktywny lub odwołany), nie może zostać usunięty — historia zapisów zostaje przy koniu; zawężenie godzin pomija odwołane zapisy. Z datą 2026-09-08.

**Contract**: edycja w miejscu (`prd.md:131-135`), bez zmiany innych sekcji; PRD to żywy dokument (AGENTS.md).

### Success Criteria:

#### Automated Verification:

- `npm run test:db` PASS lokalnie (przypadki 1–8 + obcy właściciel)
- `npm test` zielony z nowymi testami `APP001`/`APP002`
- `npm run lint` zielony
- Push → `db-tests` i `ci` zielone

#### Manual Verification:

- Sabotaż: `drop trigger schedule_days_protect_bookings on public.schedule_days` → przypadki 1 i 3 FAIL; `db reset`
- Sabotaż 2: `alter table public.schedule_days disable row level security` → blok obcego właściciela FAIL (`row_count = 1`); `db reset`
- W aplikacji jako `osrodek.debem@example.com`: odwołany zapis na koniu (odwołać zapis Anny jako Anna, potem jako ośrodek **w jednym zapisie formularza** zmienić godziny na 9–17 **i** odznaczyć Bellę) → odmowa **przed** zapisem godzin: dzień nadal 10–16, Bella nadal przypisana, komunikat nie każe odwoływać zapisu (plan-review F5: bez jednoczesnej zmiany godzin krok nie odróżnia nowego zachowania od starego)

**Implementation Note**: Zatrzymaj się po weryfikacji manualnej przed Fazą 4.

---

## Phase 4: Ryzyko #4 — domknięcie izolacji i widoczna odmowa

### Overview

Rozszerzyć `rls_isolation.sql` o scenariusze, których dziś brakuje (jeździec → tabele ośrodka, ośrodek → INSERT zapisu, obce `schedule_days`/`schedule_day_horses`, odwołanie cudzego zapisu po `id`), i naprawić cichy sukces w `toggle-active` wg wzorca cancel.

### Changes Required:

#### 1. Scenariusze izolacji

**File**: `supabase/tests/rls_isolation.sql`

**Intent**: Każdy wektor „podmień identyfikator” z briefu zmiany ma asercję na SQLSTATE `42501` (INSERT z `with check`) albo `row_count = 0` (UPDATE/DELETE odfiltrowane).

**Contract** (przed pierwszym `set local role` w każdym bloku zapamiętać potrzebne id przez `set_config('app.<nazwa>', …, true)`, np. id zapisu Piotra, id dnia i przydziału Grom w Nad Rzeką, id Luny):
- Blok ośrodka A (`1111…`), dopisać: `update schedule_days` dnia Nad Rzeką → `row_count = 0` bez wyjątku; `delete schedule_day_horses` przydziału Grom → `row_count = 0`; `insert schedule_day_horses` (dzień B, koń B, `stable_id` B) → `42501`; `insert bookings` z `rider_id = '1111…'` → `42501` (brama roli `current_role() = 'rider'`) — **na istniejący dzień Pod Dębem i godzinę w zakresie (np. Kasztan@12)**, bo trigger BEFORE INSERT sprawdza dzień i godziny przed WITH CHECK polityki; z niepoprawnym slotem test dostałby `23503`/`23514` i mierzyłby coś innego (zweryfikowane: poprawny slot → `42501`; plan-review F4).
- Blok Anny (`3333…`), dopisać: `update bookings … where id = current_setting('app.piotr_booking')::bigint` → `row_count = 0` (odwołanie cudzego zapisu **po id**, nie po `rider_id`); `insert horses` do stadniny A → `42501`; `insert schedule_days` dla stadniny A → `42501`; `update horses set active = false where id = <Bella>` → `row_count = 0` (SQL-owy bliźniak `toggle-active`).
- Istniejące asercje bez zmian; `rollback` na końcu każdego bloku zostaje.

#### 2. Widoczna odmowa w `toggle-active`

**File**: `src/pages/api/horses/toggle-active.ts`

**Intent**: UPDATE, który po filtrze RLS + `stable_id` nie trafił w żaden wiersz, ma kończyć się komunikatem, nie przekierowaniem wyglądającym jak sukces. Wzorzec: `cancelBooking` (`src/lib/bookings/queries.ts:180-193`).

**Contract**: do łańcucha UPDATE dodać `.select("id").maybeSingle()`; `error` → dotychczasowy komunikat; `data === null` → `backToList` z komunikatem „nie znaleziono konia w Twojej stadninie” (ten sam dla obcego, nieistniejącego i już usuniętego id — bez wyroczni istnienia, jak w cancel); jawny `.eq("stable_id", stableId)` zostaje. Komentarz nad zapytaniem uzupełnić o powód `.select()`.

### Success Criteria:

#### Automated Verification:

- `npm run test:db` PASS lokalnie z nowymi asercjami
- `npm run lint` i `npm run build` zielone
- Push → wszystkie joby zielone

#### Manual Verification:

- Sabotaż: `alter table public.horses disable row level security` → asercja Anny `update horses … active` i asercja ośrodka A na Lunę FAIL (`row_count = 1`); `db reset`
- W aplikacji jako `osrodek.debem@example.com`: POST na `/api/horses/toggle-active` z `horseId` Luny (curl z ciasteczkiem sesji albo edycja `value` w formularzu w DevTools) → przekierowanie na `/osrodek/konie?error=…`; Luna w bazie nietknięta; własny koń nadal przełącza się poprawnie

**Implementation Note**: Zatrzymaj się po weryfikacji manualnej przed Fazą 5.

---

## Phase 5: Cookbook i synchronizacja dokumentów

### Overview

Test-plan dostaje wzorzec §6.2 i aktualny stan rolloutu, AGENTS.md mówi prawdę o CI i uruchamianiu, plan zostaje zsynchronizowany.

### Changes Required:

#### 1. Test-plan

**File**: `context/foundation/test-plan.md`

**Intent**: §6.2 przestaje być „TBD”; §3 wiersz Fazy 1 → `complete`; §5 bramka integracyjna → `required` (od tej zmiany); §4 wiersz „integration (database)” → „automated in CI (`db-tests`)”; §6.5 notatka z 2–3 zaskoczeń tej fazy; „Last updated” i §8 daty.

**Contract** §6.2 musi nazwać: **lokalizację** (`supabase/tests/`), **nazewnictwo** (`<ryzyko>_<scenariusz>.sql` dla asercji jednopołączeniowych, `.sh` tylko gdy potrzeba wielu połączeń), **test referencyjny** (`rls_isolation.sql` dla wzorca persona/`row_count`; `concurrent_double_booking.sh` dla współbieżności), **komendę** (`npm run test:db` przy działającym `npx supabase start` lub `npx supabase db start`; bez hostowego `psql` runner sam użyje `docker exec`), **warunek świeżości seeda** (dni z seeda muszą być na jutro — po dobie `npx supabase db reset`; runner odmówi z czytelnym komunikatem), **wzorzec** (setup jako `postgres` → `set local role authenticated` + `request.jwt.claims` → asercja na SQLSTATE **i** `row_count` **i** ponowny odczyt → `rollback`), **regułę oracle** (kody i stan, nie komunikaty; komunikaty są w unit testach), **sabotaż** jako sprawdzenie, że test potrafi paść. Kandydaci do §6.5: „odwołany zapis przypina konia — decyzja, nie bug”; „`db start` wystarcza, GoTrue niepotrzebne”; „dla właściciela asertuj `row_count = 1`, inaczej nie wiesz, czy RLS wpuściło”.

#### 2. AGENTS.md

**File**: `AGENTS.md`

**Intent**: Hard rule o CI (`:7`) i sekcja „Database → Verification” (`:36-41`) mają odzwierciedlać nowy stan: CI uruchamia lint, unit, build **i** `db-tests`; lokalnie `npm run test:db`; `docker exec` jako alternatywa.

**Contract**: edycja tylko tych fragmentów; reguła „uruchom po KAŻDEJ zmianie migracji lub RLS” zostaje, uzupełniona o „CI też to zrobi, ale lokalnie jest szybciej”.

#### 3. Synchronizacja planu

**File**: `context/changes/testing-database-guarantees-in-ci/plan.md`

**Intent**: `## Progress` odzwierciedla stan z SHA; `change.md` `status` zgodny z lifecycle.

**Contract**: mechaniczne, wg `references/progress-format.md`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` (prettier na `.md` przez lint-staged) zielony
- `grep -c "TBD" context/foundation/test-plan.md` nie zawiera już wpisu dla §6.2

#### Manual Verification:

- Ktoś, kto nie brał udziału w tej zmianie, potrafi z §6.2 dodać nową asercję RLS w 10 minut (test na jednym scenariuszu, np. „ośrodek B nie usunie konia ośrodka A”)
- `/10x-test-plan --status` pokazuje Fazę 1 jako `complete` i wskazuje Fazę 2 jako następną

---

## Testing Strategy

### Unit Tests:

- `src/lib/schedule/errors.test.ts`: `APP001` vs `APP002` — komunikaty różne, `APP002` ≡ `23503`, zawiera „konia”, nie każe odwoływać zapisu.
- Pozostałe unit testy bez zmian; `npm test` pozostaje bez usług.

### Integration Tests (baza, `npm run test:db`):

- **#1**: N równoległych INSERT jako Anna/Piotr przez RLS → 1 sukces, N−1 × `23505`/`bookings_active_slot_key`, 1 aktywny; odwołanie zwycięzcy → ponowny zapis przechodzi; `get_taken_slots` pokazuje 1 parę.
- **#2**: jako właściciel — `SB002`/`SB001`/`23503` z nietkniętym zapisem po każdej odmowie, rozszerzenie i pusty dzień przechodzą z `row_count = 1`, odwołany nie blokuje godzin (przechodzi), odwołany przypina konia (`23503`, zaakceptowane); jako obcy właściciel — `row_count = 0`.
- **#4**: ośrodek A vs dane B (UPDATE/DELETE → 0, INSERT → `42501`), ośrodek jako jeździec (`42501`), jeździec vs tabele ośrodka (`42501`), jeździec vs cudzy zapis po `id` i po `rider_id` (0), `active = false` na obcym koniu (0), istniejące asercje widoczności i `get_taken_slots`.

### Manual Testing Steps:

1. Po Fazie 1: otworzyć run w GitHub, sprawdzić trzy joby i czas `db-tests`.
2. Po każdej z Faz 2–4: sabotaż strażnika lokalnie → skrypt czerwony → `npx supabase db reset` → skrypt zielony.
3. Po Fazie 3: scenariusz ośrodka z odwołanym zapisem w UI — odmowa przed zapisem godzin.
4. Po Fazie 4: POST `toggle-active` z obcym `horseId` → `?error=`, dane nietknięte.

## Performance Considerations

Job `db-tests` dodaje do każdego runu: checkout + `npm ci` (~30 s z cache), pull obrazu Postgresa Supabase i start (~1–2 min na zimno; nieweryfikowane — zmierzyć w Fazie 1), trzy skrypty (sekundy). Bieg równoległy z `ci`, więc czas do `deploy` rośnie o różnicę, nie o sumę. Jeśli `db start` regularnie przekroczy 3 min, rozważyć cache obrazu Dockera w kolejnej zmianie — nie w tej.

## Migration Notes

Brak migracji. Żadna zmiana schematu ani polityk RLS. Zmiany w aplikacji są zgodne wstecz (odmowa wcześniej niż dotychczas; komunikat zamiast cichego przekierowania).

## References

- Research: `context/changes/testing-database-guarantees-in-ci/research.md`
- Test-plan: `context/foundation/test-plan.md` §2 (ryzyka #1, #2, #4), §3 Faza 1, §6.2
- PRD: `context/foundation/prd.md` — Guardrails, NFR współbieżności, Access Control, Open Question #2
- Wzorzec impersonacji: `supabase/tests/rls_isolation.sql:17-19`
- Wzorzec wykrywania 0 wierszy w aplikacji: `src/lib/bookings/queries.ts:180-193`, `src/pages/api/bookings/cancel.ts:53-69`
- Decyzje archiwalne: `context/archive/2026-08-11-daily-schedule-management/reviews/impl-review.md:32-49` (Fix A, nietransakcyjny zapis), `context/archive/2026-08-10-booking-data-schema/plan.md:42` (RESTRICT, „zapisy nie znikają po cichu”)
- Supabase CLI: https://supabase.com/docs/reference/cli/supabase-db-start (Postgres only, migracje + seed)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runner i bramka CI

#### Automated

- [x] 1.1 `npm run test:db` lokalnie — kod 0, trzy PASS — 027bc04
- [x] 1.2 `npm run lint` zielony — 027bc04
- [x] 1.3 Push → `ci`, `db-tests`, `deploy` zielone; `db-tests` ≤ ~3 min — e4411c5

#### Manual

- [x] 1.4 Log `db-tests` pokazuje migracje + seed i trzy nagłówki skryptów — e4411c5
- [x] 1.5 Celowo zepsuty skrypt daje kod ≠ 0, pozostałe i tak się wykonały — e4411c5

### Phase 2: Ryzyko #1 — współbieżność pod RLS

#### Automated

- [x] 2.1 `npm run test:db` PASS (ATTEMPTS=5)
- [x] 2.2 `ATTEMPTS=20` PASS
- [ ] 2.3 Push → `db-tests` zielony

#### Manual

- [ ] 2.4 Sabotaż: drop indeksu → FAIL; `db reset`
- [ ] 2.5 Sabotaż: claims ośrodka w jednej próbie → FAIL „odmowa z innego powodu” (42501)

### Phase 3: Ryzyko #2 — strażnik grafiku pod RLS i domknięcie asymetrii

#### Automated

- [ ] 3.1 `npm run test:db` PASS (przypadki 1–8 + obcy właściciel)
- [ ] 3.2 `npm test` zielony z testami `APP001`/`APP002`
- [ ] 3.3 `npm run lint` zielony
- [ ] 3.4 Push → `db-tests` i `ci` zielone

#### Manual

- [ ] 3.5 Sabotaż: drop triggera → przypadki 1 i 3 FAIL; `db reset`
- [ ] 3.6 Sabotaż: RLS off na `schedule_days` → blok obcego właściciela FAIL; `db reset`
- [ ] 3.7 UI ośrodka: wypisanie konia z odwołanym zapisem odmówione przed zapisem godzin, komunikat nie każe odwoływać

### Phase 4: Ryzyko #4 — domknięcie izolacji i widoczna odmowa

#### Automated

- [ ] 4.1 `npm run test:db` PASS z nowymi asercjami
- [ ] 4.2 `npm run lint` i `npm run build` zielone
- [ ] 4.3 Push → wszystkie joby zielone

#### Manual

- [ ] 4.4 Sabotaż: RLS off na `horses` → asercje `active`/Luna FAIL; `db reset`
- [ ] 4.5 POST `toggle-active` z obcym `horseId` → `?error=`, Luna nietknięta, własny koń działa

### Phase 5: Cookbook i synchronizacja dokumentów

#### Automated

- [ ] 5.1 `npm run lint` zielony
- [ ] 5.2 §6.2 test-planu bez „TBD”

#### Manual

- [ ] 5.3 Osoba z zewnątrz dodaje asercję RLS z §6.2 w 10 minut
- [ ] 5.4 `/10x-test-plan --status` pokazuje Fazę 1 `complete`, wskazuje Fazę 2
