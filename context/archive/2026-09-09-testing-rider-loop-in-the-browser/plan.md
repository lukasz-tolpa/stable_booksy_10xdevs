# Rider Loop in the Browser (test rollout Phase 2) — Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md` covers risks #6 (the whole
rider loop breaks and nobody notices), #3 (success page without a persisted
booking, or an unreadable refusal) and #5 (wrong slot set). This plan adds the
first browser-level layer to the project — a Playwright suite that walks the
rider loop against the local Supabase seed and drives one refusal path through
two browser contexts — closes the slot-rule unit gaps against the PRD oracle,
fixes the three oracle holes decided during planning, wires the suite as a
required CI gate, and fills cookbook §6.3/§6.4.

The oracle for every assertion is the PRD (Business Logic, Guardrails, US-01)
and the decisions recorded in `plan-brief.md`, never the current output of the
code (test-plan §1, §6.1).

## Current State Analysis

Grounded in `research.md` (permalinks at commit `f34504b`):

- **No browser test exists.** Vitest covers pure logic under `src/lib/**`
  (`vitest.config.ts:14` includes only `src/**/*.test.ts`); `db-tests` proves DB
  guarantees with psql. `@playwright/test` is not installed.
- **The rider loop is server-rendered forms + 302.** Every mutation redirects to
  `?sukces=1` or `?error=<Polish text>`; pages render `{error}` verbatim and the
  success banner from the query param alone (`src/pages/jezdziec/osrodki/[id].astro:117-126`).
  There is no "Zapisz" button: each free slot is a form whose button is named by
  the horse only, inside the hour's `<li>` (`[id].astro:186-208`). An own booking
  is a `<span>` "`<horse> — Twój zapis`". Taken slots are not rendered.
- **Redirect is not persistence.** `createBooking` inserts with no `.select()`
  (`src/lib/bookings/queries.ts:209-220`); `create.ts:105` redirects to success
  because nothing threw. Cancel and toggle-active already use the read-back
  pattern.
- **Error translation** is a closed table (`src/lib/bookings/errors.ts:11-31`)
  with a generic fallback; `errorCode` is duplicated in `create.ts:41-46` and
  `schedule/save.ts:28-32` and is untested. A missing `hour` field coerces to
  `0` (`form-data.ts:8-11` + `z.coerce.number("")`) and is refused by the DB
  as "poza zakresem pracy" instead of failing validation.
- **Slot rule**: `computeSlotSections` (`src/lib/bookings/slots.ts:56-84`) owns
  only the `[open, close)` clause; "horse assigned that day" is a filter in the
  page frontmatter (`[id].astro:49-54`), "not taken" is the RPC predicate.
  `slots.test.ts` has 9 PRD-literal cases, no mirror; gaps listed in research §C.
- **CI**: `db-tests` uses `supabase db start` (Postgres only, no GoTrue) so it
  cannot serve a login. An e2e job needs `supabase start -x …` keeping
  kong/gotrue/postgrest, then `astro build` + `astro preview` (both on workerd).
- **Seed** (`supabase/seed.sql`): Pod Debem 10–16 tomorrow with Bella + Kasztan
  (Iskra unassigned), Anna holds Bella@11; Nad Rzeka 9–14 with Grom, Piotr holds
  Grom@10. Stable `osrodek.debem@example.com` / `sekret123`. Days are
  `current_date + 1` at seed time — a stale seed makes tomorrow schedule-less.
  `concurrent_double_booking.sh` deletes/re-inserts Kasztan@12.
- **Local machine**: `.dev.vars` overrides `webServer.env` (adapter assigns it
  over `process.env`); `npm run` must not invoke `bash`; no host `psql`.

## Desired End State

- `npm test` passes with new table-driven cases proving the PRD slot rule
  (boundary, assignment, full seed example), the closed Polish message set for
  every error shape (`{}`, `TypeError`, `""`, `42501`), and per-field validation
  errors for missing form fields.
- `npx playwright test` boots `astro preview` against the local stack and runs
  two scenarios green: the rider loop (catalogue → book → badge → stable day
  list → Moje zapisy → cancel → slot freed) and the stale-page refusal (second
  rider takes the slot; first rider sees the Polish 23505 message and has no
  row). Selectors are role/label/text only; no sleeps; fresh riders per run.
- `createBooking` returns the inserted row id and the endpoint cannot redirect
  to success without it.
- CI has a required `e2e` job; `deploy` waits on `ci`, `db-tests` and `e2e`.
- test-plan §3 Phase 2 row is `complete`, §4 e2e row names Playwright + version,
  §5 e2e gate is `required`, §6.3/§6.4 hold the patterns, §6.5 has the Phase 2
  note, AGENTS.md hard rules mention the e2e layer.

Verification: every phase ends with a sabotage check — a deliberate break turns
the new test red (test-plan §6.2 "a test that cannot fail proves nothing").

### Key Discoveries:

- Booking button accessible name = horse name only; hour in sibling `<p>`
  (`[id].astro:189,206`) → scope by `listitem` containing `getByText('13:00', { exact: true })`.
- Stable day list defaults to **today** (`src/pages/osrodek/zapisy.astro:19`);
  navigate with `?dzien=`. Rider shown by `full_name` or "(bez nazwiska)".
- Sign-up form is a native POST with radios labelled "Jeździec"/"Ośrodek",
  labels "Adres e-mail", "Hasło", "Powtórz hasło", button "Załóż konto";
  success redirects to `/jezdziec` (`src/pages/api/auth/signup.ts:47`).
  Confirmations are off locally (`supabase/config.toml:209`).
- `eslint.config.js:40-60` applies React + react-compiler rules to all
  `**/*.{ts,tsx}` — an `e2e/` folder needs an override; `.gitignore` is imported
  as the ESLint ignore list (`eslint.config.js:12,72`).
- Playwright resolves tsconfig `paths`, so `@/lib/schedule/dates` is importable
  from `e2e/` — but tests must not import app logic as an oracle. Date helpers
  only.

## What We're NOT Doing

- No post-edit hooks, no lint/typecheck hook layering (test-plan §3 Phase 3).
- No visual snapshots, no vision/multimodal review (test-plan §7).
- No tests of Supabase Auth configuration itself (§7); the sign-in
  pass-through of English `error.message` is noted, not fixed.
- No new refusal messages: `42501`/network keep the existing fallback (decision).
- No change to the retired-horse rule: assigned + retired stays offered (decision).
- No changes to Phase 1 SQL scripts or `db-tests`.
- No Playwright MCP, no healer, no `getByTestId`.
- No `lessons.md` creation (absent by design in this repo; §6.5 is the register).

## Implementation Approach

Cheapest signal first (test-plan §1): Phase 1 is pure Vitest plus the three
small production fixes it needs (schema, shared `errorCode`, extracted
assignment filter). Phase 2 builds the browser harness and the single happy-path
scenario, adding read-back to `createBooking` so the e2e's sabotage step has a
real guard to break. Phase 3 adds the refusal scenario using two authenticated
contexts (the PRD sentence "próba zapisu na slot, który stał się zajęty, jest
odrzucana"). Phase 4 wires CI. Phase 5 syncs the quality contract and docs.

Isolation: the auth setup project signs up two fresh riders per run
(`e2e-rider-a-<ts>@example.com`, `…-b-…`) and signs in the seeded stable
(read-only use). Scenarios use Kasztan@13 (loop) and Bella@14 (refusal) at
Pod Debem — free in seed, distinct from Anna's Bella@11 and from the
concurrency script's Kasztan@12. Every scenario cancels what it booked; a
stale local database is repaired with `npx supabase db reset` (same convention
as `npm run test:db`).

Execution modes: Phase 1 is `/10x-tdd`-able (first red test: "brakujące pole
`hour` daje komunikat «Nieprawidłowa godzina», nie 0"). Phases 2–3 are for
`/10x-e2e` or `/10x-implement`. Phases 4–5 are `/10x-implement`.

## Critical Implementation Details

**Environment for `astro preview`.** `astro:env` secrets resolve at runtime
from the worker's `env` (`cloudflare:workers`), which preview's miniflare
fills from `dist/server/.dev.vars` — a snapshot of the root `.dev.vars` taken
by the Cloudflare Vite plugin during `astro build` (verified in
`@cloudflare/vite-plugin` + wrangler `getVarsForDev`; `process.env` is
excluded unless `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`). Consequences: the
**only** supported way to point the app at a stack is a root `.dev.vars`
written **before** `npm run build`; `webServer.env` and `$GITHUB_ENV` exports
have no effect on the served worker; after changing `.dev.vars` the app must be
rebuilt (the `webServer.command` does this). In CI the job writes the two
lines from `npx supabase status -o env`. Locally the developer's `.dev.vars`
must already hold `http://127.0.0.1:54321` + the local anon key.

**Seed freshness.** The first assertion of each scenario checks the "Wolne
sloty" list is rendered and fails with the message `Seed nieaktualny albo
stack nie działa — uruchom: npx supabase db reset` when the page shows
"Ośrodek nie ułożył grafiku na ten dzień." — the same guard `run_all.sh:48-53`
gives `test:db`.

**Ordering in the refusal scenario.** Rider A must load the stable page
*before* rider B books; only then is A's button stale. Assert B's success by
B's own badge before A clicks. After A's refusal, A's page is the redirect
target with `?error=`, so assert the URL param first, then the text.

**Windows.** `npm run test:e2e` must be `playwright test` (Node), never a
`bash` entrypoint; `webServer.command` stays `npm run build && npm run preview`
(Playwright runs it through the platform shell, `&&` works in cmd).

---

## Phase 1: Unit layer against the PRD oracle

### Overview

Close the risk #5 and #3 unit gaps from research §B/§C and apply the three
oracle decisions: missing form fields are validation errors, every error shape
maps into the closed Polish set, and "assigned that day" is a testable pure
rule (retired-but-assigned = offered). Includes the small production edits those
tests need.

### Changes Required:

#### 1. Numeric form fields reject blanks

**File**: `src/lib/bookings/schema.ts`

**Intent**: A missing, empty or whitespace-only `stableId`, `horseId`, `hour` or
`bookingId` must fail validation with that field's Polish message before any DB
call. Today `z.coerce.number("")` yields `0`, so a missing `hour` passes and the
DB refuses it with the misleading working-hours message.

**Contract**: Introduce one local helper (e.g. `formInt(message)`) producing a
zod schema that accepts only trimmed decimal-digit strings (`/^\d+$/`) and
transforms to an integer; `hour` keeps `0..23`, ids keep `positive`, each with
its existing message. `BookingInput`/`CancelInput` types unchanged. Both
`bookingSchema` and `cancelSchema` use it.

#### 2. Schema tests for missing fields

**File**: `src/lib/bookings/schema.test.ts`

**Intent**: Prove the oracle: each absent/blank/whitespace numeric field yields
its own message, and `hour: ""` is `Nieprawidłowa godzina`, never `0`.

**Contract**: `it.each` over `[field, blank value, expected message]` for
`stableId`, `horseId`, `hour` and `cancelSchema.bookingId`; plus a negative for
`" 12 "` being accepted as `12` (trim) and `"1e2"` rejected. Existing cases stay.

#### 3. Shared provider-error readers

**File**: `src/lib/db-errors.ts` (new)

**Intent**: One home for the two duck-typed readers of a thrown Supabase /
PostgREST value, currently duplicated as private functions in
`create.ts:42-46` and `save.ts:28-38`. Area-agnostic, so neither endpoint
imports the other area's error table.

**Contract**: `export function errorCode(error: unknown): string | undefined`
— `error.code` only when `error` is a non-null object whose `code` is a
string; everything else (`{}`, `null`, `Error` instances, numeric codes, bare
strings) → `undefined`. `export function errorMessage(error: unknown): string | undefined`
— same shape for `message`. Both are moved verbatim; per-area message tables
(`bookings/errors.ts`, `schedule/errors.ts`) are unchanged.

**Files**: `src/pages/api/bookings/create.ts`, `src/pages/api/schedule/save.ts`

**Intent**: Import from `@/lib/db-errors`; delete the local copies. No
behaviour change.

#### 4. Reader and closed-message-set tests

**File**: `src/lib/db-errors.test.ts` (new)

**Intent**: Prove the readers never surface provider objects as codes.

**Contract**: `it.each` for `errorCode` with `{}`, `null`, `undefined`,
`new TypeError("fetch failed")`, `{ code: 23505 }`, `"23505"`, `{ code: "" }`
→ `undefined` (or `""` for the last); `errorMessage` with `{}`,
`new Error("x")` (own `message` is an own string property → `"x"`),
`{ message: 1 }` → `undefined`.

**File**: `src/lib/bookings/errors.test.ts`

**Intent**: Pin the decision that every code a rider can hit resolves to one of
the four Polish messages.

**Contract**: `it.each` for `bookingErrorMessage` with `"42501"`, `""`,
`"PGRST116"`, `undefined` → the exact fallback; one test that for a sample of
inputs the output ∈ the closed set of four messages and none contains `fetch`,
`TypeError`, `duplicate key`, `violates`.

#### 5. Assignment filter as a pure rule

**File**: `src/lib/bookings/slots.ts`

**Intent**: Extract the page's "horses assigned to the day" filter so the PRD
clause "koń przydzielony do pracy tego dnia" is unit-testable; document that
`active` is deliberately ignored (decision: retired-but-assigned is offered).

**Contract**: `export function assignedHorses(horses: readonly { id: number; name: string; active?: boolean }[], assignedIds: readonly number[]): { id: number; name: string }[]`
— keeps input order, drops unassigned ids, ignores `active`, ignores assigned
ids with no matching horse.

**File**: `src/pages/jezdziec/osrodki/[id].astro`

**Intent**: Replace the inline `Set` filter (lines 49–54) with `assignedHorses`.
Rendering unchanged.

#### 6. Slot-rule table cases

**File**: `src/lib/bookings/slots.test.ts`

**Intent**: Fill the research §C gaps with PRD-derived literals.

**Contract**: add — boundary as explicit negatives (10–16 offers 15, not 16, not
9); `open === close` → `[]`; width-1 range → `[10]`; **seed full-set example**
(10–16, Bella + Kasztan, `(Bella,11)` taken, viewer not owner → exactly the 11
slots, hour 11 = Kasztan only); phantom horse (taken pair for id not in
`horses`) → no phantom; duplicate taken entries → same result; `myBookings`
pair not in `takenSlots` → still `mine` (documented as tolerated input);
`assignedHorses` cases: unassigned dropped (Iskra), order kept, `active:false`
still included, unknown assigned id ignored, empty assignment → `[]`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass with the new cases: `npm test`
- Type-aware lint passes (no duplicated `errorCode`, no unused imports): `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Sabotage: change `hour < input.closeHour` to `<=` in `slots.ts` → boundary test red; revert.
- Sabotage: make `errorCode` return `String(error)` → `errorCode({})` test red; revert.
- Sabotage: revert the schema helper to `z.coerce.number()` → missing-`hour` test red; revert.
- With the local stack running, submit the booking form from the stable page with `hour` removed via devtools → the page shows "Nieprawidłowa godzina" (not the working-hours message).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Playwright harness + rider loop scenario

### Overview

Install and configure Playwright, establish sessions through the real UI, and
write the single end-to-end scenario for risk #6/#3: a fresh rider books
Kasztan@13 at Pod Debem tomorrow, the booking is visible where the PRD says it
must be, and cancelling frees the slot. Add read-back to `createBooking` so the
"no success without a row" guard exists at the source.

### Changes Required:

#### 1. Playwright dependency and scripts

**File**: `package.json`

**Intent**: Add `@playwright/test` pinned to the current release (research:
1.63 on 2026-09-09, verify at install) and scripts.

**Contract**: devDependency `@playwright/test`; scripts `"test:e2e": "playwright test"`,
`"test:e2e:ui": "playwright test --ui"`. No `bash` entrypoints.

#### 2. Playwright config

**File**: `playwright.config.ts`

**Intent**: One config: preview server, Chromium, serial workers, auth setup
project, storage states, traces on retry.

**Contract**: `testDir: "e2e"`; `baseURL: "http://localhost:4321"`;
`webServer: { command: "npm run build && npm run preview", url: baseURL, timeout: 180_000, reuseExistingServer: !process.env.CI }`;
`workers: 1`, `fullyParallel: false`; `retries: process.env.CI ? 1 : 0`;
`use.trace: "on-first-retry"`, `use.locale: "pl-PL"`, `use.timezoneId: "Europe/Warsaw"`;
projects: `setup` (`testMatch: /.*\.setup\.ts/`) and `chromium`
(`dependencies: ["setup"]`). Storage states live under `playwright/.auth/`.

#### 3. Auth setup project

**File**: `e2e/auth.setup.ts`

**Intent**: Create two fresh riders through the sign-up UI and sign in the
seeded stable, saving three storage states, so scenarios never log in.

**Contract**: three `setup(...)` steps writing `playwright/.auth/rider-a.json`,
`rider-b.json`, `stable.json`. Riders: `/auth/signup`, choose radio
"Jeździec", fill "Adres e-mail" with `e2e-rider-<a|b>-<Date.now()>@example.com`,
"Hasło" / "Powtórz hasło" with `sekret123`, click "Załóż konto",
`waitForURL('/jezdziec')`. Stable: `/auth/signin` as
`osrodek.debem@example.com` / `sekret123`, `waitForURL('/osrodek')`.
Rider emails are exported through a small JSON next to the state (or process
env) only if a scenario needs them; the loop scenario does not.

#### 4. Shared e2e helpers

**File**: `e2e/helpers.ts`

**Intent**: Keep scenarios readable and selectors in one place.

**Contract**: `hourSection(page, hour)` →
`page.getByRole('listitem').filter({ has: page.getByText(`${hour}:00`, { exact: true }) })`;
`openStable(page, name)` → `/jezdziec`, fill "Szukaj ośrodka", click "Szukaj",
click link with substring `name`, wait for `h1` = name, return the `dzien`
value read from the "Wybierz dzień" input (tomorrow, as the app computes it);
`assertSlotsRendered(page)` → the seed-freshness guard from Critical Details;
`bookingRow(page, stable, horse)` for "Moje zapisy".

#### 5. Rider loop scenario

**File**: `e2e/rider-loop.spec.ts`

**Intent**: Prove risk #6 and the success half of #3 as the PRD states them:
booking appears in the stable's schedule and the slot is taken; cancel frees it.

**Contract** (one `test`, `storageState: rider-a.json`, plus a second context
from `stable.json`):
1. `openStable("Stadnina Pod Debem")` → `assertSlotsRendered`; hour 13 section
   has button "Kasztan"; hour 16 section absent; no button "Iskra" anywhere;
   hour 11 section has no button "Bella" (Anna's seed booking).
2. Click "Kasztan" in hour 13 → `waitForURL(/sukces=1/)`; banner text
   "Zapisano na jazdę."; hour 13 shows "Kasztan — Twój zapis" and no "Kasztan"
   button.
3. Stable context: `/osrodek/zapisy?dzien=<day>` → listitem with "13:00" and
   "Kasztan" visible (rider shown as "(bez nazwiska)").
4. Rider: `/jezdziec/zapisy` → heading "Nadchodzące"; row with "Pod Debem",
   "Kasztan", "13:00"; click its "Odwołaj" → `waitForURL(/sukces=1/)`; text
   "Zapis został odwołany."; "Nadchodzące" shows "Nie masz nadchodzących
   zapisów."; heading "Minione i odwołane" with the row marked "odwołany".
5. Stable context reload → no "13:00"/"Kasztan" row. Rider: stable page hour 13
   has button "Kasztan" again.
No `waitForTimeout`; no CSS selectors; assertions via `expect(locator)`.

#### 6. Read-back on insert

**File**: `src/lib/bookings/queries.ts`

**Intent**: `createBooking` returns the persisted row id; a redirect to success
is impossible without a row.

**Contract**: `createBooking(...): Promise<{ id: number }>` using
`.insert(...).select("id").single()`; throw the error when present; the
doc comment names this as the read-back pattern shared with `cancelBooking`
**and states the dependency**: the read-back works only because
`bookings_select_own_or_my_stable` lets a rider SELECT their own row
(`20260810090100:263-275`); if that policy is ever narrowed, the insert would
persist while the read-back fails and the rider would see the fallback message
with a booking on record — the mirror image of risk #3 — so any RLS change on
`bookings` must re-run `npm run test:e2e`.

**File**: `src/pages/api/bookings/create.ts`

**Intent**: Success redirect only after the id came back (await the result;
no other behaviour change).

#### 7. Lint and ignore rules

**File**: `eslint.config.js`

**Intent**: Lint `e2e/**` and `playwright.config.ts` with the TypeScript rules
but without React/hooks/compiler rules.

**Contract**: add `ignores: ["e2e/**", "playwright.config.ts"]` inside the
`reactConfig` block (flat-config per-object ignores; `baseConfig` has no
`files` filter and `projectService` already covers both paths through
`tsconfig.json`'s `**/*` include); keep `no-floating-promises` on — every
Playwright `expect` must be awaited. Spec files use `import type` for
type-only imports (`Page`, `Locator`) because the inherited Astro tsconfig sets
`verbatimModuleSyntax`.

**File**: `.gitignore`

**Intent**: Ignore Playwright outputs and saved sessions.

**Contract**: `playwright-report/`, `test-results/`, `blob-report/`,
`playwright/.auth/`.

### Success Criteria:

#### Automated Verification:

- `npx playwright test e2e/rider-loop.spec.ts` green locally against a fresh seed (`npx supabase db reset` first)
- `npm run lint` passes including `e2e/**`
- `npm test` and `npm run build` still pass

#### Manual Verification:

- Sabotage: comment out `if (error) throw error` in `createBooking` and make it return `{ id: 0 }` → scenario red at step 2 (no badge) — proves the badge, not the 302, is the oracle; revert.
- Sabotage: change the success param name in `backToStable` → scenario red at `waitForURL`; revert.
- Sabotage: hide the "Odwołaj" form → scenario red at step 4; revert.
- Run the suite twice in a row without a reset → second run green (fresh riders, cancelled booking).
- Trace viewer opens for a forced failure (`--trace on`) and shows the Polish pages.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Refusal scenario — stale page, two contexts

### Overview

Prove the refusal half of risk #3 and the "already taken" clause of #5 the way
a rider meets it: the slot was free when the page loaded and is taken by the
time they click. The rider must see the specific Polish message and must not
have a booking.

### Changes Required:

#### 1. Refusal scenario

**File**: `e2e/booking-refusal.spec.ts`

**Intent**: Two authenticated contexts (rider A from `rider-a.json`, rider B
from `rider-b.json`) race on Bella@14 at Pod Debem tomorrow.

**Contract** (one `test`):
1. A: `openStable` → `assertSlotsRendered`; hour 14 has button "Bella". Keep
   this page open.
2. B (new context): `openStable` → click "Bella" in hour 14 →
   `waitForURL(/sukces=1/)`; hour 14 shows "Bella — Twój zapis".
3. A clicks the stale "Bella" in hour 14 → `waitForURL(/error=/)`; text
   "Ten slot został właśnie zajęty. Wybierz inny termin lub konia." visible;
   hour 14 has no "Bella" button (re-rendered from the DB).
4. A: `/jezdziec/zapisy` → "Nie masz nadchodzących zapisów." (no row — no
   success without a persisted row).
5. Cleanup: a `bookedByB` flag is set only after B's badge assertion in
   step 2; `test.afterEach` (or a `try/finally` that rethrows the original
   error first) cancels B's booking via "Odwołaj" and asserts the success
   text **only when the flag is set**, so a failure before B booked is
   reported as itself, not as a cleanup failure.
No sleeps; the ordering guard from Critical Details.

#### 2. Unit guard for the message (already in Phase 1)

No new file. The exact message string asserted here is the one pinned in
`errors.test.ts`; if the copy changes, both layers go red together.

### Success Criteria:

#### Automated Verification:

- `npx playwright test` (both scenarios) green locally against a fresh seed
- `npm run lint` passes

#### Manual Verification:

- Sabotage: map `23505` to the fallback message in `errors.ts` → scenario red at step 3; revert.
- Sabotage: drop `where status = 'active'`-equivalent by making B's booking cancelled before A clicks (cancel B first, then A clicks) → A succeeds; confirms the scenario really depends on the active booking; restore order.
- Run the suite twice without reset → green both times (B's cleanup worked).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: CI gate

### Overview

Run the suite on every push and PR to `main` as a required job, in parallel
with `ci` and `db-tests`; `deploy` waits on all three.

This phase is implemented on a branch (`test-rollout/phase-2-e2e-gate` or
similar) and opened as a pull request with `gh pr create`, because the
success criteria below observe the job on a PR run and on a forced failure;
the history so far is direct pushes to `main`, which would give no PR to
watch. Merge after the job is green; the merge push then exercises
`deploy.needs`.

### Changes Required:

#### 1. `e2e` job

**File**: `.github/workflows/ci.yml`

**Intent**: Bring up the auth-capable local stack, build against it, run
Playwright, keep the report on failure.

**Contract**: new job `e2e` (`runs-on: ubuntu-latest`, `timeout-minutes: 20`):
checkout; setup-node from `.nvmrc` with npm cache; `npm ci`;
`mkdir -p supabase/.temp && cp supabase/postgres-version supabase/.temp/postgres-version`
(same pin rationale as `db-tests`); `npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`;
write root `.dev.vars` with `SUPABASE_URL=http://127.0.0.1:54321` and
`SUPABASE_KEY=<ANON_KEY parsed from npx supabase status -o env>` — this file,
not the process environment, is what the built worker reads (see Critical
Implementation Details); `npx playwright install --with-deps chromium`;
`npx playwright test` with `CI=true` (the `webServer` builds + previews, and
the build snapshots `.dev.vars` into `dist/server/`); `actions/upload-artifact@v4`
of `playwright-report/` with `if: failure()`, 14-day retention; on failure also
`docker logs --tail 200` of the auth container (`supabase_auth_<project_id>`)
and the db container. Polish comments in the same voice as the `db-tests` block
explaining why `db start` is not enough.

**Contract**: `deploy.needs: [ci, db-tests, e2e]`.

### Success Criteria:

#### Automated Verification:

- The workflow run for the PR shows `e2e` green: `gh run view --job e2e` (or `gh run watch`)
- `deploy` on the merge commit waited on `e2e`: `gh run view <id> --json jobs`

#### Manual Verification:

- Job wall-clock recorded in §6.5 (target under 8 min; if over, note it — the fallback in test-plan §5 is a push-to-main job plus local gate).
- Force a failure on a throwaway branch (e.g. wrong expected text) → `e2e` red, artifact `playwright-report` downloadable and shows the failing step.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Cookbook and docs sync

### Overview

Make the quality contract and agent docs match what now exists, so the next
person (or agent) adding a browser test or an endpoint test has a recipe.

### Changes Required:

#### 1. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Record the rollout state and the patterns Phase 2 established.

**Contract**:
- §3 row 2 Status → `complete`.
- §4 e2e row → `Playwright <version>` and "local stack via `supabase start`
  (auth stack) + `astro preview`; CI job `e2e`".
- §5 e2e row → `required (since §3 Phase 2; blocks deploy)`.
- §6.3 "Adding an e2e test": location `e2e/`, naming `<scenario>.spec.ts`,
  reference `rider-loop.spec.ts` and `booking-refusal.spec.ts`, run locally
  (`npx supabase db reset` → `npm run test:e2e`; `.dev.vars` must point at the
  local stack), run in CI (job `e2e`), pattern (fresh rider per run via signup
  in `auth.setup.ts`, storage states, role/label/text selectors scoped to the
  hour `listitem`, `waitForURL` on `?sukces=1` / `?error=`, oracle = badge /
  "Moje zapisy" / stable day list, never the banner or the 302; every scenario
  cancels what it booked; sabotage check), seed slots reserved by tests
  (Kasztan@13, Bella@14) and by `test:db` (Kasztan@12).
- §6.4 "Adding a test for a new API endpoint": redirect is not persistence →
  read-back in the query (`.select('id')`), assert post-state through a page or
  DB read; a read-back after INSERT depends on the caller's own-row SELECT
  policy — re-run e2e after any RLS change on that table; error translation → read the code with `@/lib/db-errors`
  (`errorCode`/`errorMessage`, tested once in `db-errors.test.ts`) and map it
  through the area's table, pinned as a closed Polish set in
  `src/lib/<area>/errors.test.ts`; missing fields are validation errors
  (`formInt`); refusal paths belong to e2e only when a browser reaches them,
  otherwise unit + Phase 1 SQL.
- §6.5 Phase 2 note (2–3 lines): what surprised (e.g. `.dev.vars` overrides
  `webServer.env`, preview on workerd, job timing).
- Header "Last updated" date.

#### 2. Agent guide

**File**: `AGENTS.md`

**Intent**: Hard rules mention the third test layer and its prerequisites.

**Contract**: one bullet under "Hard rules": `npm run test:e2e` (Playwright,
`e2e/`), needs the local stack with auth (`npx supabase start`), a fresh seed
and `.dev.vars` on the local stack; CI job `e2e`; `deploy` waits on it. Update
the CI sentence in the first hard rule.

#### 3. README

**File**: `README.md`

**Intent**: Scripts list and CI paragraph reflect e2e.

**Contract**: add `npm run test:e2e` to the scripts list; update the CI
sentence to name `e2e`. Remove the stale "No database tables or migrations are
required" line while there (research flagged it).

### Success Criteria:

#### Automated Verification:

- Prettier/lint on docs: `npm run lint` and `npx prettier --check context/foundation/test-plan.md AGENTS.md README.md`
- `/10x-test-plan --status` reports Phase 2 `complete` and Phase 3 as next

#### Manual Verification:

- A reader following §6.3 alone can run the suite locally without asking.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before archiving.

---

## Testing Strategy

### Unit Tests:

- Slot rule: half-open boundary as explicit negatives, degenerate ranges,
  seed full-set example, phantom/duplicate taken entries, `assignedHorses`
  (unassigned dropped, retired kept, order kept).
- Errors: `errorCode`/`errorMessage` shape tables (`db-errors.test.ts`); closed Polish set; fallback for `42501`/`""`.
- Schema: missing/blank/whitespace numeric fields → per-field message.

### Integration Tests:

- e2e `rider-loop.spec.ts` — catalogue, slot list vs PRD, booking, stable day
  list, Moje zapisy, cancel, slot freed.
- e2e `booking-refusal.spec.ts` — stale page 23505 refusal, no row.
- Unchanged: Phase 1 SQL scripts remain the proof for concurrency, schedule
  guardrails and RLS.

### Manual Testing Steps:

1. `npx supabase start` → `npx supabase db reset` → `npm run test:e2e` green.
2. Apply each sabotage listed per phase; observe red; revert.
3. Run `npm run test:e2e` twice without a reset → green both times.
4. Open the HTML report for a forced failure and confirm the trace shows Polish pages.

## Performance Considerations

Suite runtime is seconds; the cost is stack startup. CI: ~4–6 min in parallel
with `db-tests` (2.5 min), so deploy waits ~2–3 min longer. `workers: 1` is
deliberate — two scenarios, shared seed slots. Locally `reuseExistingServer`
lets a running preview be reused.

## Migration Notes

None for data. `createBooking`'s return type changes from `void` to
`{ id: number }`; the only caller is `create.ts`.

## References

- Related research: `context/changes/testing-rider-loop-in-the-browser/research.md`
- Quality contract: `context/foundation/test-plan.md` §2 (#3, #5, #6), §5, §6
- Phase 1 rollout: `context/archive/2026-09-08-testing-database-guarantees-in-ci/plan.md`
- Read-back pattern: `src/lib/bookings/queries.ts:179-194` (cancel), `src/pages/api/horses/toggle-active.ts:47-57`
- Slot rule: `src/lib/bookings/slots.ts:56-84`, `src/pages/jezdziec/osrodki/[id].astro:49-63`
- Sign-up form: `src/components/auth/SignUpForm.tsx`, `src/components/auth/RoleSelect.tsx`
- Playwright docs (fetched 2026-09-09): test-webserver, auth, ci-intro; Astro testing guide

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Unit layer against the PRD oracle

#### Automated

- [x] 1.1 Unit tests pass with the new cases: `npm test` — e8765f6
- [x] 1.2 Type-aware lint passes (no duplicated `errorCode`, no unused imports): `npm run lint` — e8765f6
- [x] 1.3 Production build passes: `npm run build` — e8765f6

#### Manual

- [x] 1.4 Sabotage: change `hour < input.closeHour` to `<=` in `slots.ts` → boundary test red; revert. — e8765f6
- [x] 1.5 Sabotage: make `errorCode` return `String(error)` → `errorCode({})` test red; revert. — e8765f6
- [x] 1.6 Sabotage: revert the schema helper to `z.coerce.number()` → missing-`hour` test red; revert. — e8765f6
- [x] 1.7 With the local stack running, submit the booking form with `hour` removed via devtools → "Nieprawidłowa godzina" shown. — e8765f6

### Phase 2: Playwright harness + rider loop scenario

#### Automated

- [x] 2.1 `npx playwright test e2e/rider-loop.spec.ts` green locally against a fresh seed — 6c1fe47
- [x] 2.2 `npm run lint` passes including `e2e/**` — 6c1fe47
- [x] 2.3 `npm test` and `npm run build` still pass — 6c1fe47

#### Manual

- [x] 2.4 Sabotage: `createBooking` swallows the error and returns `{ id: 0 }` → scenario red at the badge; revert. — 6c1fe47
- [x] 2.5 Sabotage: rename the success param in `backToStable` → scenario red at `waitForURL`; revert. — 6c1fe47
- [x] 2.6 Sabotage: hide the "Odwołaj" form → scenario red at cancel; revert. — 6c1fe47
- [x] 2.7 Run the suite twice without a reset → second run green. — 6c1fe47
- [x] 2.8 Trace viewer for a forced failure shows the Polish pages. — 6c1fe47

### Phase 3: Refusal scenario — stale page, two contexts

#### Automated

- [x] 3.1 `npx playwright test` (both scenarios) green locally against a fresh seed — 905c5bb
- [x] 3.2 `npm run lint` passes — 905c5bb

#### Manual

- [x] 3.3 Sabotage: map `23505` to the fallback in `errors.ts` → scenario red at the message; revert. — 905c5bb
- [x] 3.4 Sabotage: cancel B before A clicks → A succeeds (scenario depends on the active booking); restore order. — 905c5bb
- [x] 3.5 Run the suite twice without reset → green both times (B's cleanup worked). — 905c5bb

### Phase 4: CI gate

#### Automated

- [x] 4.1 Workflow run for the PR shows `e2e` green (`gh run view`) — 072b9c8
- [x] 4.2 `deploy` on the merge commit waited on `e2e` (`gh run view <id> --json jobs`) — aec2b84

#### Manual

- [x] 4.3 Job wall-clock recorded in §6.5 (target under 8 min; note fallback if over). — 83f4c06
- [x] 4.4 Forced failure on a throwaway branch → `e2e` red, `playwright-report` artifact shows the failing step. — 072b9c8

### Phase 5: Cookbook and docs sync

#### Automated

- [x] 5.1 `npm run lint` and `npx prettier --check context/foundation/test-plan.md AGENTS.md README.md` — 83f4c06
- [x] 5.2 `/10x-test-plan --status` reports Phase 2 `complete` and Phase 3 as next — 83f4c06

#### Manual

- [x] 5.3 A reader following §6.3 alone can run the suite locally without asking. — 83f4c06
