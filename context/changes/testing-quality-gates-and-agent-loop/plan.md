# Quality Gates and the Per-Edit Agent Loop — Implementation Plan

## Overview

Test rollout Phase 3 (test-plan §3) locks the floor under all six §2 risks. It does not add
tests; it makes the existing layers run where they claim to run: a per-edit hook that talks
back to the agent, a pre-commit that actually fires, a pre-push with the whole-tree checks,
`astro check` as a typecheck gate locally and in CI, one production deploy path that waits
on `ci`, `db-tests` and `e2e`, and a GitHub ruleset that makes those three checks required
for `main`. Every "required" in test-plan §5 becomes verifiable.

## Current State Analysis

From `research.md` (2026-09-09, commit `84d2cbc`):

- **Per-edit**: no `.claude/` directory in the repo; no hooks anywhere.
- **Pre-commit**: `.husky/pre-commit` (`npx lint-staged`) and the `lint-staged` block exist,
  but `package.json` has no `prepare` script and `git config core.hooksPath` is unset —
  Git has never invoked it. `.git/hooks/` holds only samples.
- **Pre-push**: none.
- **Typecheck**: `@astrojs/check` is a dependency with no script; `npx astro check` passes
  today (0 errors, 0 warnings, 4 hints, 18.7 s) and regenerates `.astro/` itself.
- **CI**: job `ci` runs lint → unit → build (1m36s); `db-tests` (2m31s) and `e2e` (3m40s)
  are separate jobs; `deploy.needs: [ci, db-tests, e2e]` and runs only on `main` pushes.
- **Enforcement on GitHub**: the repo is private on GitHub Free — branch protection and
  rulesets APIs return 403. Nothing blocks a direct push to `main`.
- **Second deploy path**: Cloudflare Workers Builds (Git integration) runs on every push;
  the `main` build carries no Preview URL, the PR build does — the signature of a
  production deploy that ignores GitHub checks. Unconfirmed from this machine (wrangler
  not logged in).
- **Costs measured on this machine**: Prettier one file 1.5 s; `vitest related` 1–2 s;
  `npm test` 2.1 s (12 files / 159 tests); type-aware `eslint --fix` one file 7–9 s;
  `astro check` 18.7 s; `npm run lint` 19.8 s.
- **`vitest related` blind spots**: nothing under `src/pages/api/**`, nor
  `src/lib/bookings/queries.ts`, `src/lib/schedule/queries.ts`, `src/lib/schedule/schema.ts`
  (type-only imports are erased from the module graph).
- **Hook contract (Claude Code docs, verified)**: `PostToolUse` fires per tool call;
  `matcher` is an unanchored JS regex; stdin JSON carries `cwd`, `tool_name`,
  `tool_input.file_path` (absolute, backslashes on Windows); exit 2 shows **stderr** to
  Claude; exit 0 stdout is not shown on this event, but JSON
  `hookSpecificOutput.additionalContext` is; `async: true` hooks cannot feed anything
  back; commands run under Git Bash on Windows; `jq` is not installed here; project
  hooks in a committed `.claude/settings.json` run after the workspace-trust dialog;
  default timeout 600 s.
- **Husky 9 runner** (`node_modules/husky/husky`): runs each hook file with `sh -e` and
  `node_modules/.bin` on PATH; `HUSKY=0` skips; a non-zero exit fails the git operation.

## Desired End State

- An agent edit to any tracked file is formatted immediately; an edit under
  `src/lib/bookings/`, `src/lib/schedule/` or `src/pages/api/` runs the related unit
  tests (or the whole 2-second suite plus a note naming the real gate when nothing is
  related); a failing check reaches the agent as stderr with exit 2 within seconds.
- `git commit` runs lint-staged; `git push` runs `npm test` and `npm run check`.
- CI job `ci` runs `npm run check` alongside lint, unit and build.
- Only the GitHub Actions `deploy` job deploys production; Workers Builds produces
  previews only.
- The repo is public and a ruleset on `main` requires `ci`, `db-tests`, `e2e`, and
  forbids force-push and deletion. A push to `main` without those checks is rejected.
- test-plan §4/§5/§6.5/§6.6, AGENTS.md and README describe exactly this, no more.

Verification of the end state as a whole: the three sabotage checks (Phase 1 red commit,
Phase 2 red edit, Phase 4 rejected push) each turn red and then green; `gh api
repos/lukasz-tolpa/stable_booksy_10xdevs/rules/branches/main` lists the three contexts; the
`main` Workers Builds check summary shows a Preview URL and `deploy` is the only
production deployment source.

### Key Discoveries:

- `package.json:5-17` — scripts; no `prepare`, no `check`.
- `.husky/pre-commit:1` — `npx lint-staged`; inert without `core.hooksPath`.
- `.github/workflows/ci.yml:10-25` — job `ci` steps; `astro sync` already runs before lint.
- `.github/workflows/ci.yml:95-97` — `deploy.needs` is the only current enforcement.
- `vitest.config.ts:8-13` — `@` alias and `src/**/*.test.ts` include; `vitest related`
  must run from the repo root.
- `eslint.config.js:72` — `src/db/database.types.ts` is ignored; the hook must skip it too.
- `.gitignore` — `.claude/` is not ignored (good: `settings.json` will be committed);
  `.eslintcache` not listed (not needed: the hook does not run ESLint).
- Prettier 3.8 honours `.gitignore`; `--ignore-unknown` makes unsupported files (e.g.
  `.sql`) a no-op instead of an error (verified).
- `npx astro check` regenerates `.astro/` when missing (verified), so pre-push does not
  need a separate `astro sync`.
- GitHub rulesets REST: `POST /repos/{owner}/{repo}/rulesets` with `target: branch`,
  `enforcement: active`, `conditions.ref_name.include: ["refs/heads/main"]`, rules
  `required_status_checks` (contexts), `non_fast_forward`, `deletion`;
  `GET /repos/{owner}/{repo}/rules/branches/main` lists effective rules.
- Cloudflare Workers Builds settings live under the Worker → Settings → Build: Git
  branch (production), build command, deploy command (`npx wrangler deploy` for the
  production branch, `npx wrangler versions upload` for other branches).

## What We're NOT Doing

- No new unit, integration or e2e tests (Lesson 2 / Phase 1–2 territory). The hook only
  runs tests that exist.
- No migration from Husky to Lefthook.
- No type-aware ESLint in the per-edit hook (decision: 7–9 s per edit is the "slow
  per-edit hook" the brief challenges; lint-staged and CI run the same rules).
- No second, non-type-aware ESLint config.
- No `npm run lint` in pre-push (duplicates lint-staged + CI; +20 s).
- No `test:db` or `test:e2e` in any local hook (Docker, minutes).
- No `pull_request` rule with required reviewers (solo project); no bypass actors.
- No GitHub Pro upgrade; no CI YAML beyond one added step.
- No changes to the risk map, gates definitions beyond their enforcement wording, or §7.
- No hooks for Cursor/Codex/Windsurf/Copilot.

## Implementation Approach

Work on branch `test-rollout/phase-3-quality-gates` and land it by PR, so the new CI
step and (from Phase 4 on) the ruleset are exercised by this change itself. Order:
cheapest local wins first (Phase 1), the agent loop (Phase 2), then the two external
enforcement holes (Phases 3–4, each with a manual step only the account owner can do),
docs last (Phase 5). Every phase ends with a sabotage check: a gate that cannot go red
proves nothing (test-plan §6.2/§6.3 convention).

## Critical Implementation Details

**Feedback channel.** On `PostToolUse` the agent sees **stderr on exit 2**, or
`hookSpecificOutput.additionalContext` in JSON on stdout with exit 0. Plain stdout with
exit 0 is invisible to the agent. The hook therefore writes failures to stderr and
advisory notes as JSON.

**Ruleset timing.** Once the Phase 4 ruleset is active, nothing lands on `main` without
a PR whose checks passed — including the remaining phases of this change. That is the
intended workflow; do the ruleset before the docs phase so the final merge proves it.

**Windows.** Hook commands run under Git Bash; `$CLAUDE_PROJECT_DIR` is a Windows path.
The handler is a Node script (no `jq`, no bash string handling) and normalizes
`tool_input.file_path` with forward slashes before matching.

**`prepare` in CI.** `npm ci` runs `prepare` on the runner; Husky 9 sets `core.hooksPath`
there harmlessly (`.git` exists after checkout). If it ever misbehaves, `HUSKY=0` in the
job env disables it — do not remove the script.

---

## Phase 1: Activate the local gates

### Overview

Make the documented pre-commit real, add pre-push, adopt `astro check` as the typecheck
command shared by pre-push and CI.

### Changes Required:

#### 1. npm scripts

**File**: `package.json`

**Intent**: Husky must install itself on `npm install`/`npm ci`; the typecheck needs a
single name used everywhere.

**Contract**: `"prepare": "husky"` and `"check": "astro check"` added to `scripts`. No
other script changes. Then `npm install` (or `npx husky`) so `core.hooksPath=.husky/_`
is set on this clone.

#### 2. Pre-push hook

**File**: `.husky/pre-push` (new)

**Intent**: Run the whole-tree checks that are too slow per edit but cheap per push.

**Contract**: two lines, `npm test` then `npm run check`; Husky runs the file with
`sh -e`, so the first failure aborts the push. No `#!/usr/bin/env sh` / `husky.sh` shim
(Husky 9). Measured budget ≈ 21 s.

#### 3. CI typecheck step

**File**: `.github/workflows/ci.yml`

**Intent**: The same `npm run check` gates CI so a `--no-verify` push is still caught.

**Contract**: one step `- run: npm run check` in job `ci`, after `npx astro sync` and
before `npm run lint`. If `astro check` needs the env schema satisfied on the runner
(it did not locally with `.dev.vars` present, and `.dev.vars` is not on the runner),
pass the same `SUPABASE_URL`/`SUPABASE_KEY` secrets as the build step — verify on the
first PR run.

#### 4. Branch

**Intent**: All Phase 1–5 commits go on `test-rollout/phase-3-quality-gates`; push the
branch and open a draft PR at the end of this phase so the CI change is exercised.

### Success Criteria:

#### Automated Verification:

- `git config --get core.hooksPath` prints `.husky/_`
- `npm run check` exits 0 (0 errors)
- `npm test` exits 0
- Sabotage: a commit with an ESLint error staged (e.g. an unused variable in a scratch
  `src/lib/tmp.ts`) is rejected by pre-commit; reverting makes it pass
- Sabotage: a push with a deliberately failing unit assertion is rejected by pre-push in
  under ~30 s; reverting makes it pass
- PR run of job `ci` shows the `npm run check` step green

#### Manual Verification:

- Branch `test-rollout/phase-3-quality-gates` pushed, draft PR open, all three jobs green

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 2: Per-edit agent hook

### Overview

A committed Claude Code hook that formats every edited file and runs scoped unit tests
for risk-area files, feeding failures back to the agent within seconds.

### Changes Required:

#### 1. Hook configuration

**File**: `.claude/settings.json` (new, committed)

**Intent**: Register one `PostToolUse` hook for file-writing tools.

**Contract**: `hooks.PostToolUse[0].matcher = "Write|Edit"` (unanchored regex; also
matches `MultiEdit`/`NotebookEdit`, acceptable); one `command` hook running
`node "$CLAUDE_PROJECT_DIR/.claude/hooks/post-edit.mjs"` with `timeout: 60` and a
`statusMessage` such as `format + related tests`. No `async`. Nothing else in the file
(permissions stay in the user's global settings).

#### 2. Hook handler

**File**: `.claude/hooks/post-edit.mjs` (new)

**Intent**: Cross-platform handler: format the touched file, run related tests in risk
areas, never swallow a failure, never block on advice.

**Contract**:

- Reads stdin JSON; takes `tool_input.file_path` and `cwd`; normalizes to a
  forward-slash path relative to `cwd`. Exits 0 immediately when the file is outside
  the project, is `src/db/database.types.ts`, or does not exist (deleted).
- Step A — `prettier --write --ignore-unknown <file>` via the local binary
  (`node_modules/prettier/bin/prettier.cjs`), `spawnSync` with piped stdio, run from
  `cwd`. Prettier honours `.gitignore`; unknown types are a no-op.
- Step B — only when the path starts with `src/lib/bookings/`, `src/lib/schedule/` or
  `src/pages/api/` and ends with `.ts`: `vitest related <file> --run` via
  `node_modules/vitest/vitest.mjs`. If its output contains `No test files found`, run
  `vitest run` (whole suite, ~2 s) instead and remember an advisory note:
  `no unit test imports <file> — run npm run test:e2e / npm run test:db before pushing`
  (`src/pages/api/**` → e2e; `queries.ts`/`schema.ts` → test:db + e2e).
- Failure of A or B (non-zero status): write the child's combined output, truncated to
  the last ~4,000 characters, to **stderr** and exit **2**.
- Success with a note: print `{"hookSpecificOutput":{"hookEventName":"PostToolUse",
"additionalContext":"<note>"}}` to stdout, exit 0. Success without a note: exit 0,
  no output.
- Any exception inside the handler: message to stderr, exit 1 (non-blocking, visible).
  No `try { … } catch { process.exit(0) }` anywhere.
- No dependencies beyond Node built-ins; no ESLint call.

#### 3. Ignore file hygiene

**File**: `.gitignore`

**Intent**: Keep per-machine Claude settings out of the repo.

**Contract**: add `.claude/settings.local.json`. `.claude/settings.json` and
`.claude/hooks/` stay tracked.

### Success Criteria:

#### Automated Verification:

- `echo '{"cwd":"<repo>","tool_name":"Edit","tool_input":{"file_path":"<repo>/src/lib/bookings/slots.ts"}}' | node .claude/hooks/post-edit.mjs` exits 0 and reports 27 tests
- Same with `src/pages/api/bookings/create.ts` exits 0 and prints the JSON note naming `test:e2e`
- Same with `src/db/database.types.ts` exits 0 with no output and does not modify the file
- Same with a temporarily broken assertion in `src/lib/bookings/slots.test.ts` exits 2 with the Vitest failure on stderr; revert
- `npm run lint` passes with the new files present (`.claude/hooks/*.mjs` is covered by the base TS config; adjust `ignores` only if type-aware rules reject a plain `.mjs`)
- Wall time of the handler on `src/lib/bookings/slots.ts` ≤ 5 s, on a non-risk file ≤ 2 s

#### Manual Verification:

- Through Claude Code (workspace trust accepted), edit `slots.test.ts` to a failing
  assertion: the agent's next turn shows the Vitest failure text from the hook; fix it
  back and the hook is silent
- Three consecutive agent edits to risk-area files complete with hook overhead ≤ 15 s total
- An edit to a badly formatted `.astro` or `.md` file comes back Prettier-formatted

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 3: Single production deploy path

### Overview

Confirm whether Cloudflare Workers Builds deploys `main` to production and, if so, make
it preview-only so `deploy.needs` is the only route to production.

### Changes Required:

#### 1. Cloudflare dashboard (manual, account owner)

**Intent**: Determine and fix the production path.

**Contract**: In the Cloudflare dashboard, Workers & Pages → `stable-booksy` → Settings →
Build: record the configured production branch and deploy command. If the production
branch is `main` (or the deploy command is `npx wrangler deploy`), change it so `main`
pushes become non-production builds — set the production branch to an unused name
such as `cloudflare-production-disabled` (previews for every branch, including `main`,
keep working through `wrangler versions upload`). Alternative if the branch field is
not editable: set the production deploy command to `echo "production deploys run from
GitHub Actions"`. Do not disconnect the Git integration (keeps PR preview URLs).

#### 2. Evidence in the repo

**File**: `context/changes/testing-quality-gates-and-agent-loop/plan.md` (this file,
Phase 3 block)

**Intent**: Record what the dashboard showed before and after, so the §6.5 note in
Phase 5 cites facts.

**Contract**: a short "Observed" note under this phase (dates, setting values).

### Observed (2026-09-09) and adaptation

- **Evidence.** `wrangler deployments list` (after `npx wrangler login`) shows two
  production deployments for every push to `main` today: one ~1 min after the push
  (13:28:47Z, 13:33:27Z, 14:31:03Z, 15:08:15Z), before `e2e` (3m20s) could finish, and one
  inside the Actions `deploy` job window (13:31:20Z, 14:34:36Z, 15:11:39Z …). The early
  deployment's Version ID (`3d35bd69…` for the 15:07:22Z push) equals the Version ID in
  the `Workers Builds: stable-booksy` check-run on `main`. Conclusion: Workers Builds
  deployed production from `main` on every push, ignoring the CI gates; Actions deployed
  the same version a second time ~3 minutes later.
- **Decision (user, 2026-09-09): keep Cloudflare Workers Builds as the only production
  path and remove the Actions `deploy` job** — the reverse of the plan's first choice.
  Consequence: the production gate becomes the Phase 4 ruleset on `main` (only a PR
  merge with green `ci`, `db-tests`, `e2e` lands on `main`; direct pushes are rejected).
  Between this phase and Phase 4 a direct push to `main` would still deploy ungated.
  GitHub secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` are now unused (removal
  is optional, owner's call). Changes Required item 1 (dashboard) is not performed; item 2
  is this note. Success criteria 3.1–3.3 are superseded by 3.4–3.6 in `## Progress`.

### Success Criteria:

#### Automated Verification:

- After the next push to `main` (the Phase 5 merge is fine): `gh api repos/lukasz-tolpa/stable_booksy_10xdevs/commits/main/check-runs` shows the `Workers Builds: stable-booksy` summary **with** a Preview URL (non-production signature)
- `npx wrangler deployments list` (after `npx wrangler login`) shows the latest production deployment created by the Actions job (`wrangler` source), not by Workers Builds

#### Manual Verification:

- Dashboard shows the production branch (or deploy command) no longer pointing at `main` deploys; previews still generated for branch pushes

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 4: Public repo and ruleset on `main`

### Overview

Make `ci`, `db-tests` and `e2e` required checks that block merges and direct pushes to
`main`, and forbid force-pushes and deletion.

### Changes Required:

#### 1. Visibility (manual, account owner)

**Intent**: Rulesets on GitHub Free exist only for public repos.

**Contract**: `gh repo edit lukasz-tolpa/stable_booksy_10xdevs --visibility public
--accept-visibility-change-consequences` (or the Settings → Danger zone dialog). Before
flipping, `git log --all -p | grep -iE "service_role|sb_secret|CLOUDFLARE_API_TOKEN"`
style scan confirms no secret was ever committed (`.dev.vars*` and `.env*` are ignored;
seed passwords `sekret123` are demo data by design).

#### 2. Ruleset

**Intent**: Encode the required checks as repository configuration, created and
verifiable by API.

**Contract**: `gh api -X POST repos/lukasz-tolpa/stable_booksy_10xdevs/rulesets` with a
body: `name: "main gates"`, `target: "branch"`, `enforcement: "active"`,
`bypass_actors: []`, `conditions.ref_name.include: ["refs/heads/main"]`, rules:
`{"type":"deletion"}`, `{"type":"non_fast_forward"}`,
`{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"required_status_checks":[{"context":"ci"},{"context":"db-tests"},{"context":"e2e"}]}}`.
Keep the request body as `.github/rulesets/main-gates.json` in the repo for
reproducibility (documentation, not applied automatically).

### Observed (2026-09-09) and adaptation

- Visibility flipped to public (`gh repo edit --visibility public`); history scan found no
  `service_role`/`sb_secret_`/Cloudflare tokens, only the Supabase project URL and the
  `sb_publishable_` key in `context/changes/deployment/deployment-plan.md` (public by
  Supabase's design; RLS proven by `db-tests`). Accepted by the user.
- Ruleset `main gates` (id 22684713) created. **A ruleset with only
  `required_status_checks` did not block a direct push**: the sabotage commit `a352688`
  landed on `main` and GitHub's rule-suite log recorded `required_status_checks=pass`
  for a commit with no checks. The rule is evaluated at PR merge; pushes are blocked
  only when a `pull_request` rule is present. Adaptation (user-approved): add
  `pull_request` with `required_approving_review_count: 0` (forces a PR, not a
  reviewer) — the plan's "no pull_request rule" exclusion meant "no required reviewers".
  `main` was restored to `84d2cbc` by force-push with the ruleset temporarily disabled,
  then the ruleset was re-enabled with the PR rule. The repeated sabotage (empty commit
  `9719f42` pushed to `main`) was rejected: "3 of 3 required status checks are expected"
  and "Changes must be made through a pull request"; rule-suite:
  `required_status_checks=fail, pull_request=fail`.
- **Side effect of the first sabotage:** while `a352688` sat on `main`, GitHub
  auto-marked PR #11 as _merged_ (its commits were contained in `main`); restoring
  `main` does not un-merge it, so the PR stopped syncing (head frozen at `f5e066d`,
  no `pull_request` runs for later pushes). Replaced by PR #12 from the same branch.
  Rows 4.3 / 1.7 now refer to PR #12.

### Success Criteria:

#### Automated Verification:

- `gh api repos/lukasz-tolpa/stable_booksy_10xdevs/rules/branches/main` lists `deletion`, `non_fast_forward` and `required_status_checks` with exactly the three contexts
- Sabotage: `git push origin HEAD:main` from the branch (commits without checks) is rejected with a rule violation message; no change to `main`
- `gh pr view --json mergeStateStatus` on the draft PR reports `BLOCKED` until the three checks are green, then `CLEAN`

#### Manual Verification:

- The PR's merge box lists the three required checks by name

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 5: Docs and cookbook sync, merge

### Overview

Make the documents say what the repo now does, close the change through the ruleset.

### Changes Required:

#### 1. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Flip §5 to its final state and grow the cookbook.

**Contract**:

- §4 row "lint + typecheck": Husky pre-commit **active** (`prepare`), pre-push
  `npm test` + `npm run check`, CI runs `npm run check`; `astro check` "wired" replaces
  "installed but not wired".
- §5 rows: "lint + typecheck" → local pre-commit (lint-staged) + pre-push (`check`) +
  CI, **required — ruleset on `main`**; "unit" → also pre-push; "integration" and
  "e2e" → "required — ruleset on `main`, blocks `deploy`"; "post-edit hook" →
  Where `local (agent loop, committed .claude/settings.json)`, Required?
  `recommended local (final; cannot be enforced outside the agent)`, Catches
  `format drift and failing related unit tests at edit time`; "auto-deploy" → note the
  single path (Actions only).
- New §6.6 "Running the gates and the agent hook": which check runs where and costs
  (per edit ~3 s; commit lint-staged; push ~21 s; CI), how to run each by hand, `HUSKY=0`
  and `--no-verify` are for emergencies and CI still blocks, how to add a risk area to the
  hook (one array in `post-edit.mjs`), why ESLint is not per edit (measured 7–9 s), the
  stderr/exit-2 contract, and the sabotage checks.
- §6.5 Phase 3 note (2–3 lines): Husky was never active; ruleset needs public repo;
  Workers Builds finding and resolution; hook channel is stderr, not stdout.
- §8 freshness ledger: strategy reviewed 2026-09-09.

#### 2. Agent guide

**File**: `AGENTS.md`

**Intent**: Hard rules reflect reality.

**Contract**: line 7 CI rule adds `npm run check` in `ci` and the ruleset; line 50
Husky rule adds `prepare`, pre-push contents, and the Claude Code hook
(`.claude/settings.json`, what it runs, exit-2 contract); "Build, Test" gets
`npm run check`.

#### 3. README

**File**: `README.md`

**Intent**: Public-facing CI/deploy description stays true.

**Contract**: CI section mentions the typecheck step and the ruleset; Deployment section
states Actions is the only production path and Workers Builds produces previews.

#### 4. Merge

**Intent**: Close the change through the new gate.

**Contract**: mark the PR ready, wait for `ci`, `db-tests`, `e2e`, merge (regular
merge, as PR #9). Then the Phase 3 automated checks on `main` can be completed.

### Adaptation (2026-09-09)

- After the Phase 3 decision there is no Actions `deploy` job and Workers Builds is
  the production path, so the original rows 5.2 ("`deploy` succeeded on the merge
  commit") and 5.3 ("Workers Builds is preview-only") no longer describe the end
  state. They are superseded by 5.5 and 5.6 in `## Progress`. PR #11 was replaced
  by PR #12 (see Phase 4 note); "the PR" below means #12.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npx prettier --check context/foundation/test-plan.md AGENTS.md README.md` pass
- PR merged with all required checks green; `deploy` job ran and succeeded on the merge commit
- Post-merge `main` check-runs: `Workers Builds` summary carries a Preview URL (Phase 3 evidence)

#### Manual Verification:

- Test-plan §5 read top to bottom has no "required" that the repo does not enforce

---

## Testing Strategy

### Unit Tests:

- None added (lesson boundary). The hook runs `src/**/*.test.ts` through `vitest related`.

### Integration Tests:

- None added; `db-tests` and `e2e` remain CI-only and become required by the ruleset.

### Manual Testing Steps:

1. Phase 1: stage a lint error, commit → rejected; push a red test → rejected; revert.
2. Phase 2: through Claude Code, break an assertion in `slots.test.ts` → hook output visible in the agent's turn; fix → silent; time three edits.
3. Phase 3: dashboard change, then observe the next `main` build's Preview URL.
4. Phase 4: `git push origin HEAD:main` → rejected; PR merge box shows three required checks.
5. Phase 5: merge; confirm `deploy` ran once and Workers Builds did not deploy production.

## Performance Considerations

Per-edit budget ≤ 5 s on a risk-area file (Prettier ≈ 1.5 s + related tests ≈ 1–2 s;
fallback whole suite ≈ 2 s). Pre-push ≈ 21 s. CI `ci` job grows by ≈ 20 s. Nothing per
edit builds a TypeScript program.

## Migration Notes

- Every clone must run `npm install` once after Phase 1 to get hooks (the `prepare`
  script does it). Existing clones that never had hooks will notice pre-commit for the
  first time.
- From Phase 4 on, all work reaches `main` by PR. `/10x-implement` phase commits go on
  a branch; the archive commit for this change goes through a PR as well.
- Rollback: delete the ruleset (`gh api -X DELETE …/rulesets/<id>`); remove `prepare`
  and `.husky/pre-push`; delete `.claude/`. Repo visibility can be flipped back, but
  the public history remains visible in forks/caches.

## References

- Research: `context/changes/testing-quality-gates-and-agent-loop/research.md`
- Brief: `context/changes/testing-quality-gates-and-agent-loop/change.md`
- Test plan: `context/foundation/test-plan.md` §3 row 3, §4, §5, §6.5
- Prior CI gate work: `context/archive/2026-09-09-testing-rider-loop-in-the-browser/plan.md:503-541`
- Claude Code hooks reference: https://code.claude.com/docs/en/hooks.md
- GitHub rulesets REST: https://docs.github.com/en/rest/repos/rules
- Cloudflare Workers Builds configuration: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Activate the local gates

#### Automated

- [x] 1.1 `core.hooksPath` is `.husky/_` after `npm install` — 8b64425
- [x] 1.2 `npm run check` exits 0 — 8b64425
- [x] 1.3 `npm test` exits 0 — 8b64425
- [x] 1.4 Sabotage: pre-commit rejects a staged ESLint error, passes after revert — 8b64425
- [x] 1.5 Sabotage: pre-push rejects a failing unit assertion in under ~30 s, passes after revert — 8b64425
- [x] 1.6 PR run of job `ci` shows the `npm run check` step green — 8b64425

#### Manual

- [x] 1.7 Branch pushed, draft PR open, three jobs green — 8b64425

### Phase 2: Per-edit agent hook

#### Automated

- [x] 2.1 Handler on `src/lib/bookings/slots.ts` exits 0 and runs the 27 related tests — c9ad47f
- [x] 2.2 Handler on `src/pages/api/bookings/create.ts` exits 0 with the JSON note naming `test:e2e` — c9ad47f
- [x] 2.3 Handler on `src/db/database.types.ts` exits 0 silently and leaves the file untouched — c9ad47f
- [x] 2.4 Handler with a broken assertion exits 2 with the Vitest failure on stderr — c9ad47f
- [x] 2.5 `npm run lint` passes with `.claude/hooks/post-edit.mjs` present — c9ad47f
- [x] 2.6 Handler wall time ≤ 5 s on a risk-area file, ≤ 2 s on a non-risk file — c9ad47f

#### Manual

- [x] 2.7 Failing assertion edited through Claude Code surfaces in the agent's next turn; fix is silent — c9ad47f
- [x] 2.8 Three consecutive agent edits ≤ 15 s total hook overhead — c9ad47f
- [x] 2.9 Badly formatted `.astro`/`.md` edit comes back formatted — c9ad47f

### Phase 3: Single production deploy path

#### Automated

- [x] 3.4 `.github/workflows/ci.yml` has no `deploy` job and no `CLOUDFLARE_*` / `wrangler-action` references — f5e066d
- [x] 3.5 PR run after the push shows exactly the jobs `ci`, `db-tests`, `e2e`, all green — f5e066d
- [ ] 3.6 After the Phase 5 merge, `wrangler deployments list` shows exactly one production deployment for the merge commit, created by Workers Builds (Version ID equals the `main` check-run summary)

### Phase 4: Public repo and ruleset on `main`

#### Automated

- [x] 4.1 `rules/branches/main` lists deletion, non_fast_forward and the three required contexts — b23da53
- [x] 4.2 Sabotage: direct `git push origin HEAD:main` is rejected by the ruleset — b23da53
- [x] 4.3 PR `mergeStateStatus` is `BLOCKED` until checks pass, then `CLEAN`

#### Manual

- [x] 4.4 PR merge box lists `ci`, `db-tests`, `e2e` as required — b23da53

### Phase 5: Docs and cookbook sync, merge

#### Automated

- [x] 5.1 `npm run lint` and Prettier check pass on the edited docs
- [ ] 5.5 PR #12 merged with `ci`, `db-tests`, `e2e` green under the ruleset (merge commit on `main`)
- [ ] 5.6 Post-merge `main` check-runs show `ci`, `db-tests`, `e2e` green and the Workers Builds check for the merge commit

#### Manual

- [x] 5.4 Test-plan §5 contains no unenforced "required"
