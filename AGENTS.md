# Repository Guidelines

Stable Booksy is an MVP booking system for horse-riding stables (roles: Ośrodek/admin, Jeździec/rider) built on Astro 6 SSR + React 19 islands + Supabase (auth/Postgres) + shadcn/ui, deployed to Cloudflare Workers. Scaffolded from `10x-astro-starter`.

## Hard rules

- `.github/workflows/ci.yml` triggers on push/PR to `main`. Job `ci` runs lint, unit tests and build; job `db-tests` starts Postgres from the Supabase CLI (`npx supabase db start`, image pinned to `supabase/.temp/postgres-version`) and runs `npm run test:db`; `deploy` waits on both.
- Vitest (`npm test`) covers pure logic under `src/lib/**` only — no DB, server, or component tests. Database guarantees are verified by the psql scripts in `supabase/tests/` via `npm run test:db` — see "Database" below. Run it locally after ANY change to migrations or RLS policies (CI runs it too, but locally is faster); nothing else will catch a regression.
- `src/db/database.types.ts` is generated. Never edit it by hand — run `npm run db:types` (needs a running local stack). It is excluded from ESLint in `eslint.config.js` for that reason.
- `claude.md` is the generic 10xDevs toolkit meta-doc, not project rules. The real project-specific architecture rules live in `@CLAUDE.md.scaffold` (sidelined during bootstrap because `claude.md` already existed) — read it for auth-flow file map, rendering mode, and conventions below.
- `context/foundation/` holds living docs (PRD, tech-stack, roadmap) edited in place; `context/changes/<id>/` holds in-flight change folders. Never write to `context/archive/`.

## Project Structure

- `src/pages/` — Astro routes: `index.astro`, `dashboard.astro` (protected), `auth/{signin,signup,confirm-email}.astro`, `api/auth/{signin,signup,signout}.ts`.
- `src/components/` — Astro components for static content (`Banner.astro`, `Topbar.astro`) and `ui/` (shadcn); React islands only where interactive, under `components/auth/*.tsx`.
- `src/lib/` — `supabase.ts` (SSR client), `utils.ts` (`cn()` helper), `config-status.ts`. `src/middleware.ts` gates routes listed in `PROTECTED_ROUTES`.
- `supabase/` — `migrations/` (schema, RLS), `seed.sql` (local demo data, loaded by `db reset`), `tests/` (verification scripts). New migrations follow `YYYYMMDDHHmmss_short_description.sql` and must enable RLS per table.
- `src/db/` — generated database types; `src/types.ts` — domain aliases (`Booking`, `ScheduleDay`, …) that the rest of the app imports instead of the generated file.
- `context/foundation/` — see `@context/foundation/README.md` for the PRD/tech-stack/roadmap workflow.

## Build, Test, and Development

- `npm run dev` — start dev server (Cloudflare workerd runtime).
- `npm run build` — production build; CI runs `npx astro sync` first.
- `npm run lint` / `npm run lint:fix` — type-checked ESLint.
- `npm run format` — Prettier (astro + tailwindcss plugins).
- `npx supabase start` — local Supabase (requires Docker); `npx supabase db reset` — rebuild schema from migrations + load `seed.sql`.
- `npm run db:types` — regenerate `src/db/database.types.ts` from the local database.

### Database

- Slots are `(schedule_day, horse, hour)`; `hour` is a `smallint`, working hours are the half-open range `[open_hour, close_hour)` — 10–16 means slots 10…15.
- The no-double-booking guarantee is the partial unique index `bookings_active_slot_key`, not application code. A rejected concurrent write surfaces as `23505`; "outside working hours" surfaces as `23514` from a trigger; "horse no longer assigned that day" as `23503`. Rider-facing messages for these live in `src/lib/bookings/errors.ts`; stable-facing schedule codes (`SB001`/`SB002`/`APP001`/`APP002`) in `src/lib/schedule/errors.ts`.
- Riders cannot SELECT other riders' bookings (RLS). Slot occupancy comes from the project's single RPC, `public.get_taken_slots(stable_id, day)` — a `security definer` function returning only (horse_id, hour) of active bookings, no rider identity. Call it via `client.rpc(...)`; wrapper in `src/lib/bookings/queries.ts`.
- Verification: `npm run test:db` (local stack running, seed loaded **today** — the runner refuses a stale seed; run `npx supabase db reset` first). Without a host `psql` it falls back to `docker exec` into the local container. It runs, in order:
  - `rls_isolation.sql` — cross-stable, cross-rider and cross-role isolation (identifier swapping → 0 rows or `42501`).
  - `schedule_change_guardrails.sql` — schedule edits vs. existing bookings as the owner through RLS (`SB001`/`SB002`/`23503`, booking re-read after refusal; cancelled bookings pin the horse).
  - `concurrent_double_booking.sh` — N parallel writes to one slot as two riders, exactly one success, `23505` on `bookings_active_slot_key`, slot released after cancellation.
  - How to add one: `context/foundation/test-plan.md` §6.2.
- Demo accounts from `seed.sql` (password `sekret123`): `osrodek.debem@example.com`, `osrodek.rzeka@example.com` (stables); `anna.kowalska@example.com`, `piotr.nowak@example.com` (riders).

## Coding Style & Conventions

- Path alias `@/*` → `./src/*`. Node `22.14.0` per `.nvmrc`.
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes; never concatenate class strings manually.
- shadcn/ui components live in `src/components/ui/` ("new-york" style); add new ones with `npx shadcn@latest add [name]`.
- API routes set `prerender = false` and validate input with zod.
- Husky pre-commit runs lint-staged: `*.{ts,tsx,astro}` → `eslint --fix`, `*.{json,css,md}` → `prettier --write`.

## Testing

Vitest, colocated `*.test.ts` next to the module under `src/lib/**` (node environment, `@` alias). Polish `it()` descriptions, no mocks or fake timers — inject time/values as defaulted parameters (`todayIso(now)`, `currentWarsawHour(now)`).

## Security & Configuration

`SUPABASE_URL`/`SUPABASE_KEY` are server-only secrets declared in `astro.config.mjs`'s env schema — see `@README.md` ("Supabase Configuration") for local/cloud setup steps.
