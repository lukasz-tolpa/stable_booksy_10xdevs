# UI Redesign — "Horse to go" Visual System — Plan Brief

> Full plan: `context/changes/ui-redesign/plan.md`
> Design contract: `DESIGN.md` (repo root)
> Prototypes: `context/changes/ui-redesign/design/*.html`

## What & Why

Replace the starter's dark theme with the light "Horse to go" brand system across all 11
screens. The app currently ships the 10x Astro Starter's cosmic-gradient look with an
English marketing landing page — it does not read as a product. This change is
visual-only: no route, query, message or behaviour moves.

## Starting Point

The dark `bg-cosmic` utility is applied on 10 pages, colours are 360 hardcoded palette
classes across 24 files, there are no web fonts, and `/` still renders the starter's
`Welcome.astro`. shadcn's `Button` is imported in exactly one place. An e2e suite of
~40 locators guards every Polish string, heading level and form field.

## Desired End State

Every screen renders the brand system: misty green-white background, white 18 px cards,
forest-green pill actions, chestnut at most twice per screen, Plus Jakarta Sans plus
Inter, monospace tabular numerals for hours and dates. The landing shows the hero
photograph and two role cards. No dark mode remains in the codebase, and 1.27 MB of
unused starter assets are gone.

## Key Decisions Made

| Decision                       | Choice                                                                                      | Why (1 sentence)                                                                                                                                         | Source |
| ------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Prototype's "taken slot" state | Not implemented; recorded as follow-up                                                      | The app omits those slots entirely in `src/lib/bookings/slots.ts`, which the brief puts out of scope — rendering them is a product change, not a repaint | Plan   |
| Token architecture             | DESIGN.md names in `:root`, shadcn names as a mapped compatibility layer in `@theme inline` | Keeps `button.tsx` and `npx shadcn add` working while DESIGN.md stays literally findable                                                                 | Plan   |
| Shared blocks                  | Extract `Card`, `EmptyState`, `FailureState`, `RoleBadge`, `DayNav`                         | The prototypes repeat these on five screens; 360 hardcoded classes collapse into a handful of files                                                      | Plan   |
| Delivery                       | One branch, one PR after the last phase                                                     | Every merge deploys production, so phase-by-phase merging would leave the live app half-repainted for days                                               | Plan   |
| Hero image                     | Compress the existing PNG to `public/hero.webp` (~117 KB)                                   | Meets the 200 KB budget with `sharp`, already installed; provenance flagged as an open risk                                                              | Plan   |
| Visual verification            | Standalone Playwright screenshot script in `scripts/`                                       | Makes the "390 px and 1440 px" criterion performable each phase without adding snapshots the test plan forbids                                           | Plan   |
| Starter cleanup                | Everything, in the final phase                                                              | Removes the dark theme, a dead component and 1.27 MB of unused image; lint and `astro check` prove nothing was orphaned                                  | Plan   |
| Breakpoints                    | Tailwind's scale, prototype geometry as intent                                              | The prototypes' `@container` queries exist only because the export shows two frames on one page                                                          | Plan   |

## Scope

**In scope:** `src/styles/global.css`, `src/layouts/Layout.astro`, `Topbar`, `Banner`,
five new shared components, all 11 pages, the auth/schedule/stable form components,
`button.tsx`, `scripts/hero.mjs`, `scripts/shots.mjs`, `public/hero.webp`, cleanup of
`Welcome.astro` / `LibBadge.astro` / `template.png` / `tw-animate-css`, and doc sync in
AGENTS.md, README and test-plan §6.5/§7.

**Out of scope:** anything under `src/pages/api/**`, `src/lib/**`, `src/middleware.ts`,
`supabase/**`; the prototype's taken-slot state; dark mode; visual snapshots; any edit to
`e2e/**`; any change to Polish copy, headings, labels or `name=` attributes.

## Architecture / Approach

Phase 1 lands the token set, fonts, page shell and the five reusable blocks, plus the
hero conversion and the screenshot tool. Each later phase ports one prototype onto
existing markup — changing classes and wrappers, never text, roles, heading levels, form
field names or island directives. The full e2e suite runs at the end of every phase and
is the only thing that can prove "visual-only" was true. Everything lives on
`redesign/ui` until Phase 7 opens a single PR.

## Phases at a Glance

| Phase                        | What it delivers                                                           | Key risk                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1. Foundation and tooling    | Tokens, fonts, shell, five shared components, hero webp, screenshot script | The shadcn/DESIGN.md name collision — getting `muted`/`accent` backwards breaks every ghost button |
| 2. Landing `/`               | Hero, role cards, starter page retired                                     | Hero crop and veil legibility at 390 px                                                            |
| 3. Auth screens              | Sign-in, sign-up, confirm-email on new tokens                              | Densest label contract; `id`→`name` derivation can silently rename a POST field                    |
| 4. Rider slots and catalogue | The slot grid and stable list                                              | Highest risk: exact button names, the `"13:00"` full-text rule, the U+2014 dash                    |
| 5. Stable screens            | Schedule, horses, setup, panel                                             | The repeated `name="horseIds"` checkboxes must stay checkboxes                                     |
| 6. Lists                     | Both booking lists                                                         | Row structure must keep cancel button, stable and horse together                                   |
| 7. Cleanup, docs, merge      | Dead code removed, docs synced, one PR merged                              | Deleting a file something still imports                                                            |

**Prerequisites:** local Supabase stack running with a seed loaded today; the five
prototypes and `DESIGN.md` in place; Cloudflare/GitHub access for the final merge.
**Estimated effort:** ~4–6 sessions across 7 phases.

## Open Risks & Assumptions

- **Hero provenance is unconfirmed.** `change.md` calls the photo a placeholder. It ships
  compressed in this change; its licence must be confirmed before any public
  demonstration, or the file swapped.
- The prototype documents a taken-slot state the app cannot render without a `src/lib`
  change; the redesign will look slightly sparser than the export until that follow-up
  lands.
- A long-lived branch means Phase 7 merges a large diff; the per-phase e2e runs are what
  keep that from becoming a surprise.
- Two Google Fonts families are a third-party runtime dependency on the landing's first
  paint; `display=swap` and a `system-ui` fallback bound the damage.

## Success Criteria (Summary)

- All 12 screens match their prototype at 390 px and 1440 px, and no Polish string,
  heading level or form field changed.
- `npm test`, `npm run lint`, `npm run check` and `npx playwright test` are green at the
  end of every phase, not just the last one.
- Production repaints in a single deploy, and reverting one merge commit restores the old
  look completely.
