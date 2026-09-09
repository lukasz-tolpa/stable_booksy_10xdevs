# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-09

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`, `.github/`
(excluded: `dist/`, `node_modules/`, generated `database.types.ts`, lockfile).
Window: 30 days to 2026-09-08, 42 commits.

Product context (from PRD): two roles (Ośrodek = stable admin, Jeździec =
rider), email + password auth, no payments. The single success criterion is
the end-to-end booking loop: stable sets the day's schedule, rider sees free
slots (hour × horse) and books without a collision. Oracle for every test in
this plan is the PRD's Business Logic and Guardrails sections, never the
current implementation.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the _evidence that surfaced
this risk_ — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| #   | Risk (failure scenario)                                                                                                                                                                                     | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Two riders book the same horse at the same hour at the same moment and both bookings stay active — the stable has a double-booked horse                                                                     | High   | High       | PRD §Non-Functional Requirements (concurrency), PRD §Guardrails (no double booking); interview Q1, Q3; hot-spot dir `src/lib/bookings/` (19 changes/30d)                                   |
| 2   | Stable shortens the day's hours or removes a horse from the day and existing rider bookings vanish or silently become invalid, with no trace and no message                                                 | High   | Medium     | PRD §Open Questions #2 (schedule edits never delete bookings), archive `2026-08-11-daily-schedule-management/plan.md`; interview Q1, Q3; hot-spot dir `src/lib/schedule/` (10 changes/30d) |
| 3   | Rider clicks "Zapisz" and gets a success page without a booking in the database, or an unreadable error (e.g. `{}`), and does not know whether they have a ride                                             | High   | Medium     | interview Q1, Q2 (production error `{}` incident, 2026-09-07); hot-spot dir `src/pages/api/` (9 changes/30d)                                                                               |
| 4   | Abuse: a logged-in user reaches someone else's data by swapping an identifier — a rider cancels another rider's booking or calls a stable-only endpoint, a stable edits another stable's schedule or horses | High   | Medium     | PRD §Access Control + §Guardrails (stable modifies only own data), archive `2026-08-10-booking-data-schema/plan.md` (RLS isolation as foundation); interview Q4 (API endpoints untested)   |
| 5   | Rider sees a slot that should not be offered (outside working hours, horse not assigned that day, already taken) or does not see a genuinely free one, so they book wrongly or not at all                   | Medium | High       | PRD §Business Logic (slot rule), archive `2026-08-19-slot-booking-flow/plan.md`; hot-spot dir `src/lib/bookings/`                                                                          |
| 6   | The whole rider loop (catalogue → slots → booking → my bookings → cancel) stops working in the browser after a change and nobody notices until a user reports it                                            | High   | Medium     | PRD §Success Criteria (primary), roadmap north star S-04; interview Q2 (defects found only in review), Q4 (no browser-level test exists)                                                   |

Not on the map, by design: Supabase/Cloudflare outage (High impact, Low
likelihood — observability and the free-tier pause reminder, not a test);
"local vs production drift" (no concrete failure scenario — observability).

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                   | Must challenge                                                                                                 | Context `/10x-research` must ground                                                                                                                                                                   | Likely cheapest layer                                                                | Anti-pattern to avoid                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1   | With N parallel booking attempts on one horse-hour from separate connections, exactly one succeeds, the others get a readable refusal, and the slot has exactly one active booking afterwards                                 | "A uniqueness check in one session proves concurrency safety" — it does not; only separate connections do      | Where the guarantee lives (database constraint vs application code), how a rejected write surfaces to the endpoint, what "active" means for a cancelled booking, seed data available for the scenario | integration (real local Postgres, parallel writers)                                  | single-session assertion; mocking the database; asserting the current error string instead of "refusal + one active booking"                        |
| #2   | A schedule edit that collides with an existing booking (hour range no longer covers it, or its horse removed) is refused with a message and the booking is untouched; a non-colliding edit succeeds                           | "The application form prevents this so the database need not" — the guard must hold regardless of the client   | Where the guard lives, which codes/messages it produces, whether cancelled bookings count as collisions, seed data with a booking on the edited day                                                   | integration (database) + unit for the message mapping                                | implementation mirror (asserting whatever code the trigger currently returns); happy-path-only edit                                                 |
| #3   | After a successful booking the ride appears in "Moje zapisy" and in the stable's day list; after a refused booking the rider sees a Polish, specific message; no path returns success without a persisted row                 | "HTTP 302 after POST means the booking exists" — redirect is not persistence                                   | Entry point of the booking endpoint, how database errors are translated to user messages, what the success redirect carries, what happens on unexpected errors (including provider unreachable)       | e2e for the two user-visible outcomes + unit for error translation                   | asserting the raw provider message; testing only the happy path; treating `{}` or English provider text as acceptable                               |
| #4   | A request that names another user's resource (booking, stable, horse, schedule day) is refused and the data is unchanged, even though the caller is authenticated; a rider calling a stable-only endpoint gets a role refusal | "Logged in implies owner" and "the page never shows the button, so the endpoint is safe"                       | Which layer enforces ownership (RLS policies vs endpoint checks vs middleware), which identifiers each mutating endpoint accepts from the client, how role is resolved per request                    | integration (RLS with impersonated sessions) + endpoint-level call with a foreign id | testing only via the UI (which hides the button); over-mocking the auth layer; asserting "no rows visible" without also asserting "no rows changed" |
| #5   | For a known schedule (hours, horses, existing bookings) the offered slot set equals the PRD rule: hour in `[open, close)`, horse assigned that day, no active booking — and nothing else                                      | "The list is right because it matches the function output" — the oracle is the PRD rule, not the code          | Where slot availability is computed, whether it is computed once server-side, how "taken" is sourced (RLS hides other riders' bookings), boundary at `close` hour                                     | unit (pure logic, table-driven from PRD examples)                                    | oracle copied from implementation; missing boundary cases (close hour, cancelled booking, horse deactivated)                                        |
| #6   | A browser walks the rider loop end to end against seeded data and every step renders the expected state; a deliberate break in any step turns the test red                                                                    | "Unit tests on `src/lib` cover the loop" — they do not exercise SSR pages, forms, redirects or session cookies | Seeded accounts and data available to a browser, how sessions are established for tests, stable selectors (roles/labels) the pages expose, data isolation between runs                                | e2e (Playwright, 1–2 scenarios)                                                      | sleepy waits; brittle CSS selectors; shared mutable data across runs; asserting only that the page loaded                                           |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name                   | Goal (one line)                                                                                                                          | Risks covered | Test types              | Status      | Change folder                                                 |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------- | ----------- | ------------------------------------------------------------- |
| 1   | Database guarantees in CI    | Prove no double booking, no silent booking loss on schedule edits and no cross-tenant access — automatically, on every push, not by hand | #1, #2, #4    | integration (database)  | complete    | context/archive/2026-09-08-testing-database-guarantees-in-ci/ |
| 2   | Rider loop in the browser    | Prove the end-to-end booking loop and its refusal paths work as a user sees them, with the slot rule checked against the PRD oracle      | #6, #3, #5    | e2e (Playwright) + unit | complete    | context/changes/testing-rider-loop-in-the-browser/            |
| 3   | Quality gates and agent loop | Lock the floor: lint + typecheck at edit time for the agent, and every test layer above wired as a required CI gate                      | cross-cutting | post-edit hook, gates   | not started | —                                                             |

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

Test-base profile (at rollout start, 2026-09-08): **sparse** — Vitest
configured, 11 test files, all under `src/lib/`, 114 tests green; no server,
component or browser tests; database guarantees verified by hand-run scripts.
After §3 Phases 1–2 (2026-09-09): **meaningful** — Vitest 12 files / 157
tests (`src/lib/**`), database guarantees run in CI (`db-tests`), and two
Playwright scenarios cover the rider loop in CI (`e2e`). Still no component
tests by design (§7).

| Layer                  | Tool                                                                                                    | Version                                                                                                                        | Notes                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| unit                   | Vitest                                                                                                  | 4.x                                                                                                                            | `src/**/*.test.ts`, node environment, pure logic only                                                               |
| integration (database) | local Supabase (Postgres) via Supabase CLI + psql scripts (`supabase/tests/`, runner `npm run test:db`) | CLI 2.98, Postgres image 17.6.1.147 (pinned by the committed `supabase/postgres-version`, copied into `supabase/.temp/` in CI) | automated since §3 Phase 1: CI job `db-tests` (`supabase db start` + `npm run test:db`), `deploy` waits on it       |
| e2e                    | Playwright (`e2e/`, runner `npm run test:e2e`)                                                          | 1.63.0 (pinned exact), Chromium                                                                                                | since §3 Phase 2: against local Supabase with the auth stack (`npx supabase start`) + `astro preview`; CI job `e2e` |
| lint + typecheck       | ESLint (type-aware via `projectService`); `astro check` installed but not wired                         | current                                                                                                                        | CI runs `npm run lint`; Husky pre-commit runs lint-staged (`eslint --fix` on staged files only, no `astro check`)   |
| (optional) AI-native   | none                                                                                                    | n/a                                                                                                                            | no AI-native layer planned; deterministic tests cover every mapped risk cheaply                                     |

**Stack grounding tools (current session):**

- Docs: none (Context7 not available in current session) — Playwright/Astro setup will be verified against official docs via WebFetch during Phase 2 research; checked: 2026-09-08
- Search: Claude Code WebSearch — not used for this plan (no library choice pending); checked: 2026-09-08
- Runtime/browser: Playwright via local Node (no Playwright MCP) — possible verification layer for Phase 2; checked: 2026-09-08
- Provider/platform: GitHub CLI (CI runs, issues), Supabase CLI (local stack, `db reset`), Cloudflare via wrangler (deploy) — relevant to Phase 1 and Phase 3 gates; Supabase MCP exposes auth only; checked: 2026-09-08

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required for §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                              | Where                                                                                                        | Required?                                    | Catches                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------- |
| lint + typecheck                  | local (Husky pre-commit: lint-staged, staged files only) + CI (`npm run lint`, type-aware)                   | required                                     | syntactic / type drift                                   |
| unit (Vitest)                     | local + CI                                                                                                   | required                                     | pure-logic regressions (slot rule, validation, messages) |
| integration (database guarantees) | CI job `db-tests` (Postgres from Supabase CLI on the runner) + local `npm run test:db`                       | required (since §3 Phase 1; blocks `deploy`) | double booking, silent booking loss, cross-tenant access |
| e2e on the rider loop             | CI job `e2e` on PR and push (Supabase auth stack + `astro preview` on the runner) + local `npm run test:e2e` | required (since §3 Phase 2; blocks `deploy`) | broken critical user path, unreadable refusal            |
| post-edit hook (lint + typecheck) | local (agent loop)                                                                                           | recommended after §3 Phase 3                 | regressions at edit time                                 |
| auto-deploy on merge              | CI (Cloudflare Workers)                                                                                      | required (exists)                            | build breakage before production                         |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: next to the unit under test in `src/lib/<area>/`.
- **Naming**: `<module>.test.ts`.
- **Reference test**: `src/lib/bookings/slots.test.ts`.
- **Run locally**: `npm test`.
- **Oracle rule**: expected values come from the PRD (Business Logic,
  Guardrails) or the interview, never from the function's current output.

### 6.2 Adding a database integration test

- **Location**: `supabase/tests/`. One `.sql` file per guarantee area
  (single-connection assertions). A `.sh` only when the proof needs several
  connections (concurrency). Shared psql detection lives in `_psql.sh`; the
  runner is `run_all.sh` (with `run_all.mjs` as the cross-platform shim behind
  `npm run test:db`).
- **Naming**: `<area>_<scenario>.sql` (e.g. `rls_isolation.sql`,
  `schedule_change_guardrails.sql`); `<scenario>.sh` for multi-connection
  proofs (`concurrent_double_booking.sh`).
- **Reference tests**: `rls_isolation.sql` — persona + `row_count` pattern;
  `schedule_change_guardrails.sql` — setup as `postgres` → mutations as the
  owner through RLS → re-read after every refusal → foreign owner touches 0
  rows; `concurrent_double_booking.sh` — N parallel `psql` processes as two
  riders, `23505` + constraint name, release path after cancellation.
- **Run locally**: `npm run test:db` with a running stack (`npx supabase
start`) and a seed loaded **today** (`npx supabase db reset`) — the runner
  refuses when the seeded days are no longer "tomorrow", because `seed.sql`
  computes `current_date + 1` at load time. Without a host `psql` the runner
  falls back to `docker exec` into the local container. One file only:
  `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -q < supabase/tests/<file>.sql`.
- **Run in CI**: job `db-tests` in `.github/workflows/ci.yml` — `npx supabase
db start` (Postgres only, migrations + seed; image pinned through
  `supabase/.temp/postgres-version` to the same tag as locally) → `npm run
test:db`; on failure the job prints `docker logs` of the database. `deploy`
  waits on `ci` and `db-tests`.
- **Pattern** (one transaction, rolled back): `begin;` → setup as `postgres`,
  passing ids to later blocks with `set_config('app.<name>', …, true)` → `set
local role authenticated; set local request.jwt.claims =
'{"sub":"<uuid>","role":"authenticated"}'` → the mutation → assert the
  SQLSTATE (`exception when sqlstate 'SB002'`, `foreign_key_violation`,
  `insufficient_privilege`) **and** `get diagnostics v = row_count` (`0` for a
  foreign row; `1` for the owner — otherwise you do not know RLS let the owner
  in) **and** re-read the affected row → `rollback;`. `\set ON_ERROR_STOP on`
  plus `raise exception 'FAIL: …'` makes psql exit non-zero, which is what the
  runner and CI read.
- **Oracle rule**: assert codes and post-state, never Polish messages (those
  are unit-tested in `src/lib/*/errors.test.ts`). Expected behaviour comes from
  PRD Guardrails / Open Question #2, not from what the trigger returns today.
- **Sabotage check**: before trusting a new assertion, break its guard locally
  (drop the index or trigger, `alter table … disable row level security`), watch
  the script go red, then `npx supabase db reset`. A test that cannot fail
  proves nothing.
- **Seed personas**: `1111…` stable A (Stadnina Pod Debem), `2222…` stable B
  (Stajnia Nad Rzeka), `3333…` rider Anna, `4444…` rider Piotr; password
  `sekret123`. Identity ids of stables, horses, days and bookings are not fixed
  — resolve them by name or owner uuid, never hardcode.

### 6.3 Adding an e2e test

- **Location**: `e2e/`. Config `playwright.config.ts` (root); shared
  locators and steps in `e2e/helpers.ts`; sessions in `e2e/auth.setup.ts`
  (project `setup`, runs before `chromium`).
- **Naming**: `<scenario>.spec.ts`, one `test` per user-visible outcome, split
  into `test.step`s named after what the user sees.
- **Reference tests**: `rider-loop.spec.ts` — the full loop (catalogue →
  slot list vs. PRD → book → "Twój zapis" badge → stable's day list → "Moje
  zapisy" → cancel → slot freed); `booking-refusal.spec.ts` — two browser
  contexts racing on one slot, refusal text, no row, flag-guarded cleanup.
- **Run locally**: `npx supabase start` → `npx supabase db reset` (seed days
  are `current_date + 1`; a stale seed fails fast with the hint "Seed
  nieaktualny…") → `npm run test:e2e`. Root `.dev.vars` must point at
  `http://127.0.0.1:54321` + the local anon key **before** the run: the
  `webServer` command is `npm run build && npm run preview`, and the built
  worker reads secrets only from the `.dev.vars` snapshot taken at build
  (`dist/server/.dev.vars`) — never from `process.env` or `webServer.env`.
  `npm run test:e2e:ui` opens the UI mode; failures write `test-results/`
  (trace on first retry in CI; `--trace on` locally, view with
  `npx playwright show-trace <zip>`).
- **Run in CI**: job `e2e` in `.github/workflows/ci.yml` — `npx supabase start
-x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`
  (keeps kong + gotrue + postgrest; `db start` has no GoTrue, so no login) →
  writes `.dev.vars` from `supabase status -o env` → `playwright install
--with-deps chromium` → `npx playwright test`; on failure uploads
  `playwright-report` and prints the auth/db container logs. `deploy` waits on
  it. Measured: 3m40s on a cold runner.
- **Pattern**: sessions are established through the real UI once per run —
  two **fresh riders** signed up as `e2e-rider-<a|b>-<timestamp>@example.com`
  (confirmations are off locally) and the seeded stable signed in read-only;
  saved as storage states under `playwright/.auth/` (gitignored). Selectors
  are role / label / text only, scoped to the hour `listitem`
  (`hourSection(page, 13).getByRole('button', { name: 'Kasztan', exact: true })`)
  because a booking button is named by the horse alone and "1:00" is a
  substring of "11:00". Waits are `waitForURL(/sukces=1/)` / `(/error=/)` —
  every mutation is a plain form POST + 302. Before filling a React island
  form call `waitForIslands(page)` (waits for `astro-island[ssr]` to vanish;
  a pre-hydration `fill` is wiped by the island's controlled state). The
  oracle of persistence is the badge, "Moje zapisy" and the stable's day
  list — never the success banner (query-param driven) nor the redirect.
  Every scenario cancels what it booked; a run that dies mid-way leaves an
  active booking and the next run goes red on "slot free" — repair with
  `npx supabase db reset`.
- **Seed slots reserved**: Kasztan@13 (rider loop), Bella@14 (refusal),
  Kasztan@12 (`test:db` concurrency script) — all at Stadnina Pod Debem,
  tomorrow. Do not run `npm run test:db` and `npm run test:e2e` against the
  same database at the same time.
- **Sabotage check**: before trusting a new assertion break its guard (drop
  the insert, rename `?sukces=`, relabel the button, remap a code to the
  fallback) and watch the scenario go red at that step; revert.

### 6.4 Adding a test for a new API endpoint

- **Redirect is not persistence.** Every endpoint answers 302 with
  `?error=<Polish text>` or `?sukces=1`; the page renders both from the query
  string, so neither proves a row exists. A mutating query reads back the row
  (`.select('id').single()` / `.maybeSingle()`, as in `createBooking`,
  `cancelBooking`, `toggle-active`) and the endpoint redirects to success only
  when a row came back. A read-back after INSERT depends on the caller's
  own-row SELECT policy: Postgres applies it to the `RETURNING` rows, so a
  narrowed policy makes the whole INSERT fail (42501, no orphan row) and the
  feature stops working — re-run `npm run test:e2e` after any RLS change on
  that table.
- **Assert post-state, not the 302**: through a page the user can reach
  (e2e, §6.3) or a DB read (SQL, §6.2). Test the refusal path in a browser
  only when a browser can reach it (stale page, second context); refusals no
  UI can produce (role refusal, forged ids) belong to unit + §6.2.
- **Error translation**: read the thrown value with `@/lib/db-errors`
  (`errorCode` / `errorMessage`, tested once in `src/lib/db-errors.test.ts` —
  `{}`, `TypeError`, numeric codes never leak), map it through the area's
  table (`src/lib/<area>/errors.ts`) and pin that table as a **closed Polish
  set** in `src/lib/<area>/errors.test.ts` (`it.each` over odd inputs; no
  provider text such as `fetch`, `duplicate key`, `violates`).
- **Validation before the first mutation**: numeric form fields go through
  the digit-only helper in the area's `schema.ts` (`formInt`) so a missing or
  blank field is a per-field validation message, never `0` refused by the
  database with a misleading text. Cover blanks with `it.each` per field.
- **Ownership** follows the Phase 1 RLS pattern (§6.2): explicit
  `rider_id` / `stable_id` filters in the query plus the SQL proof.

### 6.5 Per-rollout-phase notes

(After each phase lands, `/10x-implement` appends a 2–3 line note here
capturing anything surprising the rollout phase taught.)

- **Phase 1 (2026-09-08, Database guarantees in CI).** `supabase db start` is
  enough for SQL-level proofs (no GoTrue; impersonate with `set local role
authenticated` + `request.jwt.claims`). The CLI's default Postgres image on
  the runner (17.6.1.106) crashed into recovery mode on `set local role anon`;
  pinning `supabase/.temp/postgres-version` to the local 17.6.1.147 fixed it —
  CI must run the image developers run. Locally the seed's `current_date + 1`
  drifts after a day, so the runner guards seed freshness. Cancelled bookings
  pin the horse-day assignment (FK RESTRICT) — recorded as a decision in PRD
  Open Question #2, not fixed as a bug; the app pre-check now agrees with the
  FK. On Windows `npm run` sees WSL's `bash`, hence the `run_all.mjs` shim that
  finds Git Bash.
- **Phase 2 (2026-09-09, Rider loop in the browser).** The Cloudflare worker
  under `astro preview` reads secrets only from the `.dev.vars` snapshot made
  at `astro build` — `process.env`, `webServer.env` and `$GITHUB_ENV` never
  reach it, so CI writes `.dev.vars` before building. React islands with
  controlled inputs wipe a pre-hydration `fill`; wait for `astro-island[ssr]`
  to disappear (`waitForIslands`). A scenario that dies after booking leaves
  an active booking and turns the next run red on "slot free" — the repair is
  `npx supabase db reset`, same as for `test:db`. The `e2e` job takes 3m40s on
  a cold runner (ci 1m36s, db-tests 2m31s), well under the 8-minute fallback
  threshold; a forced failure published the `playwright-report` artifact.
  Cloudflare's own "Workers Builds" check also appears on PRs — it is not part
  of the workflow and not a gate.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Supabase Auth configuration** (email + password sign-in, session
  cookies, confirmation settings) — provider code, not ours. Re-evaluate if
  a second auth method or custom claims are introduced. (Source: Phase 2
  interview Q5.)
- **Visual appearance and snapshots** (landing, shadcn components, layout)
  — no data effect, easily reverted; a planned redesign would make
  snapshots churn. Re-evaluate if a visual regression reaches users.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-08
- Stack versions last verified: 2026-09-08
- AI-native tool references last verified: 2026-09-08

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
