---
date: 2026-09-08T20:45:00+02:00
researcher: Claude Code (Fable 5.1)
git_commit: 91301172318059ffbe958960007e10f70288bbc5
branch: main
repository: lukasz-tolpa/stable_booksy_10xdevs
topic: "Database guarantees in CI — where the no-double-booking, schedule-guard and ownership guarantees live, how they surface, and how to run them automatically (test-plan rollout Phase 1, risks #1, #2, #4)"
tags: [research, codebase, testing, supabase, rls, bookings, schedule, ci, integration-tests]
status: complete
last_updated: 2026-09-08
last_updated_by: Claude Code (Fable 5.1)
---

# Research: Database guarantees in CI (rollout Phase 1 — risks #1, #2, #4)

**Date**: 2026-09-08T20:45:00+02:00
**Researcher**: Claude Code (Fable 5.1)
**Git Commit**: 91301172318059ffbe958960007e10f70288bbc5 (local `main`, 1 commit ahead of `origin/main` at time of writing — GitHub permalinks resolve after push: `https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/9130117/<path>#L<line>`)
**Branch**: main
**Repository**: lukasz-tolpa/stable_booksy_10xdevs

## Research Question

From `change.md`: open rollout Phase 1 of `context/foundation/test-plan.md` ("Database guarantees in CI"). Ground, per the test plan's *Context `/10x-research` must ground* column:

- **#1 double booking** — where the guarantee lives (constraint vs. app code), how a rejected write surfaces to the endpoint, what "active" means for a cancelled booking, seed data for the scenario.
- **#2 schedule edit invalidating bookings** — where the guard lives, which codes/messages it produces, whether cancelled bookings count as collisions, seed data with a booking on the edited day.
- **#4 cross-tenant / cross-role access** — which layer enforces ownership (RLS vs. endpoint vs. middleware), which identifiers each mutating endpoint accepts from the client, how role is resolved per request.
- **CI** — how the three hand-run scripts under `supabase/tests/` can run automatically on every push, and what harness shape fits.

**Oracle** (per test plan §1): PRD `Business Logic`, `Guardrails`, `Non-Functional Requirements`, `Access Control`, and resolved Open Question #2. Never the current implementation.

## Summary

1. **All three guarantees live in Postgres, not in application code.** The app runs exclusively on the anon key with the user's cookie session (no service-role client exists anywhere in `src/`), so every write is RLS-scoped, and every refusal reaches the endpoint as a SQLSTATE that `src/lib/*/errors.ts` translates to Polish.
   - #1: partial unique index `bookings_active_slot_key` on `(schedule_day_id, horse_id, hour) where status = 'active'` → `23505`.
   - #2: BEFORE UPDATE trigger `schedule_days_protect_bookings` (custom SQLSTATEs `SB001` date change, `SB002` hour narrowing, counts only `status = 'active'`) + FK `bookings_scheduled_horse_fkey ... on delete restrict` (`23503`) for horse removal.
   - #4: RLS policies keyed on `auth.uid()` and two `security definer` helpers `private.current_role()` / `private.current_stable_id()` that read `profiles` / `stables`; role is **never** taken from the JWT.
2. **"Active" is exactly `status = 'active'`**; `status` is text constrained to `active | cancelled`, with a CHECK coupling `cancelled_at` to it. Cancellation is an UPDATE that drops the row out of the partial index and frees the slot; there is no DELETE policy on `bookings`.
3. **Three hand-run scripts already exist and are nearly CI-ready in form**: `concurrent_double_booking.sh` (5 parallel `psql` processes, exit code), `rls_isolation.sql` and `schedule_change_guardrails.sql` (psql with `ON_ERROR_STOP`, `set local role authenticated` + `request.jwt.claims` impersonation, rollback). CI today runs lint + Vitest + build with **no database** (`.github/workflows/ci.yml`). `ubuntu-latest` ships `psql` 16 and Docker; `supabase db start` alone brings up Postgres with migrations + `seed.sql`.
4. **Two real gaps surfaced that the plan must decide on, not mirror**:
   - **#2 asymmetry**: the trigger and the app pre-check ignore cancelled bookings, but the FK RESTRICT cannot — a horse whose only booking that day is *cancelled* cannot be unassigned (`23503`), and because the save is three non-transactional PostgREST writes, the hours change persists before the refusal, so the stable sees a misleading "koń ma zapisy" after a partial write. PRD says only *active* bookings block.
   - **#4 silent success**: `POST /api/horses/toggle-active` with another stable's `horseId` updates 0 rows (RLS + explicit filter) and redirects to the list **without an error** — data is untouched (guardrail holds) but the refusal is invisible. The cancel endpoint shows the correct pattern (`.select("id").maybeSingle()` → "not found").
5. **RLS permits a stable account to UPDATE (cancel) any booking in its own stable**; the PRD reserves cancellation for the rider (FR-009). Only the cancel endpoint's explicit `rider_id` filter refuses it. A pure SQL test would show `row_count = 1` here.
6. Seed is CI-deterministic: fixed auth UUIDs (`1111…` stable A, `2222…` stable B, `3333…` rider Anna, `4444…` rider Piotr), schedule days at `current_date + 1`, one active booking per stable (Anna → Bella @ 11 at Pod Debem; Piotr → Grom @ 10 at Nad Rzeka). Identity ids of stables/horses/days/bookings are **not** fixed — resolve by name.

## Detailed Findings

### Risk #1 — Double booking of one horse-hour

**Schema** (`supabase/migrations/20260810090100_schedule_and_bookings.sql`)

- `bookings` (`:94-111`): `id`, `schedule_day_id`, `horse_id`, `hour smallint` (CHECK 0..23, `:103`), `rider_id uuid → profiles on delete cascade` (`:99`), `status text default 'active'` CHECK `in ('active','cancelled')` (`:104`), `cancelled_at`, CHECK `(status = 'cancelled') = (cancelled_at is not null)` (`:105-106`), composite FK `(schedule_day_id, horse_id) → schedule_day_horses on delete restrict` (`:107-110`).
- **The guarantee** (`:122-124`):
  ```sql
  create unique index bookings_active_slot_key
    on public.bookings (schedule_day_id, horse_id, hour)
    where status = 'active';
  ```
  Comment `:118-121` states this is the sole object the concurrency NFR depends on.
- `schedule_days` (`:36-49`): `unique (stable_id, day)`, half-open `[open_hour, close_hour)` (10–16 → slots 10..15, `:53-54`).
- `schedule_day_horses` (`:68-80`): PK `(schedule_day_id, horse_id)` with denormalised `stable_id` and composite FKs forcing day and horse to share a stable.

**What fires on INSERT into `bookings`** (Postgres order: BEFORE trigger → CHECKs → unique index → FKs):

1. Trigger `bookings_within_working_hours` (`:169-171`) → `enforce_booking_within_working_hours()` (`:135-164`, `security definer`): missing day → `23503` (raised by the trigger, not the FK); `hour < open or hour >= close` → `23514` with Polish message.
2. CHECK constraints → `23514`.
3. Partial unique index → `23505`, `constraint_name = bookings_active_slot_key`.
4. FK to `schedule_day_horses` → `23503` (horse not assigned that day).
5. RLS `bookings_insert_own_as_rider` (`:277-284`): `rider_id = auth.uid() and private.current_role() = 'rider'` → `42501` on violation.

**Read side**: `public.get_taken_slots(p_stable_id, p_day)` (`supabase/migrations/20260819090000_booking_slot_occupancy.sql:13-26`), `security definer`, returns only `(horse_id, hour)` of active bookings; `revoke from public, anon; grant to authenticated` (`:31-32`). Wrapper `getTakenSlots` in `src/lib/bookings/queries.ts:12-20`. Useful as the "what the rider sees as taken" assertion.

**Endpoint path** (`src/pages/api/bookings/create.ts`)

- Client sends `stableId`, `day`, `horseId`, `hour` (`:53-58`; zod `bookingSchema` at `src/lib/bookings/schema.ts:10-15`). `rider_id` comes from `supabase.auth.getUser()` (`:82-88, :99`), never from the form.
- `schedule_day_id` resolved server-side via `getScheduleDay(stableId, day)` (`:94`; `src/lib/schedule/queries.ts:37-50`).
- Pre-DB guards (`:66-75, :96`): past day, past hour today (Warsaw time), no schedule day.
- Single plain INSERT in `createBooking` (`src/lib/bookings/queries.ts:209-220`), PostgrestError rethrown; `errorCode()` (`create.ts:42-46`) reads `.code`.
- Mapping `bookingErrorMessage` (`src/lib/bookings/errors.ts:11-31`):

  | SQLSTATE | Message |
  |---|---|
  | `23505` | "Ten slot został właśnie zajęty. Wybierz inny termin lub konia." |
  | `23514` | "Wybrana godzina jest poza zakresem pracy ośrodka w tym dniu." |
  | `23503` | "Grafik ośrodka zmienił się w międzyczasie — wybrany koń nie pracuje tego dnia. Odśwież stronę i wybierz inny slot." |
  | other | "Nie udało się zapisać na jazdę. Spróbuj ponownie." |

- Response is **always a 302** via `backToStable` (`create.ts:14-39`): `?error=<msg>` on failure, `?sukces=1` on success. No JSON, no 4xx.

**Existing proof** — `supabase/tests/concurrent_double_booking.sh`

- Prefers host `psql "$DB_URL"` (default `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, `:16, :21-22`); falls back to `docker exec supabase_db_<project_id>` (`:24-30`, `project_id = "10x-astro-starter"` at `supabase/config.toml:5`).
- Target: earliest `schedule_days` row of "Stadnina Pod Debem", horse "Kasztan", rider "Anna Kowalska", `HOUR=12` (`:35-38`). Same rider for all attempts.
- Concurrency: `ATTEMPTS` (default 5) background `psql -c "select pg_sleep(0.5); insert …"` processes, one connection each (`:53-61`).
- Runs as `postgres` — **RLS bypassed**, no `set role authenticated`.
- Pass/fail (`:63-99`): exactly 1 success, exactly 1 active row on the slot, every refusal mentions `bookings_active_slot_key`; prints `PASS`/`FAIL`, `exit "$status"`.
- Cleanup: hard DELETE on the slot before and after (`:48, :94`) — not transactional.

**Already unit-tested** (`src/lib/bookings/errors.test.ts`): message mapping for the three codes and fallback. The integration test should assert **SQLSTATE `23505` + constraint name**, not message text.

### Risk #2 — Schedule edit invalidating existing bookings

**Guard** — `supabase/migrations/20260811090000_protect_bookings_on_schedule_change.sql`

- `enforce_schedule_change_keeps_bookings()` (`:23-68`, `security definer`, `search_path = ''`):
  - `new.day is distinct from old.day` with any `status = 'active'` booking on the day → `raise ... using errcode = 'SB001'` (`:36-47`).
  - `open_hour`/`close_hour` changed and any active booking with `hour < new.open_hour or hour >= new.close_hour` → `SB002`, message embeds the count (`:52-64`).
  - Only `status = 'active'` counted (`:41, :57`).
- Trigger `schedule_days_protect_bookings` — `before update of open_hour, close_hour, day` (`:80-82`). No INSERT/DELETE trigger; **no trigger on `schedule_day_horses`**.
- Horse removal is guarded only by FK `bookings_scheduled_horse_fkey ... on delete restrict` (`20260810090100:107-110`) → `23503`, default English message. Whole-day delete is covered transitively (cascade → `schedule_day_horses` → RESTRICT).
- `horses.active` (`20260810090000_identity_and_stables.sql:75`) has **no** effect on assignments or bookings; `src/lib/bookings/slots.ts:39` says so explicitly. A retired horse already assigned stays bookable. Not a PRD violation (nothing vanishes) but worth a note.

**Save path** — `saveScheduleDay` (`src/lib/schedule/queries.ts:122-176`), **five PostgREST calls, no transaction, no RPC**:

1. `assertHorsesBelongToStable` (`:78-92`) → `ScheduleSaveError("APP001")`.
2. `getScheduleDay` (`:130`); if it exists, `assertRemovedHorsesHaveNoBookings` (`:95-112`) reads `bookings` filtered `status = 'active'` → `APP002`.
3. `upsert schedule_days` on `(stable_id, day)` (`:137-144`) — where `SB002` surfaces.
4. `delete schedule_day_horses ... horse_id not in (kept)` (`:152-158`) — where `23503` surfaces.
5. `upsert schedule_day_horses` with `ignoreDuplicates` (`:164-171`).

Mapping `scheduleErrorMessage` (`src/lib/schedule/errors.ts:76-95`): `SB002` → "Nie można zawęzić godzin pracy — poza nowym zakresem znalazłoby się N zapis/y/ów…"; `SB001` → "Nie można zmienić daty dnia, który ma N zapisów."; `APP001` → "Wybrany koń nie należy do Twojej stadniny."; `APP002` and `23503` → "Nie można wypisać konia, który ma zapisy w tym dniu…"; other → fallback. Endpoint `src/pages/api/schedule/save.ts:79-84` → 302 to `/osrodek/grafik?dzien=<day>&error=<msg>`.

**Partial-failure states possible today**

- (a) **Hours persist, horse removal refused**: pre-check (`:100`) filters active; FK RESTRICT counts cancelled too. Removing a horse whose only booking is cancelled passes step 2, step 3 writes the new hours, step 4 fails with `23503`. Same shape for a booking created between steps 2 and 4.
- (b) Steps 3–4 succeed, step 5 fails (rare: concurrent horse delete, RLS).
- (c) `SB001` is unreachable from the app (upsert keyed on `(stable_id, day)` creates a new row for a new date); it protects only SQL/dashboard paths.
- Archive review `context/archive/2026-08-11-daily-schedule-management/reviews/impl-review.md:32-49` (F1) found this class live, chose pre-checks (Fix A) over a transactional RPC (Fix B): "DB guard remains the last line".

**Existing proof** — `supabase/tests/schedule_change_guardrails.sql`

- Runs as `postgres` (no role switch, RLS bypassed), `\set ON_ERROR_STOP on`, one `begin … rollback`, single `DO` block with `v_failures` counter and final `raise exception` (`:106-108`).
- Picks the first active booking with `limit 1` and **no ORDER BY** (`:30-34`, non-deterministic between the two seeded bookings).
- Cases: narrow `close_hour` to booking hour → `SB002`; widen 8–20 passes; `day + 7` → `SB001`; empty day date change passes; delete assignment → FK violation; delete day → FK violation via cascade.
- **Not covered**: cancelled booking not blocking narrowing; re-read of `bookings` after refusal (relies on statement rollback); the cancelled-vs-RESTRICT asymmetry; anything through PostgREST/app.

**Already unit-tested** (`src/lib/schedule/errors.test.ts`): pluralisation, count extraction, `SB001`/`SB002`/`23503`/fallback messages. Not tested: `APP001`, `APP002`, `ScheduleSaveError`, anything in `queries.ts`.

### Risk #4 — Cross-tenant and cross-role access

**Role resolution**

- One client factory: `createServerClient(SUPABASE_URL, SUPABASE_KEY, {cookies})` (`src/lib/supabase.ts:6-27`) — anon key + session cookie. `grep -ri service_role src/` → nothing.
- `src/middleware.ts:21-31`: `auth.getUser()` then `profiles` lookup into `locals.profile`. Role = `profiles.role`, deliberately not `user_metadata` (archive `2026-08-10-role-aware-auth/plan.md:377`; `src/pages/api/auth/signin.ts:34-36`).
- Guarded prefixes only `/osrodek`, `/jezdziec`, `/dashboard` (`src/lib/auth/roles.ts:39-43`). Wrong role → 302 to own home (`middleware.ts:59-61`), never 403.
- **`/api/**` is not guarded by middleware** (`routeGuardFor` returns null → `next()`). Each handler calls `auth.getUser()` itself; **none of the six mutating handlers reads `locals.profile` or checks role**.

**RLS inventory** (all policies `to authenticated`; `anon` has none → deny)

- Helpers in schema `private` (not exposed via PostgREST, `supabase/config.toml:13`): `current_role()` (`20260810090000:94-104`), `current_stable_id()` (`:109-119`), `is_rider_of_my_stable(uuid)` (`20260810090100:177-197`); all `security definer`, revoked from `public, anon`.
- `profiles`: SELECT own or my rider (`20260810090100:320-327`); UPDATE own (`20260810090000:203-208`); INSERT/DELETE none. Trigger `enforce_profile_role_immutable` (`:172-185`) → `42501` on self-promotion.
- `stables`: SELECT `true`; INSERT `owner_id = auth.uid() and current_role() = 'stable'` (`:223-230`); UPDATE/DELETE `owner_id = auth.uid()`.
- `horses`, `schedule_days`, `schedule_day_horses`: SELECT `true`; INSERT/UPDATE/DELETE `stable_id = current_stable_id()`. For a rider the helper returns NULL → never true. **No explicit role check** — the "role gate" is the accidental NULL.
- `bookings`: SELECT own or my stable (`:263-275`); INSERT `rider_id = auth.uid() and current_role() = 'rider'` (`:277-284`); UPDATE `bookings_update_own_or_my_stable` using AND with check `own OR my stable` (`:287-308`); DELETE none (`:310`).

**Permissive relative to PRD**: `bookings_update_own_or_my_stable` lets a stable account cancel or edit (`rider_id`, `hour`) any booking in its stable, while PRD `:135` reserves cancellation for the rider. Only app code refuses it today.

**Mutating endpoints** (all POST form → 302; result in `Location` query)

| Endpoint | Client-controlled ids | Ownership in app | Silent-filter behaviour |
|---|---|---|---|
| `bookings/create.ts` | `stableId`, `day`, `horseId`, `hour` | `rider_id` from session; day resolved server-side | INSERT errors surfaced |
| `bookings/cancel.ts` | `bookingId` (`:29`) | `getRiderBookingForCancel(.., user.id)` (`queries.ts:147-152`) + `cancelBooking` filters `id, rider_id, status='active'` with `.select("id").maybeSingle()` (`:180-193`) | **Reports failure**: `!cancelled` → "Nie znaleziono zapisu do odwołania." (`cancel.ts:53-55, 66-69`) |
| `horses/create.ts` | `name`, `notes` only | `stable_id = getOwnedStableId(user.id)` (`:43`); rider → "Twoje konto nie ma jeszcze stadniny" (`:44-46`) | error surfaced |
| `horses/toggle-active.ts` | `horseId`, `active` | `.eq("stable_id", stableId)` (`:46-50`) | **Silent success on 0 rows** — no `.select()`, no row count; redirect without error (`:52-56`) |
| `schedule/save.ts` | `day`, `openHour`, `closeHour`, `horseIds[]` — no stable/day id | `assertHorsesBelongToStable` → `APP001`; upsert keyed on own stable | upsert uses `.select().single()` → would error |
| `stables/create.ts` | `name`, `city` | `owner_id: user.id`; role gate is RLS only (`:39-41`) | rider → `42501` → "Nie udało się zapisać stadniny" (`:55`) |

**Existing proof** — `supabase/tests/rls_isolation.sql`

- Impersonation per persona: `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';` (`:17-19, :62-64, :116-118, :141-143`), one `set local role anon` block (`:214-215`). Each block `rollback`s. `ON_ERROR_STOP` → non-zero exit on any `raise exception 'FAIL…'`.
- Covers: stable A sees 1 booking, foreign horse UPDATE `row_count = 0` via `get diagnostics` (`:31-36`, a real "no rows changed" assertion), foreign `schedule_days` INSERT → `42501`, profile visibility; rider Anna sees own booking, foreign-rider UPDATE `row_count = 0` (`:76-83`), foreign `rider_id` INSERT → `42501`, own INSERT `row_count = 1`; stable B own edit `row_count = 1`; `get_taken_slots` pairs-only, cancel removes occupancy, anon cannot execute.
- **Not covered**: UPDATE/DELETE of foreign `schedule_days` / `schedule_day_horses`; rider writes to stable tables (`horses`, `schedule_days`); stable attempting a booking INSERT (role gate `42501`); stable cancelling a booking in its own stable (RLS permits — would document app-only refusal); cancel by foreign `id` (only by `rider_id`); anything over HTTP.

**Already unit-tested** (`src/lib/auth/roles.test.ts`): routing tables only.

### CI and harness

**Today** — `.github/workflows/ci.yml`: job `ci` on `ubuntu-latest` runs `npm ci`, `npx astro sync`, `npm run lint`, `npm test`, `npm run build` (`:18-22`; `SUPABASE_URL`/`SUPABASE_KEY` secrets only for build, `:23-25`); job `deploy` on push to main via `cloudflare/wrangler-action@v3` (`:27-43`). Runs take ~2.5 min. **No database.** Note `AGENTS.md:7` says "lint + build only" — stale, `npm test` already runs.

**Vitest** — `vitest.config.ts:13-16`: `include: ["src/**/*.test.ts"]`, node env; header comment (`:4-6`) says it is deliberately service-free. `tsconfig.json:3` includes `**/*` so a `supabase/tests/**/*.test.ts` would type-check; alias `@` in both configs. No `pg`/`postgres` npm client installed; `@supabase/supabase-js` and `@supabase/ssr` are.

**Local stack** — `supabase/config.toml`: `project_id = "10x-astro-starter"` (`:5`), API `54321` (`:10`), DB `54322`, Postgres 17 (`:29-36`); `[db.migrations] enabled` (`:53-55`); `[db.seed] enabled, sql_paths = ["./seed.sql"]` (`:60-65`); `[auth.email] enable_confirmations = false` (`:209`) so seeded password sign-in works without a mailbox; all other services enabled (dead weight on a runner; docs say ~7 GB RAM for the full stack).

**Verified against official docs**

- `supabase/setup-cli@v3` reads the CLI version from `package-lock.json` when `version` is omitted (repo has `supabase` 2.98.2 installed) — https://github.com/supabase/setup-cli. Linux runners need no extra Docker setup.
- `supabase db start` starts **Postgres only** and on a fresh volume runs migrations + seed (`MigrateAndSeed`) — https://supabase.com/docs/reference/cli/supabase-db-start and https://github.com/supabase/cli/blob/develop/apps/cli/src/commands/db/start/SIDE_EFFECTS.md. No GoTrue → no supabase-js sign-in under `db start`; SQL impersonation still works.
- `supabase start -x <list>` can exclude `realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor` while keeping `kong,gotrue,postgrest` for real auth — https://supabase.com/docs/reference/cli/supabase-start.
- `supabase status -o env` emits `ANON_KEY`, `SERVICE_ROLE_KEY`, `API_URL`, `DB_URL`; `--override-name` renames — https://supabase.com/docs/reference/cli/supabase-status.
- `supabase test db` runs `pg_prove` in a container over **every** `*.sql`/`*.pg` under `supabase/tests/`, each file in its own transaction — https://supabase.com/docs/reference/cli/supabase-test-db. Gotcha: the two existing non-TAP `.sql` files would be picked up and fail; pgTAP cannot express multi-connection concurrency.
- `ubuntu-latest` (24.04) ships PostgreSQL 16 client (`psql`), server stopped, Docker 28 — https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md. The `.sh` script's host-psql branch is taken; the `docker exec` fallback is never needed.

**Harness options** (trade-offs, not a decision)

| | A. Keep bash + psql, run via `db start` | B. pgTAP via `supabase test db` | C. Vitest integration project (`pg`/`postgres` client) |
|---|---|---|---|
| Install | `setup-cli` (or `npx supabase`), nothing else | same + rewrite two `.sql` into TAP; move/convert non-TAP files | same + `postgres`/`pg` devDep + `vitest.integration.config.ts` + `test:integration` script |
| Parallel connections (#1) | N background `psql` processes (exists) | **not expressible** — keep the `.sh` anyway | pool of N clients + `Promise.allSettled`; structured `err.code`/`constraint_name` |
| RLS impersonation | `set local role authenticated` + `request.jwt.claims` (exists) | same inside TAP file | same in SQL, or real `signInWithPassword` if `kong+gotrue+postgrest` kept |
| Pass/fail | exit codes; Polish NOTICE lines | TAP per-assertion | Vitest reporter, one `it` per regression, typed |
| CI cost | Postgres image pull (~1–2 min cold, unverified) + seconds | A + `pg_prove` image | ≈ A with `db start`; +1–2 min with auth stack |
| Fit with test plan §6.2/§6.4 | bash pattern, unfamiliar to Vitest contributors | nicest SQL readability | the shape later API-endpoint tests reuse |

**Seed** (`supabase/seed.sql`): auth users with fixed UUIDs and password `sekret123` (`:9, :18-58`); stables "Stadnina Pod Debem" (owner `1111…`, Kraków) and "Stajnia Nad Rzeka" (owner `2222…`) (`:90-101`); horses Bella, Kasztan, Iskra / Grom, Luna (`:103-113`); schedule days at **`current_date + 1`** — Pod Debem 10–16, Nad Rzeka 9–14 (`:119-127`); assignments Bella + Kasztan / Grom (`:131-135`); bookings Anna → Bella @ 11, Piotr → Grom @ 10, both active (`:143-152`). **No cancelled booking in seed.** Kasztan @ 12 at Pod Debem is a guaranteed-free in-range slot. Stable/horse/day/booking ids are identity columns — look up by name.

## Code References

- `supabase/migrations/20260810090100_schedule_and_bookings.sql:122-124` — partial unique index `bookings_active_slot_key` (risk #1 guarantee)
- `supabase/migrations/20260810090100_schedule_and_bookings.sql:94-111` — `bookings` table, `status`/`cancelled_at` CHECKs, FK RESTRICT to `schedule_day_horses`
- `supabase/migrations/20260810090100_schedule_and_bookings.sql:135-171` — `enforce_booking_within_working_hours` trigger (`23514`, `23503`)
- `supabase/migrations/20260810090100_schedule_and_bookings.sql:204-310` — RLS policies for `schedule_days`, `schedule_day_horses`, `bookings`
- `supabase/migrations/20260810090000_identity_and_stables.sql:94-119` — `private.current_role()`, `private.current_stable_id()`
- `supabase/migrations/20260810090000_identity_and_stables.sql:217-273` — RLS policies for `stables`, `horses`
- `supabase/migrations/20260811090000_protect_bookings_on_schedule_change.sql:23-82` — schedule guard trigger (`SB001`, `SB002`)
- `supabase/migrations/20260819090000_booking_slot_occupancy.sql:13-32` — `get_taken_slots` RPC
- `supabase/tests/concurrent_double_booking.sh:16-30, 53-61, 76-99` — connection strategy, parallel inserts, pass/fail
- `supabase/tests/rls_isolation.sql:17-19, 31-36, 76-83` — impersonation pattern, `row_count = 0` assertions
- `supabase/tests/schedule_change_guardrails.sql:30-34, 47-108` — seed pick (no ORDER BY), six cases
- `supabase/seed.sql:18-58, 119-152` — fixed UUIDs, relative dates, bookings
- `supabase/config.toml:5, 29, 53-65, 209` — project_id, DB port, migrations/seed, confirmations off
- `src/lib/supabase.ts:6-27` — the only client (anon key + cookies)
- `src/middleware.ts:21-31, 36-82` — role from `profiles`, page-only guards
- `src/lib/auth/roles.ts:39-43` — guarded prefixes (no `/api`)
- `src/pages/api/bookings/create.ts:42-46, 53-58, 82-99` — error code extraction, form fields, rider from session
- `src/lib/bookings/errors.ts:11-31` — SQLSTATE → Polish message
- `src/lib/bookings/queries.ts:147-152, 180-193, 209-220` — cancel ownership filter + `maybeSingle`, create insert
- `src/pages/api/bookings/cancel.ts:53-55, 66-69` — "not found" on 0 rows (reference pattern)
- `src/pages/api/horses/toggle-active.ts:46-56` — 0-row UPDATE reported as success
- `src/lib/schedule/queries.ts:78-112, 122-176` — pre-checks and 5-call non-transactional save
- `src/lib/schedule/errors.ts:76-95` — `SB001`/`SB002`/`APP001`/`APP002`/`23503` mapping
- `src/pages/api/schedule/save.ts:79-84` — refusal redirect
- `.github/workflows/ci.yml:10-25` — current CI job (no DB)
- `vitest.config.ts:4-6, 13-16` — service-free default include

## Architecture Insights

- **Database is the source of truth for every guarantee; app code only translates.** This is a deliberate, recorded decision (archive F-01 `:58`, S-02 `:52`). Tests that mock the database or assert via the UI cannot prove any of the three risks.
- **Refusals are SQLSTATEs, and the contract between DB and app is the code, not the message.** `errors.ts` files are already unit-tested; integration tests should assert codes and constraint names, plus post-state.
- **Every endpoint answers 302 with the outcome in the query string.** An HTTP-level assertion for #4 is "Location contains `error=`" plus a superuser read-back of the target row. A redirect without `error=` is the app's only success signal — which is why the toggle-active gap matters.
- **RLS impersonation without GoTrue** is the established convention (`set local role authenticated` + `request.jwt.claims`), matching Supabase's own testing docs. It runs under `supabase db start` alone.
- **Two scripts run as `postgres`** (`.sh`, `schedule_change_guardrails.sql`) and therefore prove that the guard *exists*, not that it is reachable through RLS by the owner. For #2 in particular, a wrong `sub` yields "0 rows updated" — indistinguishable from a refusal unless the test runs as the owning stable.
- **The save sequence is intentionally non-transactional**; the plan should either accept "DB guard is the last line" (archive decision) and test each statement's guard in isolation, or reopen the RPC question.
- **Seed determinism is CI-safe** (fresh volume every run, relative dates, fixed UUIDs), but tests must resolve identity ids by name and should avoid `limit 1` without `ORDER BY`.

## Historical Context (from prior changes)

- `context/archive/2026-08-10-booking-data-schema/plan.md:42, 58, 113-116, 233-246, 335` — F-01 chose `on delete restrict` "so bookings cannot vanish silently", full RLS on all tables with the app on the anon key, `rls_isolation.sql` designed around select-0 / update-0 / insert-rejected; explicitly not wired into CI "because the current workflow does not start a database".
- `context/archive/2026-08-10-role-aware-auth/plan.md:33, 201, 269, 377` — stable INSERT must go through the session client (policy needs `auth.uid()` + role); role read from `profiles`, JWT `user_metadata` rejected as user-editable; wrong role → redirect.
- `context/archive/2026-08-11-daily-schedule-management/plan.md:12-14, 31-32, 37-46, 52-60, 275, 298` — four guard cases, own SQLSTATEs distinct from `23505`/`23514`, trigger `UPDATE OF` three columns, widening must pass, deletes before inserts, out of scope: stable cancelling riders' bookings, deleting horses, RLS changes; integration test "will not run in CI".
- `context/archive/2026-08-11-daily-schedule-management/reviews/impl-review.md:32-59` — F1 non-transactional save mutates on failure → pre-checks (Fix A) chosen over transactional RPC (Fix B); F2 introduced `APP001` to separate "foreign horse" from "horse has bookings".
- `context/archive/2026-08-20-booking-cancellation/plan.md:9-10, 27-28, 78` and `reviews/impl-review.md:25, 41-48` — ownership via explicit `rider_id` filter + RLS ("don't rely on broad RLS"), 0-rows detection via `.select().maybeSingle()`, identical "not found" for foreign/nonexistent/cancelled; review noted the UPDATE policy is own-OR-my-stable.
- `context/foundation/prd.md:131-135` — Open Question #2 resolved 2026-08-11: colliding schedule edit refused with message; bookings never deleted or invalidated; only the rider cancels in v1.

## Related Research

None — this is the first `research.md` in the repository.

## Open Questions

These need a decision in `/10x-plan` (or from the user) because sources do not resolve them unambiguously, and the test must not mirror current behaviour:

1. **#2 cancelled-booking asymmetry.** PRD says only *active* bookings block a schedule edit. Today a horse with only a *cancelled* booking on that day cannot be unassigned (FK RESTRICT → `23503`), and the hours change persists before that refusal. Options: (a) assert current behaviour and record the asymmetry as a known limitation; (b) treat as a bug — e.g. replace the FK RESTRICT with a trigger that counts only active bookings, or make the pre-check agree with the FK — and write the test against the PRD oracle first. A schema change is outside "write tests" scope; the plan should decide whether Phase 1 includes a fix or opens a separate change.
2. **#4 silent success on `toggle-active`.** Data is unchanged (PRD guardrail holds), but the test plan's proof criterion says the request "is refused". A redirect indistinguishable from success is not a visible refusal. Fix is small (`.select("id").maybeSingle()` like cancel) — include in Phase 1 or separate change?
3. **#4 stable cancelling a booking in its own stable.** RLS allows it; PRD reserves cancellation for the rider; only the endpoint's `rider_id` filter refuses. Should the test assert the app-level refusal (HTTP), tighten the RLS UPDATE policy, or both? No endpoint uses the stable half of that UPDATE policy today.
4. **Harness shape** (A/B/C above). Cost × signal suggests A as the zero-cost first CI wire-up and C as the shape §6.2/§6.4 cookbook wants for later endpoint tests; pgTAP (B) cannot express the concurrency proof. Plan must pick and name the cookbook pattern.
5. **Run #1 and #2 under RLS or as `postgres`?** Current scripts bypass RLS for #1 and #2. For faithfulness (and to catch "0 rows updated" masquerading as a refusal), the owning persona should perform the mutation; setup and read-back can stay superuser.
6. **HTTP layer in Phase 1 or Phase 2?** Test plan puts endpoint-level tests in Phase 2 (§6.4) but says "ownership checks follow the Phase 1 RLS pattern". Scenarios 2, 3, 5 for #4 are only provable over HTTP (middleware does not guard `/api/**`; the toggle gap is invisible in SQL). Decide whether Phase 1 adds a minimal Astro-server harness or defers those to Phase 2 and covers only the SQL/RLS half now.
7. **Stale docs to fix alongside**: `AGENTS.md:7` ("CI runs lint + build only" — `npm test` already runs) and `AGENTS.md:37-38` (docker-exec-only run instructions; host `psql` works and is what CI will use).
