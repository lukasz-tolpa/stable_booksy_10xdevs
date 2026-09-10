---
change_id: ui-redesign
title: UI redesign in the Horse to go visual system
status: impl_reviewed
created: 2026-09-10
updated: 2026-09-10
archived_at: null
---

## Notes

Visual-only change. Replace the starter's dark theme with the light
"Horse to go" system described in `DESIGN.md` (repo root). Prototypes
exported from OpenDesign live in `context/changes/ui-redesign/design/`:
`landing.html`, `auth.html`, `osrodek-grafik.html`, `jezdziec-sloty.html`,
`listy.html`, plus `hero.png` (placeholder photo, replace or compress before
shipping; target `public/hero.webp` <= 200 KB).

### Scope

- `src/styles/global.css`: replace the oklch token set with DESIGN.md §2
  (`@theme` for Tailwind 4), remove the `.dark` block, keep shadcn variable
  names so `src/components/ui/button.tsx` keeps working.
- `src/layouts/Layout.astro`: Google Fonts link (Plus Jakarta Sans + Inter),
  light `color-scheme`, body background `--bg`.
- `src/components/Topbar.astro`, `Banner.astro`: per DESIGN.md §4–§5.
- Pages, one per phase: `/` (landing, replaces `Welcome.astro`),
  `/auth/signin` + `/auth/signup` (+ `confirm-email`), `/osrodek/grafik`
  (+ `/osrodek/index`, `/osrodek/konie`, `/osrodek/nowa-stadnina` share
  the same card/form patterns), `/jezdziec/osrodki/[id]`, the three lists
  (`/jezdziec/zapisy`, `/osrodek/zapisy`, `/jezdziec/index`).
- Screens not in the prototypes (`confirm-email`, `osrodek/index`,
  `osrodek/konie`, `osrodek/nowa-stadnina`) get the same tokens and
  components, no new layout work.

### Out of scope (hard)

- No changes under `src/pages/api/**`, `src/lib/**`, `src/middleware.ts`,
  `supabase/**`. No new features, fields, routes or copy.
- No dark mode.

### Contracts the plan must protect

- Every text the e2e suite locates by role/label stays byte-identical
  (headings, button names, labels, messages) — see `e2e/*.spec.ts` and
  `context/foundation/test-plan.md` §6.3. Form `name=` attributes and
  endpoint actions stay unchanged.
- Taken slot renders as `<span aria-disabled>` not `<button disabled>`
  (DESIGN.md §5; `e2e/booking-refusal.spec.ts` asserts zero buttons named
  after the horse).
- Prototypes are the visual contract (geometry, tokens, states), not code to
  copy: port them onto the existing Astro/React components and Tailwind
  utilities; do not paste prototype CSS wholesale.

### Verification per phase

- `npm run lint`, `npm run check`, `npm test`.
- `npx playwright test` green after every page phase (local Supabase up,
  seed reset today) — the e2e suite is the safety net for this change.
- Visual check against the prototype at 390 px and 1440 px (screenshot).

### Suggested phase order

0. Tokens + fonts + Layout + Topbar + Banner (foundation, unlocks all pages).
1. Landing `/` — the only screen the certification reviewer sees first.
2. Auth pages.
3. Rider slots page (`/jezdziec/osrodki/[id]`) + catalogue `/jezdziec`.
4. Stable schedule `/osrodek/grafik` + `konie`, `nowa-stadnina`, `index`.
5. Lists (`/jezdziec/zapisy`, `/osrodek/zapisy`).
6. Docs sync: AGENTS.md (design source = DESIGN.md), remove `Welcome.astro`
   and starter assets, README screenshot.
