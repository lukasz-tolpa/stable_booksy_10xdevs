# 10x Astro Starter

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm test` - Vitest unit tests (`src/**/*.test.ts`)
- `npm run test:db` - Database guarantee scripts against the local Supabase stack (seed loaded today)
- `npm run test:e2e` - Playwright browser tests against the local Supabase stack + `astro preview` (`test:e2e:ui` for UI mode; `.dev.vars` must point at the local stack)

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

The schema lives in `supabase/migrations/` and the local demo data in `supabase/seed.sql`; `npx supabase db reset` rebuilds both. The seed's schedule days are computed as "tomorrow" at load time, so reset it on the day you run `npm run test:db` or `npm run test:e2e`.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

Live: **https://stable-booksy.tolpa-lukasz97.workers.dev** ([Cloudflare Workers](https://workers.cloudflare.com/), worker `stable-booksy`).

`main` is deployed automatically by Cloudflare Workers Builds (Git integration in the Cloudflare dashboard); other branches get preview URLs. `main` itself changes only through pull requests whose `ci`, `db-tests` and `e2e` checks are green (repository ruleset, `.github/rulesets/main-gates.json`). Manual operations:

```bash
npm run build && npx wrangler deploy   # manual deploy
npx wrangler deployments list          # deployed versions
npx wrangler rollback <VERSION_ID>     # roll back
npx wrangler tail stable-booksy        # live logs
npx wrangler secret put SUPABASE_URL   # update runtime secrets (also: SUPABASE_KEY)
```

Note: the deployed worker name comes from the build artifact (`dist/server/wrangler.json`) — after changing `name` in `wrangler.jsonc`, rebuild before deploying.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs three jobs on every push and PR to `main`: `ci` (typecheck, lint, unit tests, build), `db-tests` (Postgres from the Supabase CLI + `npm run test:db`) and `e2e` (Supabase auth stack + `astro preview` + Playwright, report uploaded on failure). All three are required status checks on `main`, so a pull request merges only when they are green and direct pushes to `main` are rejected. Required repository secrets: `SUPABASE_URL`, `SUPABASE_KEY` (build).

Locally, Husky (installed by `npm install`) runs lint-staged at commit and `npm test` + `npm run check` at push. Agents using Claude Code get a per-edit hook (`.claude/settings.json`) that formats the file and runs the related unit tests — see `context/foundation/test-plan.md` §6.6.

## License

MIT
