# Repository Guidelines

Stable Booksy is an MVP booking system for horse-riding stables (roles: Ośrodek/admin, Jeździec/rider) built on Astro 6 SSR + React 19 islands + Supabase (auth/Postgres) + shadcn/ui, deployed to Cloudflare Workers. Scaffolded from `10x-astro-starter`.

## Hard rules

- `.github/workflows/ci.yml` triggers on push/PR to `main`. CI runs lint + build only — no database, so nothing under `supabase/tests/` runs there.
- No test framework is configured. Database guarantees are verified by scripts in `supabase/tests/`, run by hand against a local stack — see "Database" below. Run them after ANY change to migrations or RLS policies; nothing else will catch a regression.
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
- The no-double-booking guarantee is the partial unique index `bookings_active_slot_key`, not application code. A rejected concurrent write surfaces as `23505`; "outside working hours" surfaces as `23514` from a trigger. Map both to user-facing messages at the call site.
- Verification (local stack must be running, seed loaded):
  - `bash supabase/tests/concurrent_double_booking.sh` — 5 parallel writes to one slot, expects exactly one success.
  - `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -q < supabase/tests/rls_isolation.sql` — cross-stable and cross-rider isolation.
- Demo accounts from `seed.sql` (password `sekret123`): `osrodek.debem@example.com`, `osrodek.rzeka@example.com` (stables); `anna.kowalska@example.com`, `piotr.nowak@example.com` (riders).

## Coding Style & Conventions

- Path alias `@/*` → `./src/*`. Node `22.14.0` per `.nvmrc`.
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes; never concatenate class strings manually.
- shadcn/ui components live in `src/components/ui/` ("new-york" style); add new ones with `npx shadcn@latest add [name]`.
- API routes set `prerender = false` and validate input with zod.
- Husky pre-commit runs lint-staged: `*.{ts,tsx,astro}` → `eslint --fix`, `*.{json,css,md}` → `prettier --write`.

## Testing

No test framework is set up yet — establish one before assuming an existing pattern.

## Security & Configuration

`SUPABASE_URL`/`SUPABASE_KEY` are server-only secrets declared in `astro.config.mjs`'s env schema — see `@README.md` ("Supabase Configuration") for local/cloud setup steps.
