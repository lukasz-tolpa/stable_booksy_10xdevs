# Repository Guidelines

Stable Booksy is an MVP booking system for horse-riding stables (roles: Ośrodek/admin, Jeździec/rider) built on Astro 6 SSR + React 19 islands + Supabase (auth/Postgres) + shadcn/ui, deployed to Cloudflare Workers. Scaffolded from `10x-astro-starter`.

## Hard rules

- `.github/workflows/ci.yml` triggers on push/PR to `master`, but the repo's actual branch is `main` — CI will not run automatically until this is fixed or the branch is renamed. Check before assuming a green CI run happened.
- No test framework is configured; CI only runs lint + build, not tests.
- `claude.md` is the generic 10xDevs toolkit meta-doc, not project rules. The real project-specific architecture rules live in `@CLAUDE.md.scaffold` (sidelined during bootstrap because `claude.md` already existed) — read it for auth-flow file map, rendering mode, and conventions below.
- `context/foundation/` holds living docs (PRD, tech-stack, roadmap) edited in place; `context/changes/<id>/` holds in-flight change folders. Never write to `context/archive/`.

## Project Structure

- `src/pages/` — Astro routes: `index.astro`, `dashboard.astro` (protected), `auth/{signin,signup,confirm-email}.astro`, `api/auth/{signin,signup,signout}.ts`.
- `src/components/` — Astro components for static content (`Banner.astro`, `Topbar.astro`) and `ui/` (shadcn); React islands only where interactive, under `components/auth/*.tsx`.
- `src/lib/` — `supabase.ts` (SSR client), `utils.ts` (`cn()` helper), `config-status.ts`. `src/middleware.ts` gates routes listed in `PROTECTED_ROUTES`.
- `supabase/` — only `config.toml` exists; migrations go in `supabase/migrations/YYYYMMDDHHmmss_short_description.sql` with RLS enabled per table.
- `context/foundation/` — see `@context/foundation/README.md` for the PRD/tech-stack/roadmap workflow.

## Build, Test, and Development

- `npm run dev` — start dev server (Cloudflare workerd runtime).
- `npm run build` — production build; CI runs `npx astro sync` first.
- `npm run lint` / `npm run lint:fix` — type-checked ESLint.
- `npm run format` — Prettier (astro + tailwindcss plugins).
- `npx supabase start` — local Supabase (requires Docker).

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
