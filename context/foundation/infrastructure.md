---
project: stable-booksy
researched_at: 2026-07-20
recommended_platform: Cloudflare Workers
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript/JavaScript
  framework: Astro (10x-astro-starter, Supabase Auth + Postgres)
  runtime: Cloudflare Workers (workerd)
---

## Recommendation

**Deploy on Cloudflare Workers.**

Wins on cost — the single deciding factor given the developer's explicit "minimize cost" answer: the free tier (100k requests/day, no card required) covers the PRD's low-QPS profile at $0, and every load-bearing capability (CLI deploy/rollback/tail, llms.txt docs, official MCP servers) is GA as of 2026-07-20. It is also the stack's intended target per `tech-stack.md` (with one correction: the `cloudflare-pages` hint is stale — new projects deploy to **Workers with static assets**, as Pages is de facto legacy). Astro has joined Cloudflare, making `@astrojs/cloudflare` a first-party, first-class adapter.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Netlify | Partial | Pass | Pass | Pass | Pass | 4 Pass, 1 Partial |
| Railway | Pass | Pass | Pass | Pass | Partial | 4 Pass, 1 Partial |
| Render | Partial | Pass | Pass | Pass | Pass | 4 Pass, 1 Partial |
| Vercel | Pass | Pass | Pass | Pass | Pass | 5 Pass (cost-disqualified in practice) |
| Fly.io | Partial | Partial | Pass | Pass | Partial | 2 Pass, 3 Partial |

Hard filters: none triggered — the app needs no persistent connections (interview Q1 = No) and all six platforms run Astro SSR. Interview weights applied: **minimize cost** (Q2) penalizes Vercel (Hobby tier prohibits commercial use → effectively $20/mo), Fly.io (free tier removed Oct 2024, card required day one), Render ($7/mo cheapest always-on; free tier cold-starts ~60 s after 15 min idle), Railway ($5/mo practical floor, card required even for trial). **Single region — Poland** (Q4) penalizes free-tier Netlify (functions default to US-Ohio; region pinning to Frankfurt is Pro/Enterprise-only, so free SSR pays a double transatlantic RTT against Supabase EU). **Co-location preferred** (Q5) is largely moot — the stack fixes Supabase as an external service; Cloudflare still offers the broadest co-located surface (R2, Queues, D1, Hyperdrive) if needs grow.

- **Cloudflare Workers** — `wrangler deploy` / `wrangler rollback [version-id]` / `wrangler tail` / `wrangler versions` all GA. Docs ship as markdown: `llms.txt` + `llms-full.txt`, per-page `.md`, a dedicated docs-for-agents section, and GitHub-hosted source. Official Cloudflare MCP servers are GA with a published Claude Code setup guide (upgraded from the prior run's Partial). Free tier is the strongest of any candidate: 100k req/day, no card. Constraint to respect: 10 ms CPU per request on free (30 s on the $5/mo Paid plan).
- **Netlify** — Only other candidate that is $0 with commercial use allowed. Adapter is GA ("Astro 6 just works on Netlify on day one", changelog 2026-03-10). Scored Partial on CLI because rollback has no CLI verb (dashboard "Publish deploy" or `restoreSiteDeploy` API only). The April 2026 credit repricing makes deploys the binding constraint: 300 credits/mo at 15 credits per production deploy ≈ **20 production deploys/month** on free — tight for an agent-driven auto-deploy-on-merge flow. Free-tier functions run from US-Ohio (region pinning is Pro-only).
- **Railway** — Best of the paid tier: full CLI loop (`railway up` / `redeploy` / `down` / `logs`), llms.txt + GitHub docs, EU West Metal (Amsterdam) GA on Hobby. Remote MCP server is beta (local CLI-based one is documented). Loses only on cost: no perpetual free tier ($1/mo credit is symbolic), practical floor $5/mo Hobby, credit card required even for the trial.
- **Render** — Frankfurt GA, official MCP server GA (2025-08-21), llms.txt + `.md` docs. Partial on CLI: rollback is dashboard/API-only. Free tier spins down after 15 min idle with ~60 s cold start — unacceptable for a live booking MVP; cheapest always-on is $7/mo Starter.
- **Vercel** — Technically excellent (per-page `.md` docs + llms.txt, GA hosted MCP at mcp.vercel.com, `vercel rollback` — Hobby limited to the immediately previous deployment). Disqualified in practice by licensing, not tech: **Hobby prohibits commercial use**, and a booking product for stables is commercial, so the honest price is Pro at $20/seat/mo — worst cost position of the six. Vercel Postgres was sunset June 2025 (migrated to Neon/Marketplace).
- **Fly.io** — Weakest fit: no free tier since Oct 2024 (card on file day one), "managed" is Partial since the developer owns the generated Dockerfile, rollback is a workaround (`fly releases` + `fly deploy -i <image>`), MCP server is experimental. Bonus negative: the Warsaw (`waw`) region was removed in the Sept 2025 region consolidation — nearest is Frankfurt/Amsterdam anyway.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

$0 at this traffic profile with no card, the only candidate with all five criteria at Pass and everything GA, a CLI with a true rollback verb, the best agent-readable docs surface of the six, and first-party Astro support since Astro joined Cloudflare. Also the intended target per `tech-stack.md`, so no stack-shape rework — only the Pages→Workers correction.

#### 2. Netlify

The only free-with-commercial-use alternative. GA adapter, GA MCP server, llms.txt docs. The gap: no CLI rollback, ~20 production deploys/month under the April 2026 credit pricing (a real constraint for auto-deploy-on-merge), and US-Ohio functions on free tier — every SSR request from Poland pays US latency plus a US↔EU round trip to Supabase.

#### 3. Railway

The best paid fallback if a real server runtime ever becomes necessary (long-running processes, background jobs): full CLI including rollback-equivalents, Amsterdam on the Hobby plan, good agent docs. $5/mo + credit card keeps it third under a strict cost priority.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. The free tier's real ceiling is **10 ms CPU per request**, not the request count — a heavy SSR render of the schedule grid (many horses × slots) can exceed it, surfacing as intermittent 1102 errors that never appear in local dev.
2. **workerd rejects CommonJS dependencies at bundle time** — a package that works in `astro dev` can fail `wrangler deploy`; requires the `nodejs_compat` flag and the discipline of verifying in workerd, not just Node.
3. **Pages→Workers configuration drift**: the `tech-stack.md` hint says `cloudflare-pages` and the scaffolded `wrangler.jsonc` may target Pages; Astro 6 + adapter v13 requires Workers with `[assets]` config — a half-migrated config produces misleading first-deploy errors.
4. **Runtime secret access**: Astro 6 inlines `import.meta.env` at build time — Supabase keys must be read via runtime bindings (`Astro.locals.runtime.env`), otherwise they work locally and are `undefined` in production.
5. Every SSR request pays a **Warsaw PoP → Supabase eu-central round trip** — the edge does not speed up single-region database calls; several queries per page render add visible latency.

### Pre-Mortem — How This Could Fail

The team deployed the MVP on Workers and the first week went fine. The first crack: a deploy adding a date library passed locally but the production workerd bundle rejected its transitive CommonJS dependency — an evening lost because the error didn't name the offending package. Then came intermittent 1102 errors: the weekly schedule view for a 15-horse stable rendered above the 10 ms CPU limit. Instead of paying $5/month, the developer "optimized" by moving logic client-side, multiplying supabase-js queries and worsening load times. Secrets were wired through `import.meta.env`, so after rotating the service-role key the new key "didn't work" — the old one was inlined into the build, and nobody knew. Rolling back the Worker after a bad deploy took seconds but did not roll back the Supabase migration — code version and database schema diverged for an hour in the middle of a booking weekend. Each problem alone was small; together they burned through the trust budget of non-technical stable owners.

### Unknown Unknowns

- The free tier's true limit is CPU-milliseconds, not requests — 100k req/day sounds enormous, but slow renders count differently; upgrading to Workers Paid ($5/mo, 30 s CPU) is the natural pressure valve.
- Requests for static assets (prerendered pages) are not billed as Worker invocations — the more pages prerendered, the further the free tier stretches; split pages consciously into static vs SSR.
- `wrangler rollback` does not revert Supabase migrations — database schema and Worker version can diverge; keep migrations backward-compatible by one version.
- Older tutorials (2023–2025) describe Pages — Pages is de facto legacy (Observability, gradual deployments, cron, Queues are Workers-only); copying older guides introduces config the current adapter doesn't support.
- Astro 6's local dev runs workerd through the Vite Environment API — fresh machinery (adapter v13, stable since March 2026) whose own bugs can masquerade as app bugs; `wrangler dev` remains the second verification point.

## Operational Story

- **Preview deploys**: `wrangler versions upload` creates a preview version with its own URL without promoting to production; `wrangler versions deploy` promotes a chosen version to 100% traffic (gradual deployments are Workers-only, GA). No fork-PR concerns — deploys run from the repo owner's CI.
- **Secrets**: Supabase URL and keys live in Cloudflare Workers Secrets (`wrangler secret put <NAME>`), read at runtime via `Astro.locals.runtime.env` (never `import.meta.env`, which is inlined at build). GitHub Actions holds a scoped Cloudflare API token (Workers-only for this project; no DNS, no billing) as a repo secret for CI-driven deploys.
- **Rollback**: `wrangler rollback [version-id]` reverts the Worker to a prior deployed version in seconds. Data caveat: Supabase migrations are managed separately and do not auto-revert — keep migrations one-version backward-compatible.
- **Approval**: Routine deploys (`wrangler deploy` on merge to `main` via GitHub Actions) run unattended. Human-only actions: rotating the Supabase service-role key, changing the Cloudflare billing tier, deleting the Worker or the Supabase project.
- **Logs**: `wrangler tail` streams live runtime logs read-only; `wrangler deployments list` / `wrangler versions list` show deploy history; Workers Observability in the dashboard for retention. GitHub Actions logs via `gh run view --log`.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Heavy SSR render of schedule grid exceeds 10 ms CPU free-tier limit → intermittent 1102 errors invisible in dev | Devil's advocate / Pre-mortem | M | M | Prerender everything that isn't per-user; keep SSR queries lean; treat Workers Paid ($5/mo, 30 s CPU) as the designed pressure valve, not a failure. |
| CommonJS transitive dependency fails workerd bundling only at deploy, not in `astro dev` | Devil's advocate / Unknown unknowns | M | M | Enable `nodejs_compat`; run `wrangler dev` (workerd) before every deploy during active development; prefer ESM-first libraries. |
| Stale `cloudflare-pages` hint in `tech-stack.md` + scaffolded `wrangler.jsonc` possibly targeting Pages | Research finding | H | M | Before first deploy, diff `wrangler.jsonc` against current `@astrojs/cloudflare` v13 docs and convert to Workers `[assets]` config explicitly. |
| Secrets inlined via `import.meta.env` work locally, `undefined` (or stale after rotation) in production | Devil's advocate / Pre-mortem | M | H | Read all secrets through `Astro.locals.runtime.env`; add a boot-time assertion that required keys are present; document the rotation flow. |
| `wrangler rollback` reverts code but not Supabase migrations → schema/code divergence | Unknown unknowns / Pre-mortem | M | H | Keep every migration backward-compatible one version; never couple a deploy to a destructive migration; rehearse rollback once before launch. |
| SSR latency: Warsaw PoP → Supabase eu-central round trips per page render | Devil's advocate | M | L | Pick Supabase eu-central region; batch queries per page; prerender public pages; revisit Hyperdrive (GA, free tier) only if TCP Postgres access becomes necessary. |
| Astro 6 dev-in-workerd (Vite Environment API) machinery is new — its bugs masquerade as app bugs | Unknown unknowns | L | M | Keep `wrangler dev` as the second verification point; pin adapter version; check `withastro/astro` issues before blaming app code. |
| CI workflow scaffolded to trigger on `master` while the actual branch is `main` — auto-deploy silently never fires | Research finding | H | M | Fix the branch trigger in `.github/workflows/ci.yml` before wiring `wrangler deploy` into CI. |

## Getting Started

1. Verify the adapter: `npm ls @astrojs/cloudflare` — Astro 6 requires v13+. Confirm `astro.config.mjs` uses the Cloudflare adapter with SSR (`output: 'server'` or per-route prerendering).
2. Align `wrangler.jsonc` with the Workers static-assets model (`[assets]` binding, `compatibility_flags = ["nodejs_compat"]`) per the current `@astrojs/cloudflare` v13 docs — do not follow Pages-era guides.
3. Set secrets: `npx wrangler secret put SUPABASE_URL`, `npx wrangler secret put SUPABASE_ANON_KEY` (+ service-role key if server-side admin calls are needed). Read them via `Astro.locals.runtime.env` in code.
4. Run `npx wrangler dev` locally to catch workerd-specific build failures (CommonJS bundling) — Astro 6's dev server already runs workerd, but `wrangler dev` verifies the actual deploy bundle.
5. Deploy: `npx wrangler deploy`. Verify with `npx wrangler tail` while clicking through the booking flow.
6. Wire `wrangler deploy` into `.github/workflows/ci.yml` (fix the `master`→`main` trigger first) using a scoped Cloudflare API token stored as a GitHub repo secret.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (beyond wiring the deploy command into the existing workflow)
- Production-scale architecture (multi-region, HA, DR)
