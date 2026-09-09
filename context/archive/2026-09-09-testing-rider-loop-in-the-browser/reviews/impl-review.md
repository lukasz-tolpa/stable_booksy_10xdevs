<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Rider Loop in the Browser (test rollout Phase 2)

- **Plan**: `context/changes/testing-rider-loop-in-the-browser/plan.md`
- **Scope**: Phases 1–5 of 5 (full plan), commits `e8765f6`…`c2f5a01` (merge `aec2b84`)
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION → APPROVED after triage (7 fixed, 1 accepted as documented exception)
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict (before triage) |
|-----------|---------|
| Plan Adherence | PASS (minor drift F7) |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Success criteria re-run independently on 2026-09-09: `npm test` 12 files / 157 tests; `npm run lint` clean; `npx prettier --check` on the three docs clean; `npx playwright test` 5/5 green against a fresh seed with no leftover bookings; `npm run build` complete; Progress 27/27 with SHAs. Git scope: 29 files, all planned except `package-lock.json` (follows `package.json`) and the change's own artifacts.

## Findings

### F1 — Nightly two-hour window where the suite fails deterministically

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (reliability)
- **Location**: e2e/helpers.ts (openStable); supabase/seed.sql:121
- **Detail**: Seed day is `current_date + 1` in the container's UTC; the rider page defaults to tomorrow in Europe/Warsaw and `openStable` read that default. Between 22:00–24:00 UTC the two differ by a day, so the suite (CI included, right after a fresh seed) failed with the "seed stale" hint.
- **Fix A ⭐ Recommended**: `openStable` computes the seed's own day (UTC tomorrow, `seedDay()`) and opens the stable page with an explicit `?dzien=`; asserts the day input echoes it.
  - Strength: Test-only; matches the plan's original intent; respects "no Phase 1 SQL changes".
  - Tradeoff: Inside the window the day is Warsaw "today" (current-hour filter hides nothing from 10–15).
  - Confidence: HIGH — arithmetic checked for both DST offsets.
  - Blind spot: A seed loaded before midnight Warsaw and run after is still stale; the hint covers it.
- **Fix B**: Seed and DB scripts in Warsaw time (`(now() at time zone 'Europe/Warsaw')::date + 1`).
  - Strength: Fixes the source for every consumer.
  - Tradeoff: Touches Phase 1 SQL scripts and db-tests; three files move together.
  - Confidence: MEDIUM.
  - Blind spot: Other readers of `current_date`.
- **Decision**: FIXED (Fix A)

### F2 — Rider-loop scenario has no cleanup; a mid-run failure poisons the retry

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: e2e/rider-loop.spec.ts
- **Detail**: Kasztan@13 was booked at step 2 with no guarded cleanup; a later failure left an active booking, so the CI retry failed on "button not visible" and masked the original cause (observed during Phase 2 sabotage).
- **Fix**: Flag-guarded cleanup (`state.booked` set after the badge assertion, cleared after cancel), cancel via "Odwołaj", original error rethrown first; `asError` moved to `e2e/helpers.ts` and shared with the refusal spec.
- **Decision**: FIXED

### F3 — Nothing pins the e2e suite to the local stack

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (data safety)
- **Location**: playwright.config.ts; e2e/auth.setup.ts
- **Detail**: The Supabase target is whatever `.dev.vars` the build snapshots; with a cloud `.dev.vars` the setup would create `sekret123` accounts and bookings in production. The DB scripts have this guard (`_psql.sh`), e2e had none.
- **Fix**: `assertLocalSupabaseTarget()` in `playwright.config.ts` parses `.dev.vars` and refuses any host but 127.0.0.1/localhost unless `E2E_ALLOW_REMOTE=1`. Verified: remote URL → config throws; opt-out lists tests.
- **Decision**: FIXED

### F4 — reuseExistingServer can reuse a server built from another .dev.vars

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: playwright.config.ts
- **Detail**: Locally anything on the default port 4321 (an `astro dev`, a stale preview) was reused, contradicting the build-snapshot invariant documented in the same file.
- **Fix**: Dedicated port 4173 (`npm run preview -- --port 4173`, baseURL 4173). Verified: suite green on 4173.
- **Decision**: FIXED

### F5 — Read-back comment describes a failure Postgres does not allow

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (accuracy)
- **Location**: src/lib/bookings/queries.ts (createBooking doc comment); test-plan §6.4
- **Detail**: With `RETURNING`, Postgres applies the SELECT policy to the inserted row and fails the whole INSERT (42501, rolled back); a narrowed policy cannot leave an orphan booking, it makes booking impossible.
- **Fix**: Both texts reworded to the actual failure mode.
- **Decision**: FIXED

### F6 — Stale test-base profile text in test-plan §4

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (docs)
- **Location**: context/foundation/test-plan.md §4 profile paragraph; §4/§5 lint rows
- **Detail**: Profile still said "sparse … no browser tests … hand-run scripts"; lint rows claimed Husky runs lint + typecheck while `.husky/pre-commit` runs lint-staged only.
- **Fix**: Profile paragraph now records the start state and the post-Phase-2 state; lint rows state CI `npm run lint` and Husky lint-staged, `astro check` not wired.
- **Decision**: FIXED

### F7 — cancelSchema blank rows not table-covered

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/bookings/schema.test.ts
- **Detail**: Only `""` → `success false` was asserted for `bookingId`; the plan asked for blank/whitespace rows with the field message.
- **Fix**: `it.each([[""], ["   "]])` asserting path `["bookingId"]` and "Nieprawidłowy zapis".
- **Decision**: FIXED

### F8 — One attribute selector in e2e as a documented exception

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: e2e/helpers.ts (`waitForIslands`)
- **Detail**: `page.locator("astro-island[ssr]")` waits for hydration, which has no accessible signal; rationale documented in the helper, §6.3 and §6.5.
- **Fix**: Accept as the recorded exception.
- **Decision**: ACCEPTED

## Triage summary

Fixed: F1 (Fix A), F2, F3, F4, F5, F6, F7 (7). Accepted: F8 (1). Fixes verified: unit tests, lint, Prettier, e2e 5/5 on port 4173, guard negative test. Committed as a follow-up on `main` after the review.
