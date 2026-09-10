# Repository Guidelines

Stable Booksy is an MVP booking system for horse-riding stables (roles: Ośrodek/admin, Jeździec/rider) built on Astro 6 SSR + React 19 islands + Supabase (auth/Postgres) + shadcn/ui, deployed to Cloudflare Workers. Scaffolded from `10x-astro-starter`.

## Hard rules

- `.github/workflows/ci.yml` triggers on push/PR to `main`. Job `ci` runs lint, unit tests and build; job `db-tests` starts Postgres from the Supabase CLI (`npx supabase db start`, image pinned by the committed `supabase/postgres-version`, which CI copies to `supabase/.temp/`) and runs `npm run test:db`; job `e2e` starts the Supabase auth stack (`npx supabase start -x …`, keeping kong + gotrue + postgrest), writes `.dev.vars` from `supabase status -o env` and runs `npm run test:e2e` against `astro preview`; job `ci` also runs `npm run check` (`astro check`). The three jobs are required status checks in the `main` ruleset (`.github/rulesets/main-gates.json`, applied via API): `main` accepts only pull-request merges with all three green and rejects direct pushes. Production is deployed by Cloudflare Workers Builds from `main` (Git integration), not by Actions. After `npx supabase link` compare `supabase/.temp/postgres-version` with the committed file and update the committed one if they differ.
- Vitest (`npm test`) covers pure logic under `src/lib/**` only — no DB, server, or component tests. Database guarantees are verified by the psql scripts in `supabase/tests/` via `npm run test:db` — see "Database" below. Run it locally after ANY change to migrations or RLS policies (CI runs it too, but locally is faster); nothing else will catch a regression.
- Playwright (`npm run test:e2e`, specs in `e2e/`) is the only layer that exercises SSR pages, forms, redirects and session cookies. It needs Docker with the full local stack (`npx supabase start`), a seed loaded today (`npx supabase db reset`) and a root `.dev.vars` pointing at `http://127.0.0.1:54321` — the built worker reads secrets from the `.dev.vars` snapshot taken at `astro build`, never from the process environment. Run it after any change to `src/pages/**`, the booking/cancel endpoints, RLS on `bookings`, or the seed. Patterns and reserved seed slots: `context/foundation/test-plan.md` §6.3/§6.4.
- `src/db/database.types.ts` is generated. Never edit it by hand — run `npm run db:types` (needs a running local stack). It is excluded from ESLint in `eslint.config.js` for that reason.
- `claude.md` is the generic 10xDevs toolkit meta-doc, not project rules. The real project-specific architecture rules live in `@CLAUDE.md.scaffold` (sidelined during bootstrap because `claude.md` already existed) — read it for auth-flow file map, rendering mode, and conventions below.
- `context/foundation/` holds living docs (PRD, tech-stack, roadmap) edited in place; `context/changes/<id>/` holds in-flight change folders. Never write to `context/archive/`.

## Project Structure

- `src/pages/` — Astro routes: `index.astro`, `dashboard.astro` (protected), `auth/{signin,signup,confirm-email}.astro`, `api/auth/{signin,signup,signout}.ts`.
- `src/components/` — Astro components for static content (`Banner.astro`, `Topbar.astro`) and `ui/` (shadcn plus the shared blocks `Card`, `EmptyState`, `FailureState`, `RoleBadge`, `DayNav` — see "Design"); React islands only where interactive, under `components/auth/*.tsx`.
- `src/lib/` — `supabase.ts` (SSR client), `utils.ts` (`cn()` helper), `config-status.ts`, `log.ts` (`logError(scope, error)` — the only `console.error` in `src/`, derived fields only), `auth/errors.ts` (closed Polish set for GoTrue `error.code`), `auth/session.ts` (helpers returning discriminated results for sign-out, role, current user, sign-up). `src/middleware.ts` gates routes from the map in `@/lib/auth/roles`.
- `supabase/` — `migrations/` (schema, RLS), `seed.sql` (local demo data, loaded by `db reset`), `tests/` (verification scripts). New migrations follow `YYYYMMDDHHmmss_short_description.sql` and must enable RLS per table.
- `src/db/` — generated database types; `src/types.ts` — domain aliases (`Booking`, `ScheduleDay`, …) that the rest of the app imports instead of the generated file.
- `context/foundation/` — see `@context/foundation/README.md` for the PRD/tech-stack/roadmap workflow.

## Build, Test, and Development

- `npm run dev` — start dev server (Cloudflare workerd runtime).
- `npm run build` — production build; CI runs `npx astro sync` first.
- `npm run lint` / `npm run lint:fix` — type-checked ESLint.
- `npm run check` — `astro check` typecheck (also in pre-push and CI).
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

## Design

- `DESIGN.md` (repo root) is the visual source of truth — the light "Horse to go" system. There is **no dark mode**: `global.css` carries no `.dark` block and no `@custom-variant dark`, and `Layout.astro` pins `<meta name="color-scheme" content="light">`. Do not reintroduce either.
- Tokens live once, in `src/styles/global.css`. `:root` holds the DESIGN.md §2 names verbatim (`--surface`, `--muted`, `--primary`, `--accent`, …) so prototypes read 1:1 and `<style>` blocks can use `var(--…)`. `@theme` carries typography and radii as literal values; `@theme inline` re-exports the palette as Tailwind utilities.
- **Two name collisions with shadcn.** shadcn's `--muted` and `--accent` are _background_ colours, DESIGN.md's are _text_ and _chestnut_. So `bg-muted`/`bg-accent` keep shadcn meaning, helper text is `text-muted-foreground`, and chestnut is `bg-chestnut` / `bg-chestnut-soft` / `text-chestnut-ink`. Never map a DESIGN.md name onto a shadcn utility.
- Shared blocks live in `src/components/ui/`: `Card`, `EmptyState`, `FailureState`, `RoleBadge`, `DayNav`. Prefer them over re-cutting a card or an empty state per page. `EmptyState` and `FailureState` are different on purpose — "nothing to show" is not "we could not load it".
- Astro scoped styles do **not** reach a child component's root element. A selector like `.foo h1` works when the markup sits in the page; to style a `<Card>` from outside, pass Tailwind utilities (`class="w-full max-w-[420px]"`) or wrap the slot content in your own element.
- Chestnut is the accent, capped at two appearances per screen (DESIGN.md §7). Today: the rider `RoleBadge`, the own-booking slot pill and the "Zapisz grafik" button.
- Prototypes in `context/changes/ui-redesign/design/*.html` are the geometry contract, not code to copy. They use container queries against a fake `.app` wrapper; the app has no such wrapper, so the same breakpoints are written as media queries.
- **Locator traps.** e2e finds things by role, label and exact text, so visual work can break tests without touching logic. Keep these exactly as they are: the hour element's entire text is `"{h}:00"`; a booking button's entire content is the horse name, with no `aria-label`; the own-booking pill reads `{horse} — Twój zapis` with an em dash (U+2014); the cancelled chip's entire text is `odwołany`; the search field's label is `Szukaj ośrodka`; each upcoming-booking `<li>` holds the cancel button, the stable name and the horse name together. Before adding prose to a screen, check it does not repeat a validation message verbatim — a lead paragraph that contained "Wybierz rodzaj konta" made that text match two elements at once.
- `scripts/shots.mjs` captures every screen at 390 px and 1440 px into `shots/` (gitignored) against a running preview. It sits outside `e2e/` on purpose so the suite never collects it. `scripts/hero.mjs` documents how `public/hero.webp` was produced; the build never runs it.

## Coding Style & Conventions

- Path alias `@/*` → `./src/*`. Node `22.14.0` per `.nvmrc`.
- Use `cn()` from `@/lib/utils` for conditional Tailwind classes; never concatenate class strings manually.
- shadcn/ui components live in `src/components/ui/` ("new-york" style); add new ones with `npx shadcn@latest add [name]`.
- API routes set `prerender = false` and validate input with zod.
- The result of every dependency call is checked and logged; provider messages never reach the UI. Auth errors go through `authFailureMessage` / `authErrorMessage` (`src/lib/auth/`), database errors through the area's `errors.ts`; SSR pages log in their `catch` with `logError("page:<route>", error)`. Details and the stub-client test pattern: `context/foundation/test-plan.md` §6.4.
- Husky is installed by the `prepare` script (`npm install`). Pre-commit runs lint-staged: `*.{ts,tsx,astro}` → `eslint --fix`, `*.{json,css,md}` → `prettier --write`; pre-push runs `npm test` + `npm run check`.
- Claude Code hook (`.claude/settings.json` → `.claude/hooks/post-edit.mjs`) runs Prettier on every Write/Edit and `vitest related` for files under `src/lib/bookings/`, `src/lib/schedule/`, `src/lib/auth/`, `src/lib/log.ts`, `src/pages/api/`; a failure comes back as stderr + exit 2. No ESLint per edit (7–9 s per file). Details and sabotage checks: `context/foundation/test-plan.md` §6.6.

## Testing

Vitest, colocated `*.test.ts` next to the module under `src/lib/**` (node environment, `@` alias). Polish `it()` descriptions, no mocks or fake timers — inject time/values as defaulted parameters (`todayIso(now)`, `currentWarsawHour(now)`).

## Security & Configuration

`SUPABASE_URL`/`SUPABASE_KEY` are server-only secrets declared in `astro.config.mjs`'s env schema — see `@README.md` ("Supabase Configuration") for local/cloud setup steps.
