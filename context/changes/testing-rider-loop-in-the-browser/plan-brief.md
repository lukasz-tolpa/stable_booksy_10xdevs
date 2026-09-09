# Rider Loop in the Browser (test rollout Phase 2) — Plan Brief

> Full plan: `context/changes/testing-rider-loop-in-the-browser/plan.md`
> Research: `context/changes/testing-rider-loop-in-the-browser/research.md`

## What & Why

Add the project's first browser-level tests so the rider loop (catalogue →
slots → booking → Moje zapisy → cancel) and its refusal path are proven the way
a user sees them, and close the slot-rule unit gaps against the PRD oracle.
This is Phase 2 of `test-plan.md` §3, covering risks #6 ("the loop breaks and
nobody notices"), #3 ("success page without a booking, or an unreadable
error") and #5 ("wrong slot offered").

## Starting Point

Vitest covers pure logic under `src/lib/**`; Phase 1 proves DB guarantees with
psql in CI (`supabase db start`, Postgres only). No Playwright, no test ids.
The booking endpoint redirects to success without reading the row back, the
success banner is query-param driven, a missing `hour` field coerces to `0`,
and `errorCode` is duplicated and untested. Two of the three PRD slot-rule
clauses live outside the pure function.

## Desired End State

`npm run test:e2e` walks the rider loop and the stale-page refusal in Chromium
against the local seed with fresh riders per run, asserting the "Twój zapis"
badge, the stable's day list and "Moje zapisy" — never the 302 or the banner.
`npm test` proves the PRD slot rule (boundary, assignment, seed example), the
closed Polish message set and per-field validation. CI has a required `e2e`
job that `deploy` waits on. §6.3/§6.4 tell the next contributor how to add a
browser or endpoint test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Gate placement | Required CI job on PR + push; `deploy` waits on it | Only layer proving SSR pages, cookies, redirects and Polish refusals together; +4–6 min in parallel is affordable | Plan |
| Test identity | Fresh riders per run via the sign-up UI; seeded stable read-only | No shared mutable state with Anna/Piotr; matches Playwright per-worker guidance | Plan |
| Refusal path | Stale page, two browser contexts (B books, A clicks stale button) | Exactly the PRD sentence about a slot that became taken; hits the real 23505 through the UI | Plan |
| Read-back on insert | `createBooking` returns `{ id }` via `.select('id').single()` | Closes "success without a row" at the source, consistent with cancel/toggle-active | Plan |
| Retired-but-assigned horse | Offered (pin current) | PRD rule is assignment to the day; DB contract agrees; `active` shapes only the herd view | Plan (S-04 lineage) |
| Permanent refusal message | Keep the fallback; assert Polish + closed set | Unreachable from the UI; PRD asks only for a readable message | Plan |
| Missing `hour` field | Validation error with the field's message | "Walidacja przed pierwszą mutacją"; current DB refusal is a misleading message | Plan |
| Oracle of persistence | Badge / Moje zapisy / stable day list, never banner or 302 | Banner renders from `?sukces=1` alone; redirect is emitted because nothing threw | Research |
| Selectors | Role/label/text scoped to the hour `listitem`; no test ids | Button name is the horse only; hour is a sibling; pages expose enough labels | Research |
| Server under test | `astro build` + `astro preview` on workerd; root `.dev.vars` written before build (locally by the developer, in CI by the job) | Astro docs; the worker reads the build-time `.dev.vars` snapshot, never `process.env` or `webServer.env` | Research + Plan review |
| CI stack | `supabase start -x …` keeping kong/gotrue/postgrest | `db start` has no GoTrue, so no login | Research |
| Seed slots | Loop books Kasztan@13, refusal uses Bella@14 at Pod Debem | Free in seed; distinct from Anna's Bella@11 and `test:db`'s Kasztan@12 | Research |

## Scope

**In scope:**
- Vitest: schema blanks, shared `errorCode`/`errorMessage` readers in `src/lib/db-errors.ts` + closed message set, `assignedHorses` extraction, slot-rule table cases
- Small production edits: schema helper, shared readers in `src/lib/db-errors.ts`, `assignedHorses` in the page, read-back in `createBooking`
- Playwright: config, auth setup (two riders + stable), helpers, two scenarios, ESLint/gitignore overrides
- CI `e2e` job, `deploy` dependency
- test-plan §3/§4/§5/§6.3/§6.4/§6.5, AGENTS.md, README

**Out of scope:**
- Hooks and lint/typecheck layering (Phase 3), visual snapshots, Supabase Auth configuration tests (§7)
- New refusal messages, retired-horse rule change, sign-in English pass-through
- Phase 1 SQL scripts, Playwright MCP/healer, `getByTestId`

## Architecture / Approach

Cheapest signal first: pure unit tables (Phase 1), then one browser harness
with sessions established through the real sign-up/sign-in UI and saved as
storage states (Phase 2), then a second scenario reusing two of those states
(Phase 3). Assertions read the app the way the PRD defines success — badge on
the booked day, row in the stable's list, row in Moje zapisy — and every
scenario cancels what it booked so reruns stay green. CI brings up the local
Supabase with the auth stack, builds against it, previews on workerd and runs
Chromium; the report is kept on failure.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Unit layer against the PRD oracle | Schema blanks fix, shared `errorCode`, `assignedHorses`, slot tables; all green under `npm test` | Assertions drifting into implementation mirrors — expected values must stay PRD/seed literals |
| 2. Playwright harness + rider loop | Config, auth setup, helpers, `rider-loop.spec.ts`, read-back in `createBooking` | Preview on workerd not seeing env; stale local seed; selector ambiguity across hours |
| 3. Refusal scenario | `booking-refusal.spec.ts` with two contexts and cleanup | Ordering (A must load before B books); leftover B booking if cleanup fails |
| 4. CI gate | `e2e` job with auth stack, artifact on failure; `deploy` waits | Stack startup time/flake on cold runners; env plumbing into the build |
| 5. Cookbook and docs sync | §3 complete, §4/§5 updated, §6.3/§6.4 recipes, §6.5 note, AGENTS/README | Docs drifting from what shipped (Phase 1 lesson) |

**Prerequisites:** Docker Desktop running; `npx supabase start` + `npx supabase db reset` today; `.dev.vars` pointing at `http://127.0.0.1:54321` with the local anon key; Node per `.nvmrc` (24 works too).
**Estimated effort:** ~4–5 sessions across 5 phases; Phase 1 is `/10x-tdd`-able, Phases 2–3 suit `/10x-e2e`.

## Open Risks & Assumptions

- `astro preview` (Cloudflare adapter, workerd) reads secrets only from the `.dev.vars` snapshot taken at build time, never from the process env; CI writes `.dev.vars` before `npm run build` (verified in plan review).
- The `e2e` job stays under ~8 min; otherwise §5 falls back to push-to-main + local gate (recorded in §6.5).
- Seed drift: tests read "tomorrow" from the page's day input, and fail fast with a `db reset` hint when the schedule is missing.
- Fresh riders accumulate locally until the next reset — accepted.
- The `{}` incident's root cause is unconfirmed; the closed-set unit test and the read-back are the defence, not a targeted fix.

## Success Criteria (Summary)

- A rider can book, see, and cancel a ride in a real browser against seeded data, and any deliberate break in that path turns a test red.
- A rider whose slot was taken meanwhile sees the specific Polish message and has no booking; no path shows success without a persisted row.
- The offered slot set for the seeded day equals the PRD rule exactly, proven by unit tables and by the browser.
