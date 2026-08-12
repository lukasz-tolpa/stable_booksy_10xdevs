<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-02 Grafik dnia ośrodka

- **Plan**: `context/changes/daily-schedule-management/plan.md`
- **Scope**: Phases 1–3 of 3 (cały plan)
- **Date**: 2026-08-11
- **Verdict**: NEEDS ATTENTION (wszystkie findings rozstrzygnięte w triage)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL (naprawione w triage) |

## Zakres zmian

20 plików, wszystkie z „Changes Required" planu. Jedyny dodatek poza listą to helper `formValues` w `src/lib/form-data.ts` — potrzebny, bo grupa pól wyboru wysyła wiele wartości pod jedną nazwą; mieści się w intencji, nie zgłoszony jako finding.

## Weryfikacja kryteriów

`npm test`, `npm run lint`, `npm run build`, `schedule_change_guardrails.sql` — zielone.
`rls_isolation.sql` — **czerwony w momencie przeglądu**, patrz F3. Naprawione w triage.

## Findings

### F1 — Nieudany zapis grafiku i tak zmienia dane

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `src/lib/schedule/queries.ts:79` (saveScheduleDay)
- **Detail**: Zapis to trzy operacje bez wspólnej transakcji. Potwierdzone dwoma próbami na żywo: (a) rozszerzenie godzin 10-16 → 9-18 wraz z usunięciem konia mającego zapis skończyło się komunikatem o błędzie, ale godziny w bazie zmieniły się na 9-18; (b) zapis z cudzym koniem na liście usunął wcześniej dwa konie z dnia, bo delete wykonał się przed nieudanym insertem. Użytkownik dostaje „nie udało się" i nie ma powodu przypuszczać, że cokolwiek się zmieniło.
- **Fix A ⭐ Recommended**: Walidacja przed zapisem
  - Strength: Sprawdzenie przynależności koni i braku zapisów u odpinanych ZANIM ruszy pierwszy zapis; zostaje w TypeScripcie i rozwiązuje też F2.
  - Tradeoff: Dwa zapytania kontrolne; wyścig nadal teoretycznie możliwy, więc guardrail bazy pozostaje ostatnią linią obrony.
  - Confidence: HIGH — przyczyna obu potwierdzonych przypadków jest ta sama.
  - Blind spot: Nie mierzono kosztu dwóch dodatkowych zapytań; przy `qps: low` z PRD zakładany jako pomijalny.
- **Fix B**: Zapis przez funkcję bazy w transakcji (RPC)
  - Strength: Pełna atomowość, wyścigi znikają.
  - Tradeoff: Logika zapisu wędruje do PL/pgSQL wbrew decyzji z planowania; kolejna migracja.
  - Confidence: MED.
  - Blind spot: Nie sprawdzono, jak taka funkcja raportowałaby SB001/SB002 do aplikacji.
- **Decision**: FIXED (Fix A) — `assertHorsesBelongToStable` i `assertRemovedHorsesHaveNoBookings` przed pierwszym zapisem. Oba scenariusze powtórzone: błąd bez żadnej mutacji, ścieżka pozytywna działa.

### F2 — Cudzy koń dostaje komunikat o zapisach

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/schedule/errors.ts:74`
- **Detail**: Kod `23503` oznacza zarówno „koń ma zapisy w tym dniu", jak i „koń nie należy do tej stadniny", więc ośrodek dostawał komunikat opisujący inną sytuację i sugerujący czynność, która niczego nie naprawia.
- **Fix**: Sprawdzić przynależność koni przed zapisem i odrzucić z własnym komunikatem.
- **Decision**: FIXED — rozwiązane przez Fix A z F1; nowy kod `APP001` daje komunikat „Wybrany koń nie należy do Twojej stadniny."

### F3 — Test regresji RLS z F-01 jest czerwony

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `supabase/tests/rls_isolation.sql:96`
- **Detail**: Skrypt kończył się błędem „FAIL: jezdziec nie mogl zapisac sie na wolny slot". Nie regresja w politykach, tylko krucha asercja — zapytanie setupowe łączyło `schedule_days` bez filtra po dacie, zakładając jeden dzień na stadninę. S-02 dał ośrodkom możliwość tworzenia kolejnych dni i tym samym zdemaskował to założenie.
- **Fix**: Dopisać filtr po dacie w zapytaniu setupowym.
- **Decision**: FIXED — `where sd.day = current_date + 1` w obu zapytaniach; skrypt wraca do zieleni.

### F4 — Rozumowanie o strefie czasowej nie obowiązuje na produkcji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/schedule/dates.ts:11`
- **Detail**: Komentarz i testy uzasadniały liczenie „dziś" w strefie lokalnej, ale aplikacja stoi na Cloudflare Workers, gdzie środowisko ma UTC — zabezpieczenie nie działało tam, gdzie miało.
- **Fix**: Wymusić strefę `Europe/Warsaw` przy liczeniu „dziś".
- **Decision**: FIXED — `SCHEDULE_TIME_ZONE = "Europe/Warsaw"`, `formatIsoDate` przez `Intl.DateTimeFormat`; testy operują na momentach w UTC, więc nie zależą od strefy maszyny i pokrywają obie strony zmiany czasu.

### F5 — Podpowiedź bierze najpóźniejszy dzień, nie ostatnio ułożony

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/lib/schedule/queries.ts:57`
- **Detail**: Sortowanie po `day` malejąco daje dzień najdalszy w przyszłości, a plan mówił o dniu ułożonym ostatnio.
- **Fix**: Sortować po `created_at`.
- **Decision**: FIXED — sortowanie po `created_at`.

## Stan po triage

Wszystkie kryteria automatyczne zielone: `npm test` (76), `npm run lint`, `npm run build`, `schedule_change_guardrails.sql`, `rls_isolation.sql`.
