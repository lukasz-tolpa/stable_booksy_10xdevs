<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Quality Gates and the Per-Edit Agent Loop

- **Plan**: context/changes/testing-quality-gates-and-agent-loop/plan.md
- **Scope**: Phase 4 of 5
- **Date**: 2026-09-09
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — Live ruleset differs from the committed record: GitHub-added defaults

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/rulesets/main-gates.json:14-23 vs ruleset 22684713
- **Detail**: GitHub added `required_reviewers: []`, `allowed_merge_methods: [merge, squash, rebase]` and `require_extra_approval_for_unattributed_changes: true` to the `pull_request` rule. With 0 required approvals the last one may demand one approval for commits GitHub cannot attribute to an account — in a solo repo nobody can give it, so a merge could stall. The record file drifted from reality on day one.
- **Fix**: Pin the full `pull_request` parameter set in the file with `require_extra_approval_for_unattributed_changes: false` and `allowed_merge_methods: ["merge"]` (PR #9 style), PUT the ruleset, compare live vs file; the comparison command goes to §6.6 in Phase 5.
  - Strength: Removes the only parameter that can block a reviewer-less merge; the file becomes a faithful record.
  - Tradeoff: One PUT and one commit; `allowed_merge_methods` is a history-style decision (single merge commit as before).
  - Confidence: MED — parameter semantics inferred from its name; PR state is "unknown" so blocking is not yet observable.
  - Blind spot: Whether commits carrying a Co-Authored-By trailer count as "unattributed" — only a recomputed PR state will tell.
- **Decision**: FIXED — file pinned with the full pull_request parameter set (`require_extra_approval_for_unattributed_changes: false`, `allowed_merge_methods: ["merge"]`), ruleset 22684713 updated via PUT, live == file verified

### F2 — 4.3 not verifiable: PR #11 stuck in "unknown", PR head lags at f5e066d

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: PR #11 (API: mergeable_state=unknown, head f5e066d, no CI run for b23da53)
- **Detail**: origin branch is at b23da53 but the PR still reports head f5e066d and no workflow run exists for b23da53 (a Workers Builds check-run does). Looks like GitHub lag after the main force-push and the visibility change. Row 4.3 stays unchecked; not a phase defect.
- **Fix**: Re-poll in a few minutes; if still stale, an empty commit on the branch (or close/reopen the PR) forces recomputation. Close 4.3 when the PR is marked ready in Phase 5.
- **Decision**: FIXED — root cause was not lag: GitHub had auto-marked PR #11 as merged when the sabotage push put its commits on main, so it stopped syncing. Replaced by PR #12 from the same branch; 4.3 to be closed when PR #12 is marked ready (Phase 5)

### F3 — Restoring main by force-push re-ran the old workflow with the deploy job

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — no decision; resolves itself at merge
- **Dimension**: Safety & Quality
- **Location**: CI run on main (84d2cbc, in_progress 20:36Z)
- **Detail**: main is at 84d2cbc whose ci.yml still has the deploy job — after green gates Actions deploys the pre-phase state once more (same app), next to the Workers Builds deployment. The job disappears when PR #11 merges.
- **Fix**: None. Worth a line in the §6.5 Phase 3 note (Phase 5).
- **Decision**: ACCEPTED — no change; line for the §6.5 Phase 3 note in Phase 5

### F4 — Docs still describe the deploy job and a private repo

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — planned
- **Dimension**: Plan Adherence
- **Location**: README.md:172, AGENTS.md:7, test-plan.md §4 row "integration", §6.3
- **Detail**: Four places say "deploy waits on the three jobs"; nothing mentions the ruleset or Workers Builds as the only production path. Phase 5 scope — recorded so it is not lost.
- **Fix**: Phase 5 (no plan change).
- **Decision**: ACCEPTED — Phase 5 scope

### F5 — bypass_actors: [] — nobody, owner included, can bypass the ruleset

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — deliberate plan decision
- **Dimension**: Architecture
- **Location**: .github/rulesets/main-gates.json:5
- **Detail**: If CI is down (e.g. an Actions outage) main is frozen until the owner edits the ruleset via API/dashboard — that path remains, so no deadlock. Matches the plan ("no bypass actors").
- **Fix**: None; a reminder about `gh api -X PUT …/rulesets/22684713` belongs in §6.6.
- **Decision**: ACCEPTED — no bypass; PUT reminder goes to §6.6 in Phase 5
