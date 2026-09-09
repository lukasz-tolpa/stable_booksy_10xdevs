# Quality Gates and the Per-Edit Agent Loop — Plan Brief

> Full plan: `context/changes/testing-quality-gates-and-agent-loop/plan.md`
> Research: `context/changes/testing-quality-gates-and-agent-loop/research.md`

## What & Why

Test rollout Phase 3 locks the floor under all six risks: the agent gets format and
related-test feedback seconds after each edit, commits and pushes run the checks the docs
already promise, and the three CI jobs become genuinely required for `main`. The
motivation is the research finding that most of today's "gates" are documented but not
enforced — pre-commit never fired, nothing blocks a push to `main`, and Cloudflare probably
deploys `main` on its own.

## Starting Point

Husky and lint-staged are configured but inert (no `prepare` script, no `core.hooksPath`);
there is no pre-push, no agent hook, no typecheck script; `deploy.needs` inside
`ci.yml` is the only enforcement of `ci`/`db-tests`/`e2e`; the repo is private on GitHub
Free, so rulesets are unavailable; Workers Builds runs on every push including `main`.

## Desired End State

An agent edit is formatted and, in a risk area, unit-tested within ~3 s, with failures
returned as stderr + exit 2. `git commit` lint-stages, `git push` runs `npm test` +
`npm run check` (~21 s). CI job `ci` also typechecks. Only the Actions `deploy` job reaches
production. The repo is public and a ruleset on `main` requires `ci`, `db-tests`, `e2e`
and blocks force-push. Test-plan §5 says exactly this.

## Key Decisions Made

| Decision               | Choice                                                             | Why (1 sentence)                                                            | Source           |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------- |
| Per-edit hook contents | Prettier + `vitest related`; no ESLint                             | Type-aware ESLint costs 7–9 s per file; the same rules run at commit and CI | Research / Plan  |
| Uncovered risk files   | Run full `npm test` (2 s) + JSON note naming `test:e2e`/`test:db`  | No false green; whole suite is cheaper than one lint                        | Plan             |
| Feedback channel       | stderr + exit 2 on failure; `additionalContext` JSON for notes     | Docs: exit-0 stdout is invisible to the agent on PostToolUse                | Research         |
| Handler language       | Node script, no `jq`/bash                                          | Windows Git Bash, no `jq` installed, absolute backslash paths               | Research         |
| Pre-commit             | Keep Husky + lint-staged, add `prepare`                            | Brief forbids Lefthook; Husky only needed activating                        | Brief / Research |
| Pre-push               | `npm test` + `npm run check` (`astro check`)                       | ~21 s; catches cross-file and `.astro` type breaks; `lint` would duplicate  | Plan             |
| Typecheck in CI        | `npm run check` step in job `ci`                                   | Same command locally and in CI; survives `--no-verify`                      | Plan             |
| Production path        | Verify Workers Builds; make it preview-only; keep Actions `deploy` | Only the Actions job honours `deploy.needs`                                 | Plan             |
| Required checks        | Make repo public, ruleset via `gh api`                             | Rulesets are free only on public repos; no secrets tracked                  | Plan             |
| Post-edit §5 row       | "recommended local, committed `.claude/settings.json`"             | A hook cannot be enforced outside the agent                                 | Research         |

## Scope

**In scope:** `prepare` + `check` scripts; `.husky/pre-push`; `npm run check` in CI;
`.claude/settings.json` + `.claude/hooks/post-edit.mjs`; Cloudflare Build settings;
repo visibility + ruleset (`.github/rulesets/main-gates.json` as record); test-plan
§4/§5/§6.5/§6.6, AGENTS.md, README; sabotage checks per phase.

**Out of scope:** new tests; Lefthook; ESLint per edit; `lint`/`test:db`/`test:e2e` in
hooks; PR review requirements; GitHub Pro; other agents' hook formats; risk map changes.

## Architecture / Approach

Four layers, cheapest first: per-edit (Prettier + scoped Vitest, Node handler fed by
Claude Code's `PostToolUse` stdin JSON) → pre-commit (lint-staged, type-aware ESLint on
staged files) → pre-push (`npm test`, `astro check`) → CI (`ci` + typecheck, `db-tests`,
`e2e`; `deploy` waits on all; ruleset makes the three required for `main`). Work happens on
`test-rollout/phase-3-quality-gates` and merges by PR so the CI step and the ruleset are
proven by this change itself.

## Phases at a Glance

| Phase                       | What it delivers                                                       | Key risk                                                               |
| --------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Activate the local gates | Husky live, pre-push, `check` script, CI typecheck step                | `astro check` on the runner may need the env secrets                   |
| 2. Per-edit agent hook      | Committed hook + handler with sabotage-proven feedback                 | `$CLAUDE_PROJECT_DIR` quoting under Git Bash; workspace trust          |
| 3. Single production path   | Workers Builds preview-only; Actions is the only deploy                | Dashboard step only the owner can do; verification needs a `main` push |
| 4. Public repo + ruleset    | `ci`/`db-tests`/`e2e` required, no force-push                          | Visibility flip is public history; must scan for secrets first         |
| 5. Docs sync + merge        | §5 truthful, §6.6 cookbook, AGENTS/README; PR merged under the ruleset | Docs over-claiming again (Phase 2 review already caught this once)     |

**Prerequisites:** Cloudflare dashboard access and GitHub owner rights (Phases 3–4);
Claude Code with workspace trust on this folder (Phase 2).
**Estimated effort:** ~2–3 sessions across 5 phases; Phases 3–4 are mostly manual.

## Open Risks & Assumptions

- Workers Builds may already be preview-only on `main`; Phase 3 then records the
  evidence and changes nothing.
- `astro check` in CI without `.dev.vars` is assumed fine (env schema is validated at
  build, not by check); fallback is passing the build secrets to the step.
- Making the repo public exposes demo accounts and seed data; accepted as demo data.
- Type-aware lint feedback reaches the agent one step later (at commit) rather than at
  edit — accepted trade for a ~3 s hook.

## Success Criteria (Summary)

- A deliberately failing assertion edited through the agent appears in the agent's
  next turn; a red commit and a red push are rejected locally.
- A direct push to `main` is rejected and the PR merge waits on three named checks.
- After merge, `deploy` is the only production deployment and test-plan §5 has no
  "required" the repo does not enforce.
