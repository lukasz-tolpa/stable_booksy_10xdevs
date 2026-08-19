<!-- PLAN-REVIEW-REPORT -->
# Plan Review: S-04 — Rezerwacja jazdy (slot-booking-flow)

- **Plan**: `context/changes/slot-booking-flow/plan.md`
- **Mode**: Deep
- **Date**: 2026-08-19
- **Verdict**: SOUND (po triage; przed poprawkami: REVISE)
- **Findings**: 1 critical, 0 warnings, 4 observations — wszystkie FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | FAIL (naprawione w triage) |

## Grounding

8/8 ścieżek ✓, 10/10 symboli ✓, brief↔plan ✓. Weryfikacja kodu (sub-agent): 7/7 twierdzeń CONFIRMED — m.in. `getScheduleDay` działa dla roli rider (otwarte polityki SELECT), kolumny pod złączenie RPC istnieją, wzorzec `security definer` + `set search_path = ''` + revoke/grant jest jednolity w migracjach. Uwaga bez findingu: nowa funkcja RPC będzie pierwszą funkcją w `public` wywoływalną przez PostgREST (dotychczasowe helpery żyją w `private`) — plan świadomie to adresuje.

## Findings

### F1 — Placeholder w Manual Verification fazy 2 łamie kontrakt Progress

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Success Criteria
- **Detail**: Bullet-atrapa „(brak — faza czysto logiczna…)" pod `#### Manual Verification:` nie miał odpowiednika w `## Progress` — `/10x-implement` mógłby się wyłożyć na parsowaniu.
- **Fix**: Usunięcie całej podsekcji Manual Verification z fazy 2 (pominięcie pustej podsekcji jest legalne).
- **Decision**: FIXED

### F2 — „?sukces=" nie ma wzorca, na który powołuje się plan

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — strona ośrodka
- **Detail**: W `src/` istnieje wyłącznie kanał `?error=`; kanał sukcesu to nowy wzorzec, rendering był nieopisany.
- **Fix**: Doprecyzowano w kontrakcie strony: parametr sukcesu jest nowy, renderowany jako zielony baner analogiczny do banera błędu.
- **Decision**: FIXED

### F3 — Goły Astro.locals.user.id kłóci się z typami i stylem repo

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 3 — strona ośrodka
- **Detail**: `App.Locals` typuje `user` jako nullable; chronione strony destrukturyzują i dokładają guard (`grafik.astro:13,26`). Gołe `.id` zapaliłoby type-checked ESLint.
- **Fix**: Kontrakt strony wskazuje wzorzec destrukturyzacja + `if (supabase && user)`.
- **Decision**: FIXED

### F4 — Pusta sekcja godziny zostawiona „do decyzji implementera"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — computeSlotSections
- **Detail**: Plan odraczał decyzję o godzinie z kompletem zajętych koni.
- **Fix**: Rozstrzygnięte: godzina bez koni `free`/`mine` jest pomijana w całości (spójne z PRD); godzina z własnym zapisem pozostaje widoczna. Dopisany przypadek testowy.
- **Decision**: FIXED

### F5 — Skrypt współbieżności kasuje slot z ręcznego testu e2e

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Manual Testing Steps
- **Detail**: `concurrent_double_booking.sh` celuje w Kasztana/12:00 i czyści slot przed i po biegu (delete jako postgres) — odpalony po pętli ręcznej skasowałby zapis Anny.
- **Fix**: Manual Testing Steps mają teraz jawną kolejność: skrypt współbieżności przed pętlą ręczną, z notą wyjaśniającą.
- **Decision**: FIXED
