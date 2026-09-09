<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Rider Loop in the Browser (test rollout Phase 2)

- **Plan**: `context/changes/testing-rider-loop-in-the-browser/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-09
- **Verdict**: REVISE → SOUND after triage (all five findings fixed in the plan)
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict (before triage) |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding

13/13 paths ✓ (`schema.ts`, `errors.ts`, `slots.ts`, `[id].astro`, `queries.ts`, `create.ts`, `save.ts`, `eslint.config.js`, `.gitignore`, `ci.yml`, `AGENTS.md`, `README.md`, `test-plan.md`), 5/5 symbols ✓ (`errorCode` in both endpoints, `createBooking` single caller, `HorseListItem` has `id/name/active`, `bookings_select_own_or_my_stable` allows own-row SELECT, `computeSlotSections`), brief↔plan ✓ (5 phases, decisions, scope), Progress↔Phases ✓ (one `## Progress`, 5/5 phases matched, no checkboxes outside it).

Deep verification (sub-agent, node_modules traced): `astro:env` secrets resolve from the worker `env`; preview's miniflare fills it from `dist/server/.dev.vars`, a build-time snapshot of root `.dev.vars` (`@cloudflare/vite-plugin` `getLocalDevVarsForPreview`, wrangler `getVarsForDev`); `process.env` excluded unless `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`. ESLint: `baseConfig` already covers `e2e/**`; minimal React exclusion is `ignores` inside `reactConfig`. Prettier 3.8 honours `.gitignore`. `astro sync/build` do not touch `e2e/`. tsconfig `verbatimModuleSyntax` applies to specs.

## Findings

### F1 — CI env plumbing targets the wrong layer

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details; Phase 4 — e2e job
- **Detail**: The plan exported `SUPABASE_URL`/`SUPABASE_KEY` into `$GITHUB_ENV` and treated `.dev.vars` as a fallback. The built worker reads only the `.dev.vars` snapshot taken at `astro build`; the CI preview would have booted with `createClient()` returning null.
- **Fix**: `.dev.vars` written from `supabase status -o env` before `npm run build` is the only path; `$GITHUB_ENV` export dropped; Critical Details rewritten; brief updated.
- **Decision**: FIXED (Fix in plan)

### F2 — Shared errorCode placed inside the bookings area

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — change 3
- **Detail**: Moving `errorCode` into `src/lib/bookings/errors.ts` would make `schedule/save.ts` import from the bookings area; `save.ts` also has a sibling `errorMessage()` the plan omitted.
- **Fix**: New `src/lib/db-errors.ts` with `errorCode` + `errorMessage` and `db-errors.test.ts`; both endpoints import from there; `bookings/errors.test.ts` keeps the message-table assertions; §6.4 wording and brief updated.
- **Decision**: FIXED (Fix in plan)

### F3 — Read-back can invert the risk #3 failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — change 6
- **Detail**: `.insert().select('id').single()` depends on the rider's own-row SELECT policy; a narrowed policy would persist the row and show the fallback error.
- **Fix**: Dependency named in `createBooking`'s doc-comment contract; §6.4 line added ("re-run e2e after any RLS change on that table").
- **Decision**: FIXED (Fix in plan)

### F4 — Refusal cleanup can mask the real failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — change 1, step 5
- **Detail**: Unconditional cleanup assertion in `finally` would replace the original error when B never booked.
- **Fix**: `bookedByB` flag set after B's badge assertion; cleanup cancels and asserts only when set; original error rethrown first.
- **Decision**: FIXED (Fix in plan)

### F5 — Phase 4 success criteria assume a PR exists

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Success Criteria; Phase 2 — change 7
- **Detail**: History is direct pushes to `main`; criteria 4.1/4.4 observe a PR run and a forced failure. Spec files need `import type` under `verbatimModuleSyntax`.
- **Fix**: Phase 4 overview states branch + `gh pr create`, merge after green; Phase 2 change 7 gives the exact ESLint `ignores` and the `import type` note.
- **Decision**: FIXED (Fix in plan)
