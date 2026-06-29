+---
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
---

## Why this stack

Solo developer shipping a horse-riding booking MVP after-hours in 3 weeks, with email+password auth, two roles (stable admin vs rider), and a hard no-double-booking integrity rule. The recommended default for `(web, js)` is the 10x Astro Starter, which clears all four agent-friendly gates and ships auth + a transactional Postgres database + edge deploy out of the box: Supabase Auth + RLS cover the two-role access model, and Postgres unique constraints enforce the one-horse-per-slot guardrail under concurrency — exactly the load-bearing requirement. Bootstrapper confidence is first-class. Auth feature flag is set; payments, realtime, AI, and background jobs are out of scope per the PRD non-goals (stats/comments/AI analysis are deferred to v2). Deployment targets Cloudflare Pages — the starter's default and cheapest path to first deploy — with CI on GitHub Actions and auto-deploy on merge to main, the standard solo shape.
