# Repository Guidelines

getona.horse is a booking system for horse-riding stables (account roles: `instructor` — Instruktor; `rider` — Jeździec. A stable's owner — Właściciel — is the instructor account with every right in it, ADR-0004) built on Astro 6 SSR + React 19 islands + Supabase (auth/Postgres) + shadcn/ui, deployed to Cloudflare Workers. UI copy is Polish.

## Where things are written down

- **Database** — `docs/database.md`: constraints, triggers, RLS and RPCs per area, with the app modules that front them. Read the area before writing a migration, RLS policy, trigger or RPC, and before code that reads or writes bookings, the schedule, instructors or invitations, rates or settlements, horses or notifications.
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
- This machine is short on memory. In a git worktree run `node scripts/agent-worktree.mjs setup <base-branch> <new-branch>` instead of `npm install`, `node scripts/agent-worktree.mjs teardown` when done, and `node scripts/agent-worktree.mjs prune` from the main checkout to drop junctions left by removed worktrees; start the dev server or Docker only when asked.

## Demo accounts

- From `supabase/seed.sql` (password `sekret123`): `osrodek.debem@example.com`, `osrodek.rzeka@example.com` (owners — `instructor` accounts linked to instructors Marek Dębowski and Ewa Rzecka); `joanna.wrona@example.com` (instructor Joanna Wrona at Stadnina Pod Dębem, not an owner — „Moje sloty” with Anna at 11:00); `anna.kowalska@example.com`, `piotr.nowak@example.com` (riders); `katarzyna.zajac@example.com` (rider, boarder — Pensjonariusz — without bookings: her boarding horse Hrabia stands at Stadnina Pod Dębem, stay open since 90 days before the seed day, #114).

## Conventions the config does not show

- Statistics are computed in one place: `computeStableStats` in `src/lib/stats/stats.ts` returns the page's view model; the page and components only render it.
- A ride (GLOSSARY „Jazda”) is defined once: `isRide` / `slotEndedAt` in `src/lib/bookings/rides.ts`, read by the statistics and the month summary. The month summary (GLOSSARY „Podsumowanie miesiąca”) is computed in `src/lib/month-summary/` (`summary.ts` core on the shared `SummaryBooking` shape, one file per role, e.g. `owner.ts`); its pages only load rows and render.
- The rider settlement PDF (spec #100) is content from `src/lib/settlements/document.ts` (availability `isSettlementPdfAvailable`, `composeSettlementDocument`, file name) drawn by `src/lib/settlements/pdf/render.ts` (jsPDF + jspdf-autotable). Only the endpoint `src/pages/osrodek/rozliczenia/[jezdziec]/pdf.ts` loads the renderer, by dynamic `import()` (Workers Free: 10 ms CPU per request); `astro.config.mjs` aliases jsPDF's browser dependencies (html2canvas, canvg, dompurify) to a stub. The font module `pdf/fonts.ts` is generated by `npm run pdf:font` — never edit it by hand. The page and the endpoint share one read (`loadRiderSettlementInput`) and the page gets the button address from its view model (`RiderSettlementView.pdfHref`). The endpoint reads the month with `requestedSummaryMonth` (a future month stays future, so availability refuses it); when the PDF is unavailable it redirects to the rider page of that month without a banner (`backToRiderSettlement(…, NO_OUTCOME)`); read/render failures are logged and come back as the banner `SETTLEMENT_PDF_FAILED`.
- Charts use `src/components/ui/BarChart.astro` (server-rendered, no client JavaScript); extend it rather than adding a chart dependency.
- Time and "today" are injected as defaulted parameters (`todayIso(now)`, `currentWarsawHour(now)`), so tests need no mocks or fake timers. Vitest files sit next to their module with Polish `it()` descriptions.
- The Claude Code hook `.claude/hooks/post-edit.mjs` runs Prettier on every Write/Edit and related Vitest tests in risk areas; its failure comes back as stderr. ESLint runs at commit (lint-staged); `npm run lint` runs again at push and in CI.
