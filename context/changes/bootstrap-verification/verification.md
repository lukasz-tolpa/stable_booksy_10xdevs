---
bootstrapped_at: 2026-06-29T20:45:05Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: stable-booksy
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: stable-booksy
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

> **Why this stack** — Solo developer shipping a horse-riding booking MVP after-hours in 3 weeks, with email+password auth, two roles (stable admin vs rider), and a hard no-double-booking integrity rule. The recommended default for `(web, js)` is the 10x Astro Starter, which clears all four agent-friendly gates and ships auth + a transactional Postgres database + edge deploy out of the box: Supabase Auth + RLS cover the two-role access model, and Postgres unique constraints enforce the one-horse-per-slot guardrail under concurrency — exactly the load-bearing requirement. Bootstrapper confidence is first-class. Auth feature flag is set; payments, realtime, AI, and background jobs are out of scope per the PRD non-goals (stats/comments/AI analysis are deferred to v2). Deployment targets Cloudflare Pages — the starter's default and cheapest path to first deploy — with CI on GitHub Actions and auto-deploy on merge to main, the standard solo shape.

## Pre-scaffold verification

| Signal       | Value                                              | Severity | Notes                                            |
| ------------ | -------------------------------------------------- | -------- | ------------------------------------------------ |
| npm package  | not run                                            | n/a      | cmd_template is `git clone` — no npm CLI package |
| GitHub repo  | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card.docs_url; ~6 weeks before bootstrap    |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 20
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold (cwd already had `claude.md`; case-insensitive collision on Windows, existing wins)
**.gitignore handling**: moved silently (cwd had no `.gitignore`)
**.bootstrap-scaffold cleanup**: deleted (`.git/` removed before move-up; temp dir empty after move, removed on retry after a transient post-install file lock)

Notes:
- `npm install` added 772 packages (773 audited) in ~34s.
- `context/`, `claude.md`, and `idea.md` were preserved untouched.

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 6 HIGH, 10 MODERATE, 2 LOW (18 total)
**Direct vs transitive**: 4 of 18 affected packages are direct dependencies; 14 are transitive. (npm groups advisories by package, not by direct/transitive count per severity.)

#### CRITICAL findings

None.

#### HIGH findings

Affected packages (severity high): `astro`, `devalue`, `miniflare`, `undici`, `vite`, `ws`. These are the starter's own pinned framework/runtime dependencies. Run `npm audit` for advisory IDs and `npm audit fix` (or `npm audit fix --force` for breaking changes) to remediate per your risk tolerance.

#### MODERATE findings

10 moderate advisories across the dependency tree. Full detail via `npm audit`.

#### LOW / INFO findings

2 low advisories. Full detail via `npm audit`.

> Audit findings are informational, not gating. They are expected on a freshly cloned starter pinned to specific versions; address them when convenient.

## Hints recorded but not acted on

| Hint                    | Value               |
| ----------------------- | ------------------- |
| bootstrapper_confidence | first-class         |
| quality_override        | false               |
| path_taken              | standard            |
| self_check_answers      | null                |
| team_size               | solo                |
| deployment_target       | cloudflare-pages    |
| ci_provider             | github-actions      |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                |
| has_payments            | false               |
| has_realtime            | false               |
| has_ai                  | false               |
| has_background_jobs     | false               |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review the `CLAUDE.md.scaffold` sibling — the starter ships its own agent-instructions file; the project's existing `claude.md` (the 10xDevs lesson router) was kept. Decide which to keep, or merge them.
- Copy `.env.example` to `.env` and fill in Supabase + Cloudflare credentials before running the app.
- Address audit findings (`npm audit fix`) per your project's risk tolerance — the full breakdown is in this log.
