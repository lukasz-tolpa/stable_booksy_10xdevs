---
date: 2026-09-09T17:45:00+02:00
researcher: Claude (Fable 5.1)
git_commit: 84d2cbcb4adaaaff5d90b9da936e064100efe120
branch: main
repository: lukasz-tolpa/stable_booksy_10xdevs
topic: "Test rollout Phase 3 — quality gates and the per-edit agent loop: what exists, what is enforced, what each layer costs"
tags: [research, testing, hooks, quality-gates, ci, husky, eslint, vitest, astro-check, cloudflare]
status: complete
last_updated: 2026-09-09
last_updated_by: Claude (Fable 5.1)
---

# Research: Quality gates and the per-edit agent loop (test-plan §3 Phase 3)

**Date**: 2026-09-09T17:45:00+02:00
**Researcher**: Claude (Fable 5.1)
**Git Commit**: 84d2cbcb4adaaaff5d90b9da936e064100efe120
**Branch**: main
**Repository**: lukasz-tolpa/stable_booksy_10xdevs

## Research Question

From `change.md`: lock the floor under all six §2 risks by (1) running lint + typecheck at
edit time inside the agent loop — a `PostToolUse` hook on `Write|Edit` that lints/formats
the touched file and, only for risk-area files (`src/lib/bookings`, `src/lib/schedule`,
`src/pages/api`), runs `vitest related --run`; (2) keeping pre-commit on Husky +
lint-staged and adding a pre-push with the heavier checks (`npm test`, `astro check` if
adopted); (3) making every test layer a required CI gate — verify branch protection on
`main` actually requires `ci`, `db-tests`, `e2e` — and flipping the §5 post-edit row to
its final state. Challenge "a slow per-edit hook is fine" and "the hook replaces CI".
Avoid: whole suite per edit, hooks that swallow exit codes, gates documented but not
enforced.

## Summary

Three of the four gate layers this phase is supposed to "lock" are either not enforced
today or cannot be enforced the way the brief assumes. Research is the ground truth here
(test-plan §1 principle #3):

1. **Pre-commit is documented but not active on this clone.** `.husky/pre-commit` exists
   (`npx lint-staged`) and AGENTS.md/README describe it, but `package.json` has no
   `prepare` script and `git config core.hooksPath` is unset, so Git never calls it. The
   Husky 9 install step never ran. Every commit in the history was made without the
   lint-staged gate. Fix is two lines (`"prepare": "husky"` + `npm install`), and the same
   mechanism carries the new `.husky/pre-push`.
2. **Branch protection / rulesets are unavailable on this repo.** The repo is private on
   GitHub Free; both the branch-protection and rulesets APIs answer `403 "Upgrade to GitHub
Pro or make this repository public"`. "Required status checks" therefore cannot exist.
   The only enforcement of `ci`, `db-tests`, `e2e` is `deploy.needs` inside `ci.yml`,
   which blocks the **GitHub Actions deploy**, not a merge or a push to `main`.
3. **A second production deploy path probably bypasses every gate.** Cloudflare's Git
   integration ("Workers Builds: stable-booksy") runs on every push, including `main`;
   the `main` build has no Preview URL (the PR build does), which is the signature of a
   production deploy from the dashboard integration, in parallel with and independent of
   the gated `deploy` job. Wrangler is not logged in on this machine, so this needs a
   dashboard check — but if confirmed, a red CI does not stop production today.
4. **Per-edit cost is dominated by type-aware ESLint (7–9 s per file).** Prettier is
   1.5 s, `vitest related` is 1–2 s, a non-type-aware ESLint pass is 1.9 s. The
   "lint + typecheck at edit time" intent as literally stated costs ~10 s per edit on this
   machine; the plan must pick a cost × signal split (see Architecture Insights).
5. **`vitest related` is a no-op for the riskiest files.** No test imports anything under
   `src/pages/api/**`, nor `src/lib/bookings/queries.ts`, `src/lib/schedule/queries.ts`,
   `src/lib/schedule/schema.ts` (type-only imports are erased from Vitest's graph). For
   those paths the hook would print "No test files found" and exit 0 — a gate that looks
   green because it tested nothing.
6. **`astro check` passes today (0 errors, 4 hints, 18.7 s)**, so it can be adopted as a
   pre-push + CI gate without a fix-up phase. It is installed but has no script and is
   not wired anywhere (three archived documents record this as a deliberate open item).
7. **Hook contract (verified against the official docs, 2026-09-09):** on `PostToolUse`,
   exit 2 shows **stderr** to Claude (not stdout, as the lesson text says); exit 0 stdout
   is not shown to Claude on this event; JSON `hookSpecificOutput.additionalContext` is
   the other channel. Commands run under **Git Bash on Windows**, `jq` is not installed
   here, `tool_input.file_path` is absolute with backslashes, and `async: true` hooks
   cannot feed anything back — so the hook must be synchronous.

## Detailed Findings

### A. What exists today, layer by layer

| Layer                     | Config on disk                                                                                                                                                     | Actually runs?     | Evidence                                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Per-edit (agent hook)     | none — no `.claude/` directory in the repo; `~/.claude/settings.json` has no `hooks` key                                                                           | no                 | `ls .claude` → not found; global settings contain only permissions/model/plugins                                         |
| Pre-commit                | `.husky/pre-commit` = `npx lint-staged`; `lint-staged` block in `package.json:64-71` (`*.{ts,tsx,astro}` → `eslint --fix`, `*.{json,css,md}` → `prettier --write`) | **no**             | no `prepare` script in `package.json`; `git config --get core.hooksPath` exits 1; `.git/hooks/` contains only `*.sample` |
| Pre-push                  | none                                                                                                                                                               | no                 | `.husky/` has one file                                                                                                   |
| CI `ci`                   | `.github/workflows/ci.yml:10-25`: `npm ci` → `astro sync` → `npm run lint` → `npm test` → `npm run build`                                                          | yes, 1m36s         | test-plan §6.5 Phase 2 note; run 34368150111                                                                             |
| CI `db-tests`             | `ci.yml:29-53`: `supabase db start` → `npm run test:db`                                                                                                            | yes, 2m31s         | same                                                                                                                     |
| CI `e2e`                  | `ci.yml:58-93`: `supabase start -x …` → `.dev.vars` → Playwright                                                                                                   | yes, 3m40s         | same                                                                                                                     |
| CI `deploy`               | `ci.yml:95-109`: `needs: [ci, db-tests, e2e]`, push to `main` only, `wrangler-action@v3`                                                                           | yes                | check-runs on `main` HEAD: deploy success                                                                                |
| Cloudflare Workers Builds | not in the repo; Git integration configured in the Cloudflare dashboard                                                                                            | yes, on every push | check-run `Workers Builds: stable-booksy` by app `cloudflare-workers-and-pages` on `main` HEAD and on PR #9 head         |
| Branch protection         | n/a                                                                                                                                                                | **cannot**         | `gh api repos/…/branches/main/protection` → 403; `…/rulesets` → 403; `gh repo view` → `isPrivate: true`                  |

### B. Husky is installed but never activated

- `package.json` scripts (`package.json:5-17`): `dev, build, preview, astro, db:types, test,
test:db, test:e2e, test:e2e:ui, lint, lint:fix, format`. No `prepare`, no `check`, no
  `typecheck`.
- `husky@9.1.7` and `lint-staged@^16.3.3` are devDependencies (`package.json:54-55`) and
  both binaries exist in `node_modules/.bin/`.
- Husky 9 sets `core.hooksPath=.husky/_` only when its `husky` binary runs (normally from
  the `prepare` lifecycle script during `npm install`/`npm ci`). That never happened here:
  `git config --get core.hooksPath` returns nothing and `.git/hooks` holds only samples.
- Consequence: the deployment plan's rule "pre-commit lint czerwony → naprawić lint, nie
  omijać" (`context/changes/deployment/deployment-plan.md:111`) has never been exercised,
  and `AGENTS.md:50` / test-plan §5 row 1 describe a gate that does not fire.
- CI is unaffected: `npm run lint` in job `ci` is the check that has actually been
  guarding `main`.
- Wiring note for the plan: `"prepare": "husky"` runs on `npm ci` in CI too. Husky 9 is
  silent when `.git` is present (it is, after `actions/checkout`) and prints a one-line
  warning without failing when it is not. `HUSKY=0` disables it for a run.

### C. Branch protection is not available; what "required gate" can mean here

- `gh repo view --json isPrivate,visibility` → `{"isPrivate":true,"visibility":"PRIVATE"}`.
- Both GitHub APIs that could make a status check _required_ return 403 with the message
  "Upgrade to GitHub Pro or make this repository public to enable this feature."
  Rulesets are free only on public repos.
- The repo history is mostly direct pushes to `main` (archived Phase 2 plan notes this at
  `context/archive/2026-09-09-testing-rider-loop-in-the-browser/plan.md:510`; Phase 2 was
  the first PR). Nothing prevents `git push origin main` with a red suite.
- What is enforced: `deploy.needs: [ci, db-tests, e2e]` (`ci.yml:96`). A red job skips
  `deploy` (conclusion `SKIPPED` on PR runs, and the Actions deploy is not attempted on a
  failed push). So "required" in test-plan §5 today means _deploy-blocking_, not
  _merge-blocking_.
- Three honest options for the plan; the choice is the user's:
  1. Make the repo public → rulesets become available → a ruleset on `main` requiring
     `ci`, `db-tests`, `e2e` and blocking force-pushes. Cost: the code is visible;
     secrets are already outside the repo (`.dev.vars*`, `.env*` gitignored; CI secrets
     in GitHub). Coursework context suggests this is acceptable but it is not a
     technical decision.
  2. Keep private, upgrade to GitHub Pro (paid) → same ruleset.
  3. Keep private and free → document §5 truthfully ("required" = blocks deploy, not
     merge), add the pre-push hook as the local merge gate, and treat the Cloudflare
     finding (D) as the real hole to close.

### D. Cloudflare Workers Builds: a probable ungated production deploy

- `main` HEAD check-runs: `deploy` (github-actions), `Workers Builds: stable-booksy`
  (cloudflare-workers-and-pages), `ci`, `db-tests`, `e2e`.
- The Workers Builds check-run summary on the `main` commit lists Build ID, Script and
  Version ID only. The same check on PR #9's head commit additionally lists
  `Preview URL: https://f7d8701d-stable-booksy.tolpa-lukasz97.workers.dev` and a branch
  alias URL. Cloudflare Workers Builds produces preview URLs for non-production branches
  and a production deploy for the production branch — the asymmetry indicates `main` is
  the production branch of the Git integration.
- If so, every push to `main` is deployed to production by Cloudflare **before/regardless
  of** the GitHub Actions gates, and the Actions `deploy` job deploys the same commit a
  second time a few minutes later. A red `e2e` would skip the Actions deploy but not the
  Cloudflare one.
- test-plan §6.5 Phase 2 already noted "Cloudflare's own Workers Builds check also
  appears on PRs — it is not part of the workflow and not a gate", but did not ask whether
  it _deploys_.
- Could not confirm from this machine: `npx wrangler whoami` fails ("Failed to fetch auth
  token: 400"), so `wrangler deployments list` (which shows each deployment's source:
  wrangler vs. dashboard/Workers Builds) is unavailable. Verification path: Cloudflare
  dashboard → Workers & Pages → `stable-booksy` → Settings → Build (production branch,
  build command) and Deployments (source column), or run `npx wrangler deployments list`
  after `npx wrangler login`.
- Remedy if confirmed (plan decides): either disconnect the Git integration / set its
  production branch to a non-existent name so the only production path is the gated
  Actions job, or drop the Actions `deploy` job and put the gates in front of Workers
  Builds (Cloudflare has no "wait for GitHub checks" option, so this is the weaker
  choice).

### E. Cost of each candidate check on this machine (Windows 11, Node 24.16, warm disk)

Measured 2026-09-09 with `date +%s%N` around each command; `npx` adds ~1.3 s over calling
the binary directly. Every command exited 0 on the current tree.

| Check                                       | Command                                                                           | Wall time                                               | Notes                                                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Prettier, one file                          | `npx prettier --write src/lib/bookings/slots.ts`                                  | 1.5 s                                                   | formatting only                                                                                                       |
| ESLint type-aware, one `.ts`                | `npx eslint --fix src/lib/bookings/slots.ts`                                      | 8.7 s / 8.4 s (two runs)                                | `projectService` builds the TS program every invocation                                                               |
| same, direct binary                         | `node node_modules/eslint/bin/eslint.js --fix …`                                  | 7.2 s                                                   |                                                                                                                       |
| same with `--cache`, file unchanged         |                                                                                   | 3.1 s                                                   | cache only skips files whose content is unchanged — useless right after an edit; and `.eslintcache` is not gitignored |
| ESLint type-aware, one `src/pages/api/*.ts` | `npx eslint --fix src/pages/api/bookings/create.ts`                               | 8.4 s                                                   |                                                                                                                       |
| ESLint type-aware, one `.astro`             | `… --fix src/pages/index.astro`                                                   | 6.9 s                                                   | astro parser ignores `projectService`, prints a warning each run (`project: true` fallback)                           |
| ESLint **non**-type-aware, one file         | temporary config: `eslint.recommended` + `tseslint.recommended` + prettier plugin | 1.9 s                                                   | measured with a throwaway config, deleted afterwards                                                                  |
| Vitest related, covered file                | `npx vitest related src/lib/bookings/slots.ts --run`                              | 2.1 s (1.0 s via `node node_modules/vitest/vitest.mjs`) | 1 file / 27 tests                                                                                                     |
| Vitest related, uncovered file              | `npx vitest related src/pages/api/bookings/create.ts --run`                       | 1.9 s                                                   | "No test files found, exiting with code 0"                                                                            |
| Full unit suite                             | `npm test`                                                                        | 2.1 s                                                   | 12 files / 159 tests                                                                                                  |
| `astro check`                               | `npx astro check`                                                                 | 18.7 s                                                  | 86 files, 0 errors, 0 warnings, 4 hints (deprecated `tseslint.config` signature in `eslint.config.js`)                |
| Full lint                                   | `npm run lint`                                                                    | 19.8 s                                                  |                                                                                                                       |
| CI `ci` / `db-tests` / `e2e`                | GitHub-hosted runner                                                              | 1m36s / 2m31s / 3m40s                                   | from test-plan §6.5                                                                                                   |

Reading of the numbers against the brief's "must stay fast (seconds)":

- Prettier + `vitest related` ≈ 2.5–3.5 s per edit: comfortably per-edit.
- Type-aware ESLint ≈ 7–9 s per edit, and it does not get cheaper with more edits (no
  persistent TS server between hook invocations). Three edits in one turn = ~25 s of
  blocked agent loop. This is the "a slow per-edit hook is fine" claim, quantified.
- `astro check` at ~19 s and `npm run lint` at ~20 s are pre-push / CI material, not
  per-edit. `npm test` at 2 s is cheap enough for pre-push and even pre-commit.

### F. What `vitest related` can and cannot see (risk-area inventory)

`vitest.config.ts:12-13`: `include: ["src/**/*.test.ts"]`, `environment: "node"`, `@` alias
to `./src` (`vitest.config.ts:8-10`). The alias is what lets `related` resolve `@/lib/…`
imports, so the hook must run from the repo root (`cwd` is in the hook's stdin JSON).

| Risk-area file                                                                                                                                                        | Covered by `vitest related`?                                                                                                                      | How it is actually proven                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/lib/bookings/{errors,rider-list,rows,schema,slots}.ts`                                                                                                           | yes — each has a sibling `*.test.ts` importing it directly                                                                                        | unit                                                                |
| `src/lib/schedule/dates.ts`                                                                                                                                           | yes — `dates.test.ts` direct; also reaches `bookings/schema.test.ts` and `bookings/slots.test.ts` transitively                                    | unit                                                                |
| `src/lib/schedule/errors.ts`                                                                                                                                          | yes — `errors.test.ts`                                                                                                                            | unit                                                                |
| `src/lib/bookings/queries.ts` (235 lines)                                                                                                                             | **no** — only `import type` references from `rider-list.ts:1`, `rows.ts:1`, `rider-list.test.ts:2`; type imports are erased from the module graph | `supabase/tests/*.sql`, e2e                                         |
| `src/lib/schedule/queries.ts` (184 lines)                                                                                                                             | **no** — imported only by `src/pages/api/bookings/create.ts:11` and `src/pages/api/schedule/save.ts:8`                                            | `supabase/tests/schedule_change_guardrails.sql`, e2e                |
| `src/lib/schedule/schema.ts`                                                                                                                                          | **no** — imported only by `src/pages/api/schedule/save.ts:9`                                                                                      | none at unit level                                                  |
| all 9 files under `src/pages/api/**` (`auth/{signin,signout,signup}`, `bookings/{cancel,create}`, `horses/{create,toggle-active}`, `schedule/save`, `stables/create`) | **no** — Astro `APIRoute` handlers, no test imports them, no `*.test.ts` outside `src/lib`                                                        | e2e (`rider-loop.spec.ts`, `booking-refusal.spec.ts`) and `test:db` |

Consequences for the hook design:

- For the covered files, `vitest related` is exactly the "scoped tests" the lesson asks
  for: 1–2 s, 1–3 test files.
- For the uncovered files (which are the largest and the ones the §2 risks actually live
  in), the hook cannot produce a signal from Vitest. Options the plan should weigh: print
  an explicit "no related unit tests — run `npm run test:e2e` / `npm run test:db` before
  pushing" line to stderr with exit 0 (informational, not a false green), or run the
  full `npm test` (2 s — it is cheaper than one type-aware lint) so at least the
  transitive unit layer is exercised. Running e2e or db tests per edit is out (minutes,
  needs Docker).
- `src/pages/api` edits are already flagged by AGENTS.md as "run `npm run test:e2e`
  after any change" — the hook can echo that rule instead of pretending to cover it.

### G. Hook contract as documented by Claude Code (verified 2026-09-09)

Sources: `https://code.claude.com/docs/en/hooks.md`, `https://code.claude.com/docs/en/hooks-guide.md`.

- **Event / matcher**: `PostToolUse` fires once per successful tool call; `matcher` is a
  JavaScript regex tested unanchored (`"Write|Edit"` also matches `MultiEdit` and
  `NotebookEdit`, which is fine — or use `"^(Write|Edit)$"`). No batching: three edits
  in a turn fire the hook three times.
- **Stdin**: JSON with `session_id`, `cwd`, `hook_event_name`, `tool_name`,
  `tool_input` (`file_path` absolute — on Windows with backslashes), `tool_response`,
  `tool_use_id`.
- **Feedback channel on PostToolUse**: exit code 2 → "Shows stderr to Claude; the tool
  already ran". Exit 0 stdout is **not** shown to Claude for this event (only for
  `UserPromptSubmit`, `SessionStart` and a few others). Alternative on exit 0: print JSON
  `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"…"}}` or
  `{"decision":"block","reason":"…"}`. The lesson's "exit 2 + stdout" wording is
  therefore imprecise for this event: **the message must go to stderr** (or JSON on
  stdout). The docs state no character cap for this event; the lesson's 10,000-character
  figure should be treated as a practical ceiling — truncate ESLint output.
- **Cannot undo**: the edit already happened; exit 2 only injects feedback.
- **Shell on Windows**: Git Bash when installed (it is: `/usr/bin/bash`), PowerShell
  otherwise. `jq` is **not** installed on this machine, so the lesson's
  `jq -r .tool_input.file_path` does not work here; a `node` one-liner or a small
  `.mjs` script that reads stdin does, and is the same on every OS.
- **Timeout**: default 600 s for command hooks; set an explicit small one (e.g. 60 s) so
  a hung ESLint cannot freeze the loop.
- **`async: true`**: runs in the background, but "cannot return blocking decisions —
  results are not delivered through `systemMessage`, `additionalContext`, or exit code
  2". So async is not a way to hide the 8 s lint; it would make the hook silent.
- **`statusMessage`**: custom spinner text while the hook runs (useful: "lint + related
  tests…").
- **Settings files**: `.claude/settings.json` is shareable (commit it); project hooks run
  only after the workspace-trust dialog is accepted; `.claude/settings.local.json` is
  per-machine and gitignored by Claude Code when it writes there. `$CLAUDE_PROJECT_DIR` is
  available to the command. `.claude/` is not in `.gitignore` today, so a committed
  `settings.json` will be picked up by every clone.

### H. Pre-commit and pre-push mechanics with Husky 9

- Pre-commit stays `npx lint-staged` (brief: do not migrate to Lefthook). lint-staged runs
  type-aware `eslint --fix` per staged file; with `projectService` that is ~7 s for the
  first file and similar for each additional file because lint-staged invokes ESLint once
  with all matching staged files (one TS program build) — acceptable at commit time.
- Pre-push is a new file `.husky/pre-push` (Husky 9: plain shell, no `husky.sh` shim).
  Candidates and cost: `npm test` (2 s) + `npx astro check` (19 s) ≈ 21 s; adding
  `npm run lint` (20 s) would double it and duplicates lint-staged + CI. `test:db` and
  `test:e2e` need Docker and minutes — CI only.
- `astro check` is safe to adopt now: 0 errors on the current tree. Its 4 hints come from
  `eslint.config.js:14,40` (deprecated `tseslint.config` overload) — hints do not fail the
  command. Adding it to CI job `ci` costs ~20 s on the runner (`npx astro sync` already
  runs there and generates the `.astro/types.d.ts` that `astro check` needs).
- The archived Phase 2 review already had to correct docs that over-claimed "Husky runs
  lint + typecheck" (`context/archive/2026-09-09-testing-rider-loop-in-the-browser/reviews/impl-review.md:90-91`).
  AGENTS.md:50, README.md:172 and test-plan §4/§5 will need the same honesty pass once
  pre-push and `astro check` land.

### I. Lint configuration facts that affect the hook

- `eslint.config.js:14-22`: `strictTypeChecked` + `stylisticTypeChecked` with
  `projectService: true` — this is why a single-file lint costs 7–9 s.
- `eslint.config.js:40-45`: `e2e/**` and `playwright.config.ts` excluded from React rules
  only; base TS rules still apply.
- `eslint.config.js:72`: `src/db/database.types.ts` ignored (generated); the hook should
  skip it too (and `npm run db:types` output in general).
- `.gitignore` is imported into ESLint (`includeIgnoreFile`) so `dist/`, `.astro/`,
  `playwright-report/` etc. are never linted. `.eslintcache` is not ignored — if the plan
  uses `--cache`, add it.
- Prettier 3.8 honours `.gitignore`; `.prettierrc.json` uses the astro + tailwind plugins,
  and `eslint-plugin-prettier` already runs Prettier inside `eslint --fix`, so a separate
  Prettier step is only needed if ESLint is _not_ in the per-edit path.
- `.vscode/settings.json` runs `source.fixAll.eslint` on save — the human editor already
  has a per-edit lint; the agent does not.

## Code References

- `.husky/pre-commit:1` — `npx lint-staged` (never invoked: no `core.hooksPath`)
- `package.json:5-17` — scripts (no `prepare`, no `check`)
- `package.json:64-71` — lint-staged globs
- `.github/workflows/ci.yml:10-25` — job `ci` (lint, test, build; no `astro check`)
- `.github/workflows/ci.yml:95-97` — `deploy.needs: [ci, db-tests, e2e]`, `main` push only
- `vitest.config.ts:8-13` — alias + include pattern that `vitest related` depends on
- `eslint.config.js:14-22` — type-aware base config (`projectService`)
- `eslint.config.js:72` — generated types ignored
- `src/lib/bookings/queries.ts`, `src/lib/schedule/queries.ts`, `src/lib/schedule/schema.ts`, `src/pages/api/**` — risk-area files with no unit test in the module graph
- `AGENTS.md:7` — CI contract; `AGENTS.md:50` — Husky claim to correct
- `README.md:172` — CI section to update
- `context/foundation/test-plan.md` §4 row "lint + typecheck", §5 rows 1 and 5, §6.5 — rows this phase must flip

## Architecture Insights

**Cost × signal split the numbers support** (the plan owns the decision, this is the
research recommendation):

| Layer                          | Runs                                                                                                                                                                                  | Cost    | Why here                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-edit (`PostToolUse`, sync) | Prettier on the touched file; `vitest related --run` when the file is under a risk area and has related tests; an explicit stderr note when it has none; skip generated/ignored files | ~3 s    | the only layer that talks back to the agent; must not block for 8 s per edit                                                                                                                   |
| Per-edit, optional             | type-aware `eslint --fix` on the touched file                                                                                                                                         | +7–9 s  | include only if the user accepts ~10 s per edit; otherwise the same rule set runs 7 s later at commit via lint-staged, and the agent still gets the message from the pre-commit failure output |
| Pre-commit (Husky, activated)  | `lint-staged` as today                                                                                                                                                                | ~7 s +  | type-aware lint on exactly the staged files                                                                                                                                                    |
| Pre-push (Husky, new)          | `npm test` + `npx astro check`                                                                                                                                                        | ~21 s   | heavier, whole-tree, before code leaves the machine                                                                                                                                            |
| CI                             | `ci` (+ `astro check`), `db-tests`, `e2e`                                                                                                                                             | minutes | the gate that survives a `--no-verify`; `deploy` waits on all                                                                                                                                  |

**Hook implementation shape that fits this repo**: a committed `.claude/settings.json`
whose `PostToolUse` entry calls `node scripts/hooks/post-edit.mjs` (cross-platform, no
`jq`, no bash quoting on Windows). The script reads stdin JSON, normalizes
`tool_input.file_path` to a forward-slash path relative to `cwd`, bails out (exit 0) for
files outside `src/**`, `e2e/**`, `supabase/**`, or matching ESLint ignores, runs the
chosen checks with `child_process.spawnSync` (`stdio: "pipe"`), and on any non-zero
child status writes the captured output (truncated to a few thousand characters) to
**stderr** and exits **2**. It never `catch`es its way to exit 0 — a crash of the hook
itself should surface as exit 1 (non-blocking but visible), which is the "hooks that
swallow exit codes" anti-pattern avoided.

**"The hook replaces CI" — why not, in this repo's own terms**: the hook sees one file,
in one working tree, with unit tests only. Risks #1, #2, #4 live in Postgres
(`supabase/tests`, needs Docker) and #3, #6 in the browser (`e2e`, needs the auth stack).
Neither runs per edit or even pre-push. CI is where those gates live, and `deploy.needs`
is what ties them to production — provided the Cloudflare finding (D) is closed.

**Enforcement honesty for §5**: after this phase the truthful wording is
"required — blocks the Actions deploy (`deploy.needs`)" unless the repo goes public and a
ruleset is added, in which case "required — ruleset on `main`, blocks merge". The
post-edit row's final state is "recommended local (committed `.claude/settings.json`;
runs after workspace trust)" — a per-edit hook can never be _required_ because nothing
outside the agent verifies it ran.

## Historical Context (from prior changes)

- `context/archive/2026-09-09-testing-rider-loop-in-the-browser/plan.md:95` — Phase 2
  explicitly deferred "post-edit hooks, lint/typecheck hook layering" to this phase.
- `context/archive/2026-09-09-testing-rider-loop-in-the-browser/research.md:426-428` —
  recorded "`astro check` is not wired anywhere"; `…/reviews/impl-review.md:90-91` fixed
  docs that over-claimed Husky ran lint + typecheck.
- `context/archive/2026-09-09-testing-rider-loop-in-the-browser/plan.md:503-541` and
  `research.md:475-483` — the `e2e` job was made a gate with `retries: 1`, 20-minute
  timeout, fallback to "local gate" only if it exceeded ~8 minutes (it takes 3m40s).
- `context/archive/2026-09-08-testing-database-guarantees-in-ci/plan.md:109-127` —
  `db-tests` job and the first `deploy.needs` extension; CLI from `node_modules`.
- `context/changes/deployment/deployment-plan.md:107,111,121` — origin of `deploy`
  (`needs: [ci]`), the "never bypass pre-commit" rule, and the first-deploy gotchas.
- `context/foundation/infrastructure.md` (Operational Story) — routine deploys are
  unattended by design; no manual approval gate is wanted.
- `context/foundation/test-plan.md` §6.5 Phase 2 — first mention of the Workers Builds
  check-run ("not a gate"), without asking whether it deploys.

## Related Research

- `context/archive/2026-09-09-testing-rider-loop-in-the-browser/research.md` — CI job
  costs, ESLint/e2e interplay, `.dev.vars` snapshot behaviour.
- `context/archive/2026-09-08-testing-database-guarantees-in-ci/research.md` — Supabase
  CLI in CI, Postgres image pinning.

## Open Questions

1. **Does Cloudflare Workers Builds deploy `main` to production?** Needs the dashboard
   (or `npx wrangler login` + `npx wrangler deployments list`). If yes, decide which of
   the two production paths to keep; the gated Actions job is the one that honours
   `deploy.needs`.
2. **Public repo or not?** Rulesets (required checks on `main`) exist only for public
   repos on GitHub Free. Without them "required" means deploy-blocking only. User
   decision; affects the §5 wording and whether a ruleset phase belongs in the plan.
3. **Per-edit lint: type-aware (7–9 s) or format-only (1.5 s) with lint deferred to
   pre-commit?** The brief says "lint + typecheck at edit time"; the measurement says
   that costs ~10 s per edit on this machine. Cost × signal recommendation above is
   Prettier + related tests per edit, type-aware ESLint at commit; the plan should state
   which and why, and the implement phase should time the final hook on three
   consecutive edits.
4. **What should the hook say for risk-area files with no related unit tests**
   (`queries.ts` ×2, `schedule/schema.ts`, all of `src/pages/api`)? A silent exit 0 is a
   false green; an exit 2 would block on every edit. Recommendation: exit 0 with an
   `additionalContext` reminder naming `npm run test:e2e` / `npm run test:db`, or run the
   full 2 s `npm test`.
5. **Verification of the feedback channel**: the docs say stderr on exit 2 reaches
   Claude on `PostToolUse`; the plan should include a sabotage step (introduce a lint
   error or a failing assertion, edit the file through the agent, confirm the message
   appears in the agent's context) before the §5 row is flipped.
6. **`prepare: husky` in CI** — confirm `npm ci` on the runner stays green with the
   `prepare` script (Husky 9 should be a no-op warning at worst), since `ci`, `db-tests`
   and `e2e` all run `npm ci`.
