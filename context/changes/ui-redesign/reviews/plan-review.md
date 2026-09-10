<!-- PLAN-REVIEW-REPORT -->

# Plan Review: UI Redesign — "Horse to go" Visual System

- **Plan**: context/changes/ui-redesign/plan.md
- **Mode**: Deep
- **Date**: 2026-09-10
- **Verdict**: REVISE → SOUND after triage (all 7 findings fixed in the plan)
- **Findings**: 1 critical, 2 warnings, 4 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

15/15 existing paths ✓, 5/5 new paths correctly absent ✓, 4/4 symbols ✓
(`FormField.tsx:44` name-from-id, `horseIds`, `astro-island[ssr]`,
`.slots form{display:contents}`), brief↔plan ✓ apart from the shared F4 miscount.
`docs/reference/contract-surfaces.md` does not exist — surface check skipped.

Verified clean, no finding raised: the `display: contents` mechanism is correct (today
the `<form>` is the flex item, not the button); the shadcn/DESIGN.md token layering is
internally consistent; no CSP exists that would block Google Fonts; all five shared
components have three or more consumers, so they are not premature abstraction.

## Findings

### F1 — Phase 1 has 9 success criteria but 8 Progress rows

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Success Criteria / Progress
- **Detail**: The hero size check appears twice ("node scripts/hero.mjs produces public/hero.webp ≤ 200 KB" and "node -e … size check confirms the committed public/hero.webp is ≤ 200 KB"). Progress carries only 1.1–1.8, so one criterion has no row. `/10x-implement` treats Progress as the source of truth, so the orphaned criterion would never be verified.
- **Fix**: Delete the duplicated `node -e` bullet from Phase 1's Automated Verification; criterion 1.5 already covers it.
- **Decision**: FIXED — duplicated `node -e` criterion deleted; Phase 1 now has 8 criteria and 8 Progress rows

### F2 — Phase 2 silently removes the landing's navigation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Phase 2 — Landing `/`
- **Detail**: `src/pages/index.astro` does not render `<Topbar />` — `Welcome.astro:28` does, and Phase 2 stops importing Welcome. The Phase 2 contract never mentions the topbar, so `/` would ship with no header: no brand, no "Zaloguj się", no "Załóż konto". This contradicts DESIGN.md §4 and `landing.html`, which carries a `.nav`. No e2e assertion covers `/`.
- **Fix**: Add `<Topbar />` to the Phase 2 contract, above the hero, and name it in manual criterion 2.5.
- **Decision**: FIXED — Phase 2 contract now renders `<Topbar />` explicitly, with the reason recorded; criterion 2.5 names it

### F3 — `scripts/hero.mjs` depends on a transitive `sharp`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Hero asset
- **Detail**: `npm ls sharp` resolves it only under `astro@6.3.1`; it is in neither `dependencies` nor `devDependencies`. The script is meant to be re-run rarely — exactly when a changed Astro dependency tree would make it fail with a confusing "cannot find module".
- **Fix**: Add `sharp` to `devDependencies` in Phase 1 (already on disk, so no install cost).
- **Decision**: FIXED — Phase 1 adds `sharp` to `devDependencies` with the transitive-dependency reason recorded

### F4 — Plan counts 11 screens; there are 12

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Overview, Desired End State, Phase 7 (and plan-brief.md)
- **Detail**: `find src/pages -name "*.astro"` returns 12 pages. The twelfth is `/osrodek/nowa-stadnina`, which Phase 5 covers — a wrong number, not a coverage gap.
- **Fix**: Replace "11 screens" with "12 screens" in all four places.
- **Decision**: FIXED — 11 → 12 screens in all three plan locations and in the brief

### F5 — Phase 1's manual criterion misdescribes the intermediate state

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Manual Verification (1.8)
- **Detail**: Criterion 1.8 says "Pages still render readably (dark page content on the new light background is expected)". The codebase has 53 `text-white` and 50 `text-purple-100/200/300` occurrences across 21 files, so those pages render near-white text on a near-white background — unreadable, not dark. `toBeVisible()` ignores contrast, so criterion 1.6 passes regardless. As written it invites fixing pages inside Phase 1.
- **Fix**: Reword to state that pages are expected to be unreadable until their own phase lands, and that only the topbar, banners and shell are judged in Phase 1.
- **Decision**: FIXED — criterion 1.8 now states pages are expected to be unreadable until their own phase, and that `toBeVisible()` ignores contrast

### F6 — `tw-animate-css` removal is hedged when it can be stated

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 7 — Dead code and assets
- **Detail**: The plan says remove it "if nothing else uses it". Verified: no `animate-in`, `animate-out`, `fade-*`, `zoom-*` or `slide-in-from-*` class appears in `src`. The single `animate-spin` (`SubmitButton.tsx:22`) is core Tailwind, defined in `node_modules/tailwindcss/index.css`.
- **Fix**: State it as a verified fact and drop the conditional.
- **Decision**: FIXED — hedge replaced with the verified fact (no tw-animate-css class in `src`; `animate-spin` is core Tailwind)

### F7 — The chestnut budget is checked on 2 of 7 phases

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: End-State Alignment
- **Location**: Phases 3, 5, 6 — Manual Verification
- **Detail**: "Chestnut at most twice per screen" is in the Desired End State and is a DESIGN.md §7 rule, but only Phases 2 and 4 verify it. Phase 5 hands the accent to "Zapisz grafik" without checking it is the screen's only chestnut.
- **Fix**: Add the same one-line manual check to Phases 3, 5 and 6.
- **Decision**: FIXED — chestnut budget check added to Phases 3, 5 and 6 (rows 3.8, 5.8, 6.7)
