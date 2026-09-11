<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Certification Readiness

- **Plan**: `context/changes/certification-readiness/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-10
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 2 critical, 5 warnings, 1 observation (all fixed)

## Verdicts

| Dimension             | Verdict | After fixes |
| --------------------- | ------- | ----------- |
| End-State Alignment   | WARNING | PASS        |
| Lean Execution        | WARNING | PASS        |
| Architectural Fitness | PASS    | PASS        |
| Blind Spots           | WARNING | PASS        |
| Plan Completeness     | FAIL    | PASS        |

## Grounding

12/12 paths ✓, 5/5 symbols ✓, brief↔plan ✓. `docs/reference/contract-surfaces.md`
absent — surface check skipped by convention.

## Findings

### F1 — Phase 4 carries a Success Criteria bullet with no Progress entry

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Production demo data
- **Detail**: `#### Automated Verification:` held the bullet "None — this phase changes no code." with no matching checkbox in Progress, breaking the one-to-one contract that `/10x-implement` parses.
- **Fix**: Removed the heading and its bullet; Progress already omitted the empty subsection.
- **Decision**: FIXED

### F2 — No tracked step merges and deploys before the production phase

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: End-State Alignment
- **Location**: Phase 4, and the gap between Phase 3 and Phase 4
- **Detail**: Phase 4's criteria all exercise production, but nothing covered merging the pull request or confirming the deploy. The archived `ui-redesign` plan tracked this as item 7.5; this plan had dropped it, leaving 4.1–4.4 unreachable.
- **Fix A ⭐ Recommended**: Added "Pull request merged with `ci`, `db-tests` and `e2e` green" as criterion 3.4, renumbered the Phase 3 manual item to 3.5, and gave Phase 4 an explicit Prerequisite paragraph naming 3.4.
- **Fix B**: Split Phase 4 into its own change — rejected as too heavy three days before the deadline.
- **Decision**: FIXED via Fix A

### F3 — How the browser spec learns the rider's name is unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1, changes 7 and 8
- **Detail**: The plan said the name would be "returned or exposed" so the loop spec could assert it. Setup and spec run as separate Playwright projects sharing only files on disk; the storage state carries cookies, not a name.
- **Fix**: Named the mechanism — `RIDER_A_NAME` / `RIDER_B_NAME` exported from `e2e/helpers.ts` beside the existing `RIDER_A_STATE` constants, imported by both files, with the reasoning recorded.
- **Decision**: FIXED

### F4 — A public repository will publish working production credentials

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Implementation Approach table, Phase 2
- **Detail**: The repository is public. A live stable account in README can edit the schedule, deactivate horses and read every booking, so a stranger could empty the demo before the reviewer opens it — recreating the failure Phase 4 exists to prevent.
- **Fix A ⭐ Recommended**: Publish both accounts and label the demo data disposable in README, inviting the reader to register their own account, with a refresh expected if someone has emptied it.
- **Fix B**: Publish only the rider account — rejected, it hides the stable side, which the PRD treats as the primary persona.
- **Decision**: FIXED via Fix A

### F5 — The session test fixture is not in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, change 6
- **Detail**: `src/lib/auth/session.test.ts` shares one `input` fixture across five `signUpOutcome` calls. A required `fullName` breaks typecheck at all five; the plan described extending the stub but never the fixture.
- **Fix**: Added the fixture update to change 6, mirroring how change 5 already handles `validSignUp`.
- **Decision**: FIXED

### F6 — "No visual changes" contradicts Phase 1

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: What We're NOT Doing, versus Phase 1 and criterion 1.6
- **Detail**: The scope boundary forbade visual changes while Phase 1 adds a field to the sign-up screen and criterion 1.6 checks its rendering at two widths.
- **Fix**: Reworded to exclude redesign work and to name the new sign-up field as the one permitted visual delta.
- **Decision**: FIXED

### F7 — A Phase 4 step edits a Phase 2 artifact

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4, step 4
- **Detail**: Step 4 deferred a decision about the `cert-test-*` accounts and, depending on the answer, required a README edit — but README is written and committed in Phase 2.
- **Fix**: Decided in the plan. The `cert-test-*` pair is deleted alongside the two audit accounts; README names only the demo pair; step 4 removed.
- **Decision**: FIXED

### F8 — The demo schedule expires before the review might happen

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4, step 1
- **Detail**: Seven days from 2026-09-10 runs out on the 17th, while feedback may arrive up to two weeks after the 14th deadline. A late reviewer would meet the empty state again.
- **Fix**: Schedule extended to thirty days, with the reasoning recorded in the step; criteria 4.3 and the brief updated to match.
- **Decision**: FIXED
