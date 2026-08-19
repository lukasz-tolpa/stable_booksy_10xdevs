<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-03 Katalog ośrodków z filtrowaniem

- **Plan**: `context/changes/stable-directory/plan.md`
- **Scope**: Phase 1 of 2
- **Date**: 2026-08-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Zakres zmian

Sześć plików z „Changes Required" fazy 1, zero nadmiarowych, zero brakujących:

- `src/lib/stables/search.ts`, `queries.ts`, `search.test.ts`
- `src/components/stables/StableCard.astro`, `StableFilter.astro`
- `src/pages/jezdziec/index.astro`

## Weryfikacja kryteriów

Automatyczne (uruchomione ponownie w trakcie przeglądu): `npm test` (37 testów), `npm run lint`, `npm run build` — wszystkie exit 0. Sześć kryteriów fazy 1 potwierdzone.

Ręczne (1.7–1.9) słusznie pozostają `[ ]` — brak śladu podbicia na wyrost.

Dodatkowo sprawdzono łańcuch sanityzacji na żywo, nie tylko testem jednostkowym: `\`, `_`, `(abc)`, `"abc"`, `a.b`, przecinek i fraza 300-znakowa dają 200 zamiast błędu zapytania.

## Findings

### F1 — Katalog rzuca wyjątkiem tam, gdzie panel ośrodka milczy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis, warto się zatrzymać
- **Dimension**: Safety & Quality
- **Location**: `src/lib/stables/queries.ts:29`
- **Detail**: `listStables` przy błędzie robi `throw error`, więc awaria bazy dawała jeźdźcowi stronę 500 zamiast katalogu. Siostrzana strona z S-01 (`src/pages/osrodek/index.astro:13`) zachowuje się odwrotnie — ignoruje błąd po cichu. Dwie strony tej samej aplikacji miały przeciwne filozofie obsługi błędu i żadna nie była świadomą decyzją planu.
- **Fix A ⭐ Recommended**: Złapać błąd w katalogu i pokazać stan awarii
  - Strength: Katalog jest ekranem startowym roli, więc jego awaria psuje całe wejście do aplikacji; trzeci stan dokłada się obok dwóch pustych, które już tam są.
  - Tradeoff: Trzeci wariant w gałęzi renderującej i jeden tekst więcej.
  - Confidence: MED — wzorzec „stan zamiast wyjątku" jest w projekcie ustalony, ale nikt go świadomie nie zdecydował.
  - Blind spot: Nie sprawdzono, jak Cloudflare Workers renderuje 500 na produkcji.
- **Fix B**: Ujednolicić w drugą stronę — niech `/osrodek` też rzuca
  - Strength: Błędy przestają być połykane.
  - Tradeoff: Dotyka pliku spoza tej fazy; zamienia jeden zły stan na drugi.
  - Confidence: MED.
  - Blind spot: Nie prześledzono, czy middleware S-01 fazy 4 nie polega na tym, że błąd odczytu stadniny wygląda jak jej brak.
- **Decision**: FIXED (Fix A) — `src/pages/jezdziec/index.astro` łapie błąd i renderuje stan awarii; `/osrodek` celowo nietknięty. Testy, lint i build zielone po zmianie.

### F2 — Sanityzacja szersza niż kontrakt planu, nieudokumentowana

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista
- **Dimension**: Plan Adherence
- **Location**: `src/lib/stables/search.ts:28`
- **Detail**: Plan opisywał jedną warstwę ochrony — ekranowanie metaznaków `LIKE`. Kod robi to (linia 35), ale najpierw usuwa znaki strukturalne wyrażenia PostgREST (`,` `(` `)` `"`). Dodatek jest konieczny — bez niego fraza z przecinkiem rozbija warunek `or()` z `queries.ts:23` — ale plan pozostawał niepełnym opisem kodu.
- **Fix**: Dopisać drugą warstwę do kontraktu `search.ts` w planie fazy 1.
- **Decision**: FIXED — kontrakt w planie opisuje teraz obie warstwy i ich kolejność.

### F3 — Brak jawnego limitu wyników

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja, poprawka oczywista
- **Dimension**: Safety & Quality
- **Location**: `src/lib/stables/queries.ts:19`
- **Detail**: `listStables` nie ma `.limit()`. Jedyną granicą jest `max_rows = 1000` z `supabase/config.toml:18` — ograniczenie środowiska, nie kodu.
- **Fix**: Zostawić i wrócić razem ze stronicowaniem, albo dopisać jawny `.limit()`.
- **Decision**: SKIPPED — przy `data_volume: small` z PRD `max_rows` wystarcza; temat wraca razem ze stronicowaniem.

## Poza zakresem przeglądu

- Gałąź „nie ma jeszcze żadnych ośrodków" nie została sprawdzona — lokalna baza ma cztery stadniny, a to jest stan, który zobaczy każdy na produkcji (seed jest wyłącznie lokalny).
- `context/foundation/lessons.md` nie istnieje, choć workflow się do niego odwołuje.
