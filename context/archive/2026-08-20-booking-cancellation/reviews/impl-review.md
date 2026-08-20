<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-06 — Odwołanie zapisu (booking-cancellation)

- **Plan**: `context/changes/booking-cancellation/plan.md`
- **Scope**: Phases 1–2 of 2 (cały plan)
- **Date**: 2026-08-20
- **Verdict**: APPROVED (wszystkie findings rozstrzygnięte w triage)
- **Findings**: 0 critical, 1 warning, 3 observations — wszystkie FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING (1 DRIFT — intencja zachowana, addendum dopisane) |
| Scope Discipline | PASS |
| Safety & Quality | WARNING (naprawione w triage) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Zakres i weryfikacja

Commity `4000193` (p1) → `e315cbd` (p2) → `c7d8663` (epilog) + commit poprawek z tego przeglądu. Agent driftu: jedyny DRIFT to adaptacja embedu — plan błędnie twierdził, że `bookings → schedule_days` to bezpośredni FK; realny łańcuch idzie przez złożony FK do `schedule_day_horses` (zweryfikowany w migracji i na runtime), co uprościło projekt (bez `getHorseNames`, jedno zapytanie). Reszta kontraktów MATCH w komplecie; granice respektowane (bez odwołań przez ośrodek, bez polityki wyprzedzenia, `[id].astro` nietknięte, zero migracji/RLS/SQL, lista S-05 nadal tylko aktywne).

Bezpieczeństwo — czyste: podwójna warstwa ochrony własności (jawny `rider_id` + RLS), brak wyroczni istnienia (identyczne „nie znaleziono" dla cudzych/nieistniejących/odwołanych), zero XSS, auth przed mutacją, semantyka progu znak-w-znak zgodna z S-04. TOCTOU progu (milisekundowe okno między odczytem a UPDATE; szczelność wymagałaby triggera/RPC) — świadomie zaakceptowane przy skali PRD, uczciwie skomentowane w kodzie.

Kryteria automatyczne: `npm test` (114), lint, build — zielone, także po poprawkach. Manualne 2.2–2.7 potwierdzone przez użytkownika (pełny cykl odwołania z plakietką, zwolnienie slotu, ponowny zapis, guard progu).

## Findings

### F1 — Endpoint pobierał wszystkie zapisy jeźdźca, żeby znaleźć jeden

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: `src/pages/api/bookings/cancel.ts:51-52`
- **Detail**: `getRiderBookings` (pełny 3-poziomowy embed, każdy status) + `.find()` dla danych jednego wiersza; zbiór rośnie monotonicznie — dług techniczny.
- **Fix**: Nowe celowane `getRiderBookingForCancel(client, bookingId, riderId)` (tylko `hour`, `status`, `day` — bez embedów ośrodka/konia); endpoint przełączony, semantyka odmów niezmieniona.
- **Decision**: FIXED

### F2 — cancelBooking bez zdania o warunku „tylko sesja jeźdźca"

- **Severity**: 💡 OBSERVATION · **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: `src/lib/bookings/queries.ts`
- **Detail**: Polityka UPDATE jest own-OR-my-stable — sesja ośrodka z cudzym `riderId` przeszłaby; klasa miny komentowana już w `getMyBookings`/`getDayBookings`, tu komentarza brakowało.
- **Fix**: Dopisane zdanie warunku wstępnego w stylu domu (także w `getRiderBookingForCancel`).
- **Decision**: FIXED

### F3 — Dryf dokumentacyjny po adaptacji FK

- **Severity**: 💡 OBSERVATION · **Impact**: 🏃 LOW
- **Dimension**: Plan Adherence
- **Location**: `plan.md` (Key Discoveries, kontrakty 1-2); `queries.ts` (komentarz)
- **Detail**: Proza planu niosła sfalsyfikowane twierdzenie o bezpośrednim FK i projekt `getHorseNames`; komentarz mylił nazwę constrainta (`bookings_cancelled_at_matches_status` vs faktyczne `bookings_cancelled_at_consistency_check`).
- **Fix**: Sekcja „Addendum (post-implementacja)" w plan.md + poprawna nazwa constrainta w komentarzu.
- **Decision**: FIXED

### F4 — localeCompare dla dat ISO odstawał od idiomu repo

- **Severity**: 💡 OBSERVATION · **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/bookings/rider-list.ts:30`
- **Detail**: Komparator sekcji używał `localeCompare`, gdy trzy linijki niżej (i w `dates.ts`) daty ISO porównuje się gołym `<`.
- **Fix**: Porównanie `<`/`>` z komentarzem odsyłającym do idiomu `isPastDate`.
- **Decision**: FIXED

## Stan po triage

`npm test` (114), `npm run lint`, `npm run build` — zielone po poprawkach.
