<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-05 — Lista zapisów dnia (daily-bookings-list)

- **Plan**: `context/changes/daily-bookings-list/plan.md`
- **Scope**: Phases 1–2 of 2 (cały plan)
- **Date**: 2026-08-20
- **Verdict**: APPROVED (wszystkie findings rozstrzygnięte w triage)
- **Findings**: 0 critical, 0 warnings, 2 observations — oba FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Zakres i weryfikacja

Faza 1 w commicie `0f7c71d`, faza 2 przeglądana w drzewie roboczym. Agent driftu: **4/4 MATCH, zero driftu, zero scope creep** — jedyne odstępstwa to dwa skomentowane wzmocnienia w `zapisy.astro` (jawna gałąź `loadFailed` przy awarii konfiguracji — wzorzec z review S-04; zakres godzin w stanie „brak zapisów"). Granice respektowane: brak siatki, brak odwołanych, brak akcji, zero migracji/RLS/RPC.

Bezpieczeństwo — czyste: konto ośrodka z definicji polityk nie może mieć własnych zapisów (INSERT wymaga roli rider), więc SELECT zwraca dokładnie zapisy jego dnia; cudzy `scheduleDayId` daje pusty wynik przez RLS bez błędu; embedded `profiles(full_name)` pobiera wyłącznie nazwiska jeźdźców własnej stadniny (`is_rider_of_my_stable`); zero XSS (escapowanie Astro, brak `set:html`, `?dzien=` walidowane przed echem do hrefów).

Kryteria automatyczne: `npm test` (104), `npm run lint`, `npm run build` — zielone (także po poprawkach z triage). Kryteria manualne 2.2–2.6 potwierdzone przez użytkownika (zrzuty + testy ręczne); rozjazd „zapisy na dziś zamiast na jutro" wyjaśniony przejściem daty przez północ — seed tworzył dzień `current_date + 1` przy wczorajszym resecie.

## Findings

### F1 — getDayBookings nie deklarowało warunku „tylko sesja ośrodka"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/bookings/queries.ts:51-59`
- **Detail**: Lustrzane odbicie lekcji z S-04 — sesja jeźdźca wołająca funkcję dostałaby przez RLS tylko własne zapisy i po cichu zaniżyła listę dnia. Jawnego filtra nie ma na czym zawiesić (własność dnia weryfikuje strona przez `getScheduleDay`), ale komentarz nie nazywał nośnego założenia.
- **Fix**: Dopisane zdanie do komentarza: funkcja poprawna wyłącznie dla sesji ośrodka i jego własnego dnia.
- **Decision**: FIXED

### F2 — grafik.astro bez gałęzi loadFailed dla awarii konfiguracji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/osrodek/grafik.astro:26-39`
- **Detail**: Przy braku klienta/profilu grafik pokazywał mylące „Nie masz jeszcze żadnych koni" zamiast stanu błędu — dług starszej strony ujawniony przez lepszy wzorzec w `zapisy.astro`.
- **Fix**: Back-port gałęzi `else { loadFailed = true }` z komentarzem (addendum poza formalnym zakresem S-05, zastosowane za zgodą w triage).
- **Decision**: FIXED

## Stan po triage

`npm test` (104), `npm run lint`, `npm run build` — zielone po poprawkach.
