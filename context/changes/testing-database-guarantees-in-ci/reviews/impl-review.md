<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Gwarancje bazodanowe w CI

- **Plan**: `context/changes/testing-database-guarantees-in-ci/plan.md`
- **Scope**: Phase 1–5 of 5 (pełny plan)
- **Date**: 2026-09-09
- **Verdict**: APPROVED (triage 2026-09-09: 5/5 FIXED)
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Weryfikacja kryteriów

- `npm run lint` — PASS (exit 0)
- `npm test` — PASS (11 plików, 116 testów)
- `npm run build` — PASS
- `npm run test:db` — nie uruchomiony lokalnie (Docker Desktop nie działał po resecie 2026-09-09); job `db-tests` na `77c74c9` zielony w CI (1m53s), `deploy` zielony
- Manual (13 pozycji) — wszystkie `[x]` z SHA; sabotaże i kroki UI z natury nie zostawiają śladu w diffie — przyjęte

## Zgodność z planem

20 plików, 0 MISSING, 0 istotnego DRIFT. Świadome odstępstwa: `test:db` przez shim `run_all.mjs` (F2); blok obcego właściciela w `schedule_change_guardrails.sql` używa rozszerzenia `open_hour = 9` zamiast `close_hour = 11` (uzasadnione w skrypcie: sabotaż RLS pada na `row_count`, nie na SB002). „What We're NOT Doing” dotrzymane: bez migracji, bez zmian polityk RLS, bez Vitest/pgTAP, bez HTTP, bez hooków.

## Findings

### F1 — DB_URL przyjmie dowolny host, a skrypty mutują jako superuser

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Safety & Quality (data safety)
- **Location**: supabase/tests/\_psql.sh:16, run_all.sh:49, concurrent_double_booking.sh:64-67
- **Detail**: `_psql.sh` bierze DB_URL z env bez sprawdzenia hosta. Strażnik świeżości przejdzie na każdej żywej bazie z grafikiem na jutro. Skrypt współbieżności robi `delete from bookings` jako postgres w `cleanup()` przed sprawdzeniem danych demo. Chroni tylko brak stadniny „Pod Dębem” na prodzie. W trybie docker DB_URL jest ignorowany, a run_all.sh:43 i tak go wypisuje.
- **Fix**: W `_psql.sh` odmówić hosta innego niż localhost/127.0.0.1 (chyba że `DB_TESTS_ALLOW_REMOTE=1`); w trybie docker ostrzec, gdy DB_URL ustawiono jawnie; w run_all.sh:43 drukować tryb/kontener zamiast DB_URL.
- **Decision**: FIXED (straznik hosta w `_psql.sh` przez bash parameter expansion, ostrzezenie o zignorowanym DB_URL w trybie docker, `PSQL_TARGET` w komunikacie run_all.sh)

### F2 — Nieplanowany shim run_all.mjs; plan wciąż mówi „bash run_all.sh”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Scope Discipline
- **Location**: supabase/tests/run_all.mjs, package.json:12, plan.md (Faza 1, „Skrypt npm”)
- **Detail**: Plan: `"test:db": "bash supabase/tests/run_all.sh"`. Faktycznie `node supabase/tests/run_all.mjs` — launcher szukający Git Bash na Windows. Zasadne, opisane w test-planie §6.5, ale plan.md nie ma addendum. Komentarz w run_all.mjs:23 opisuje ścieżkę `<Git>\cmd\git.exe`, a na tej maszynie działa dopiero fallback z ProgramFiles.
- **Fix**: Addendum w plan.md Faza 1 pkt 2 i poprawa komentarza w run_all.mjs:23.
- **Decision**: FIXED (addendum w plan.md Faza 1 pkt 2; komentarz + drugi kandydat mingw64 w run_all.mjs)

### F3 — Skrypt współbieżności wybiera dzień inaczej niż reszta

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Pattern Consistency
- **Location**: supabase/tests/concurrent_double_booking.sh:36
- **Detail**: `order by day limit 1` bierze najwcześniejszy dzień, a skrypty .sql i strażnik runnera przypinają się do `day = current_date + 1`. Wcześniejszy dzień bez Kasztana → 23503 i mylący FAIL.
- **Fix**: `where stable_id = … and day = current_date + 1`.
- **Decision**: FIXED (`day = current_date + 1` zamiast `order by day limit 1`)

### F4 — Pin obrazu Postgresa w dwóch gitignorowanych miejscach

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — realny kompromis; zatrzymaj się i przemyśl
- **Dimension**: Safety & Quality (reliability / CI)
- **Location**: .github/workflows/ci.yml:43-51
- **Detail**: 17.6.1.147 żyje w env CI i lokalnie w gitignorowanym `supabase/.temp/postgres-version`. Nic nie sprawdza zgodności; pin maskuje crash na 17.6.1.106. Nazwa kontenera w `docker logs` na sztywno; brak `timeout-minutes`.
- **Fix**: Zacommitować `supabase/postgres-version`, CI robi `cat` do `.temp/`, zdanie w AGENTS.md; `timeout-minutes: 15`; nazwa kontenera z config.toml.
  - Strength: Jedno źródło prawdy w repo; rozjazd widać w diffie PR.
  - Tradeoff: Lokalny `.temp` nadal może odjechać — sync ręczny, tylko widoczny.
  - Confidence: MED — nie weryfikowałem kolejności źródeł wersji w CLI przy `db start` bez `link`.
  - Blind spot: Nowe wersje CLI mogą zmienić lokalizację pliku.
- **Decision**: FIXED (commitowany `supabase/postgres-version` + `cp` w CI, `timeout-minutes: 15`, nazwa kontenera z config.toml, zdania w AGENTS.md i test-plan §4)

### F5 — Bariera pg_sleep(0.5) na zimnym runnerze może zserializować próby

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Safety & Quality (reliability)
- **Location**: supabase/tests/concurrent_double_booking.sh:72-81
- **Detail**: Jeśli spawn późniejszych `psql` zajmie >0,5 s, próby przestają się nakładać. Asercja nadal prawdziwa (brak fałszywego PASS), ale test przestaje dowodzić realnej współbieżności.
- **Fix**: Zaakceptować albo podnieść barierę do 1 s przez env (np. `BARRIER_SECONDS`).
- **Decision**: FIXED (`BARRIER_SECONDS` z walidacja, domyslnie 0.5; w ci.yml 1)
