<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Gwarancje bazodanowe w CI

- **Plan**: `context/changes/testing-database-guarantees-in-ci/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-08
- **Verdict**: REVISE → SOUND (po triage: 5/5 FIXED)
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING → PASS (F1, F2 fixed) |
| Plan Completeness | WARNING → PASS (F3–F5 fixed) |

## Grounding

12/12 ścieżek ✓, 6/6 symboli ✓, brief↔plan ✓, Progress↔Phase ✓ (5 faz, 26 pozycji, brak checkboxów poza `## Progress`). `docs/reference/contract-surfaces.md` i `context/foundation/lessons.md` nieobecne — pominięte.

Weryfikacja na żywym lokalnym stacku (`supabase_db_10x-astro-starter`, 2026-09-08):
- `auth.uid()`, `private.current_role()`, `private.current_stable_id()` czytają `sub` z `request.jwt.claims` po `set local role authenticated` ✓
- `psql -c "set role authenticated; set request.jwt.claims = …; select …"` działa w jednym `-c` (implicit transaction) ✓
- `set_config('app.x', …, true)` widoczne po zmianie roli; `reset role` wraca do `postgres` ✓
- INSERT ośrodka do `bookings` na poprawny slot → `42501` (RLS), nie `23514`/`23503` ✓
- `psql -v VERBOSITY=verbose` daje SQLSTATE w stderr ✓
- Brak hostowego `psql` na maszynie autora; kontener odpowiada na `docker exec -i` ✓
- Dryf seeda potwierdzony: `schedule_days.day = 2026-09-08` (= dziś), filtry `current_date + 1` zwracają 0 wierszy ✓

## Findings

### F1 — run_all.sh wymaga hostowego psql, którego lokalnie nie ma

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; zatrzymaj się i przemyśl
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Runner skryptów
- **Detail**: Na maszynie autora nie ma `psql`; istniejące skrypty mają fallback `docker exec` z tego powodu (`concurrent_double_booking.sh:19-31`). Plan kazał runnerowi używać `psql -f`, więc `npm run test:db` — komenda, którą §6.2 poda jako główną — lokalnie nie zadziałałby, a Faza 1 nie przeszłaby własnego kryterium 1.1.
- **Fix ⭐ Recommended**: runner powiela detekcję ze skryptu bash (hostowy `psql` → `docker exec -i supabase_db_<project_id> psql`), wspólny `_psql.sh` source'owany przez oba, pliki `.sql` przez stdin zamiast `-f`.
  - Strength: Ten sam wzorzec już działa w repo; CI bierze gałąź hostową, dev na Windows — kontenerową.
  - Tradeoff: Kilkanaście linii bash więcej; detekcja w jednym pliku pomocniczym.
  - Confidence: HIGH — kontener działa i odpowiada na `docker exec` (zweryfikowane).
  - Blind spot: msys może manglować ścieżki w argumentach — stąd stdin.
- **Decision**: FIXED (plan.md, Faza 1 kontrakt runnera; plan-brief.md prerequisites)

### F2 — Dryf dat seeda: lokalnie „jutro” z seeda jest już dziś

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; zatrzymaj się i przemyśl
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Runner; Phase 3 — setup „dzień Pod Dębem na current_date + 1”
- **Detail**: Seed liczy `current_date + 1` w momencie ładowania. Lokalna baza ma dziś oba dni na 2026-09-08, więc filtry `sd.day = current_date + 1` (`rls_isolation.sql:93,104`, planowany setup Fazy 3) zwracają 0 wierszy — asercje padają albo nic nie sprawdzają. W CI wolumen jest zawsze świeży. Plan zakładał „seed załadowany”, nie mówił jak świeży.
- **Fix A ⭐ Recommended**: strażnik świeżości w runnerze — brak dnia na `current_date + 1` → komunikat „uruchom `npx supabase db reset`” i `exit 1`; zdanie w §6.2.
  - Strength: Jawne, szybkie, nie niszczy lokalnych danych; jeden warunek pokrywa trzy skrypty.
  - Tradeoff: Dev resetuje ręcznie raz dziennie przed testami.
  - Confidence: HIGH — warunek zweryfikowany na żywej bazie.
  - Blind spot: Uruchomienie tuż przed północą — akceptowalne.
- **Fix B**: runner sam robi `npx supabase db reset`.
  - Strength: Zero kroków ręcznych.
  - Tradeoff: Kasuje lokalne dane dewelopera; +20–40 s; w CI zbędne po `db start`.
  - Confidence: MEDIUM.
  - Blind spot: `db reset` przy samym `db start` w CI — nieweryfikowane.
- **Decision**: FIXED via Fix A (plan.md, Faza 1 kontrakt runnera; Critical Implementation Details; Faza 5 §6.2)

### F3 — Asercja get_taken_slots w Fazie 2 liczy za dużo

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — ścieżka zwolnienia slotu
- **Detail**: Pod Dębem jutro ma też seedowy zapis Anny (Bella@11), więc `get_taken_slots` zwraca 2 wiersze. „Dokładnie jeden wiersz dla (Kasztan, 12)” czytało się dwojako.
- **Fix**: „zbiór zawiera dokładnie jeden wiersz `(horse_id = Kasztan, hour = 12)`”, bez asercji na łączną liczbę.
- **Decision**: FIXED

### F4 — INSERT ośrodka do bookings musi mieć poprawny slot

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — blok ośrodka A
- **Detail**: Trigger BEFORE INSERT (godziny pracy / istnienie dnia) odpala się przed WITH CHECK polityki. Niepoprawny slot dałby `23503`/`23514` zamiast `42501`. Z poprawnym slotem → `42501` (zweryfikowane).
- **Fix**: dopisać „na istniejący dzień i godzinę w zakresie (np. Kasztan@12), żeby jedyną odmową była RLS”.
- **Decision**: FIXED

### F5 — Scenariusz manualny 3.7 nie mówi, że zmienia też godziny

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Manual Verification, punkt 3
- **Detail**: „Odmowa przed zapisem godzin” jest obserwowalna tylko, gdy ten sam zapis formularza zmienia godziny i wypisuje konia.
- **Fix**: „w jednym zapisie: zmień godziny na 9–17 i odznacz Bellę → po odmowie dzień nadal 10–16, Bella nadal przypisana”.
- **Decision**: FIXED

## Triage summary

- Fixed: F1, F2 (Fix A), F3, F4, F5 (5)
- Skipped: — · Accepted: — · Dismissed: —
- Verdict after fixes: REVISE → SOUND
