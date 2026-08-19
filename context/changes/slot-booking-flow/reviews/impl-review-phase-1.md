<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-04 — Rezerwacja jazdy (slot-booking-flow)

- **Plan**: `context/changes/slot-booking-flow/plan.md`
- **Scope**: Phase 1 of 3 (Zajętość slotów w bazie)
- **Date**: 2026-08-19
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation (FIXED)

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

Working tree zawierał dokładnie planowane zmiany: migracja `20260819090000_booking_slot_occupancy.sql` (nowa), `supabase/tests/rls_isolation.sql` (rozszerzony), `src/db/database.types.ts` (regenerowany, pojedynczy hunk w `Functions`) + folder zmiany. Agent driftu: **4/4 MATCH, zero driftu, zero scope creep**. Kryteria automatyczne re-zweryfikowane w trakcie przeglądu: `db reset` + seed, lint, `rls_isolation.sql` — komplet PASS.

Uwagi bez akcji (potwierdzone przez agenta bezpieczeństwa):
- Umieszczenie funkcji w `public` zamiast `private` to wymuszone odstępstwo (PostgREST eksponuje tylko `public`/`graphql_public` per `config.toml`) — udokumentowane w komentarzu migracji.
- Higiena security definer wzorcowa: `search_path=''`, obiekty kwalifikowane schematem, revoke z `public` i `anon`, `stable`, typowane parametry (zero wektorów wstrzyknięcia). Funkcja zwraca wyłącznie zajętość (koń×godzina) — brak `rider_id`, brak historii odwołań.
- Asercje failują głośno w obu kierunkach (`ON_ERROR_STOP`; FAIL o kodzie P0001 nie jest łapany przez handler `insufficient_privilege`).

## Findings

### F1 — Nieprzetestowane krawędzie funkcji get_taken_slots

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/rls_isolation.sql (blok S-04)
- **Detail**: Brak asercji, że (a) zapis `cancelled` znika z zajętości (filtr `status='active'` — istotne dla S-06, gdzie odwołanie ma zwalniać slot) i (b) nieistniejący ośrodek/dzień zwraca pusty zbiór, nie błąd.
- **Fix**: Dopisane w bloku jeźdźca: odwołanie własnego zapisu Anny w transakcji + asercja, że funkcja przestaje go zwracać (1→0 slotów Pod Dębem); asercja `count=0` dla `stable_id` 999999. Obie PASS; rollback przywraca stan seeda.
- **Decision**: FIXED
