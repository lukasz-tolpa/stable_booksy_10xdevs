# Repository Guidelines

Stable Booksy is a booking system for horse-riding stables (roles: Ośrodek/stable, Jeździec/rider) built on Astro 6 SSR + React 19 islands + Supabase (auth/Postgres) + shadcn/ui, deployed to Cloudflare Workers. UI copy is Polish.

## Where things are written down

- **Domain vocabulary and decisions** — `GLOSSARY.md`, `docs/adr/`. Use the glossary's terms in code, tests and copy.
- **Visual system and how it is implemented** — `DESIGN.md` (§8 covers tokens, shared blocks, charts, scoped-style traps). Read it before touching markup or styles.
- **Test patterns** — `context/foundation/test-plan.md` §6: unit (§6.1), database (§6.2), e2e incl. locator traps and reserved seed slots (§6.3), endpoints (§6.4), gates and the edit hook (§6.6).
- **Review rules** — `CODING_STANDARDS.md`. Read it when reviewing a diff.
- **Recurring pitfalls** — `context/foundation/lessons.md`.
- **Product** — `context/foundation/prd.md`, `roadmap.md` (living docs, edited in place). `context/changes/<id>/` holds in-flight change folders; `context/archive/` is immutable.
- **Commands** — `package.json` scripts; CI — `.github/workflows/ci.yml`.

## Hard rules

- `main` accepts only pull-request merges with `ci`, `db-tests` and `e2e` green (ruleset `.github/rulesets/main-gates.json`). Production deploys from `main` through Cloudflare Workers Builds, not Actions.
- `src/db/database.types.ts` is generated: after any schema change run `npm run db:types` (local stack running) and commit the result. The rest of the app imports the domain aliases in `src/types.ts`.
- Three test layers, each the only guard for its area:
  - `npm test` (Vitest) — pure logic under `src/lib/**` only.
  - `npm run test:db` — database guarantees. Run after ANY change to migrations or RLS. Needs a seed loaded today and untouched: `npx supabase db reset` first.
  - `npm run test:e2e` (Playwright) — the only layer that exercises SSR pages, forms, redirects and cookies. Run after any change to `src/pages/**`, RLS on `bookings`, or the seed.
- The seed schedules only tomorrow. Past history for the statistics page is `supabase/demo/history.sql`, loaded by `npm run db:demo` and by the e2e setup. Once loaded, `npm run test:db` needs a fresh `npx supabase db reset`.
- The built worker reads secrets from the `.dev.vars` snapshot taken at `astro build`, never from the process environment. `.dev.vars*` hold secrets.
- `npm run lint` is ESLint plus `scripts/check-tokens.mjs`, which rejects colour and font literals outside `src/styles/global.css`.
- A new migration is named `YYYYMMDDHHmmss_short_description.sql` and enables RLS on every table it creates.
- After `npx supabase link`, copy `supabase/.temp/postgres-version` over the committed `supabase/postgres-version` if they differ — CI pins its Postgres image from the committed file.
- This machine is short on memory. In a git worktree run `node scripts/agent-worktree.mjs setup <base-branch> <new-branch>` instead of `npm install`, and `node scripts/agent-worktree.mjs teardown` when done; start the dev server or Docker only when asked.

## Database

- A slot is one instructor × one hour of a schedule day with a seat limit (`schedule_slots.seats`, ADR-0002); `hour` is a `smallint`, working hours are the half-open range `[open_hour, close_hour)` — 10–16 means slots 10…15. A rider books a seat with an instructor (`bookings.instructor_id`); the horse (`bookings.horse_id`) is optional and only on an active booking — the stable assigns it.
- The seat limit is the trigger `bookings_seat_limit`, not application code: it locks the slot row (`FOR UPDATE`) and refuses a booking over the limit with `SB009`; a missing slot or day surfaces as `23503`, "outside working hours" as `23514`. One active booking per rider per hour is the partial unique index `bookings_rider_hour_key` (`23505`); one active booking per assigned horse per hour is `bookings_horse_hour_key`. Trigger `bookings_cancellation` makes a cancelled booking final, lets each role write only itself into `cancelled_by` (`42501`) and clears the horse. Rider-facing messages live in `src/lib/bookings/errors.ts`; stable-facing schedule codes (`SB001`–`SB011`) in `src/lib/schedule/errors.ts`.
- The schedule (day, horses, instructors, seat limits) is written only by `public.save_schedule_day`, in one transaction; direct INSERT/UPDATE/DELETE on `schedule_days`, `schedule_day_horses`, `schedule_day_instructors` and `schedule_slots` is revoked (`42501`). Seeds and demo data write as `postgres` and must keep the seat-sum rule themselves.
- `bookings.rider_id` is nullable: NULL means an anonymised rider (ADR-0001). Deleting a profile first deletes all of the rider's bookings whose slot hour has not ended (trigger `profiles_release_future_bookings`, boundary `private.booking_slot_ended` in `Europe/Warsaw`), then the FK sets `rider_id` to NULL on the rest. Any code that shows a rider next to a booking handles the missing rider.
- Riders cannot SELECT other riders' bookings (RLS). Slot occupancy comes from the RPC `public.get_slot_occupancy(stable_id, day)` — `security definer`, returns only `(instructor_id, hour, taken)`. Wrapper in `src/lib/bookings/queries.ts`.
- Demo accounts from `supabase/seed.sql` (password `sekret123`): `osrodek.debem@example.com`, `osrodek.rzeka@example.com` (stables); `anna.kowalska@example.com`, `piotr.nowak@example.com` (riders).

## Conventions the config does not show

- Statistics are computed in one place: `computeStableStats` in `src/lib/stats/stats.ts` returns the page's view model; the page and components only render it.
- Charts use `src/components/ui/BarChart.astro` (server-rendered, no client JavaScript); extend it rather than adding a chart dependency.
- Time and "today" are injected as defaulted parameters (`todayIso(now)`, `currentWarsawHour(now)`), so tests need no mocks or fake timers. Vitest files sit next to their module with Polish `it()` descriptions.
- The Claude Code hook `.claude/hooks/post-edit.mjs` runs Prettier on every Write/Edit and related Vitest tests in risk areas; its failure comes back as stderr. ESLint runs at commit (lint-staged) and in CI.
