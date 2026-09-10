# UI Redesign — "Horse to go" Visual System Implementation Plan

## Overview

Replace the starter's dark theme with the light "Horse to go" system across all 11
screens, one screen per phase, with behaviour unchanged. The safety net is the existing
behavioural e2e suite plus `astro check` and lint — not pixel snapshots, which
`context/foundation/test-plan.md` §7 deliberately excludes and which this very redesign
was named as the reason to exclude.

The change is visual-only by construction: nothing under `src/pages/api/**`,
`src/lib/**`, `src/middleware.ts` or `supabase/**` is touched, so no request path, no
query, no message and no route changes.

## Current State Analysis

- **Dark starter theme everywhere.** `src/styles/global.css:113-115` defines the
  `bg-cosmic` gradient utility; it is applied on 10 pages
  (`Welcome.astro:5`, `auth/{signin,signup,confirm-email}.astro`,
  `jezdziec/{index,zapisy}.astro`, `jezdziec/osrodki/[id].astro`,
  `osrodek/{index,grafik,konie}.astro`). The file also carries a full `.dark` block
  (`:41-73`) and `@custom-variant dark` (`:4`) that this change removes.
- **Colours are hardcoded, not tokenised.** 360 occurrences of literal palette classes
  (`text-slate-*`, `bg-purple-*`, `text-white`, …) across 24 files. Heaviest:
  `jezdziec/osrodki/[id].astro` (60), `jezdziec/zapisy.astro` (35),
  `osrodek/konie.astro` (31), `osrodek/grafik.astro` (28), `Welcome.astro` (27).
- **No fonts.** `src/layouts/Layout.astro:18` links only the favicon; there is no
  Google Fonts link and no font-family declaration anywhere.
- **shadcn surface is tiny.** `src/components/ui/button.tsx` is imported in exactly one
  place, `src/components/auth/SubmitButton.tsx:15`, and only its `default` variant is
  rendered. `src/components/ui/LibBadge.astro` is imported nowhere.
- **The landing page is still the starter's.** `src/pages/index.astro:13` renders
  `Welcome.astro`, whose content is English ("10x Astro Starter", "Authentication
  Ready", "Modern Stack", "Developer Experience") — it is the only screen with no e2e
  assertion against it.
- **Assets.** `context/changes/ui-redesign/design/hero.png` is 2.12 MB / 1536×1024.
  `public/template.png` is 1.27 MB and referenced by nothing in `src/`.
- **The prototypes are presentation sheets, not pages.** Each file renders a desktop
  frame and a 390 px `.frame--mobile` side by side on one page, so `.app` uses
  `container-type: inline-size` and every breakpoint is an `@container` query
  (560/620/640/720/820 px). That mechanism does not carry over to the real app.
- **The e2e contract is denser than the brief suggests** — roughly 40 locators across
  `e2e/auth.setup.ts`, `e2e/helpers.ts`, `e2e/rider-loop.spec.ts` and
  `e2e/booking-refusal.spec.ts`. The exact-match ones are listed under Key Discoveries.

## Desired End State

Every screen renders the light "Horse to go" system: misty green-white page background,
white cards with 18 px radius and hairline borders, forest-green primary actions as
pills, chestnut used at most twice per screen, Plus Jakarta Sans for display and Inter
for body, monospace tabular numerals for hours and dates. The landing page shows the
hero photograph with the two role cards. No dark mode exists in the codebase.

Verification of the end state as a whole: `npm test`, `npm run lint`, `npm run check`
and `npx playwright test` all green on the final branch; screenshots at 390 px and
1440 px of all 12 screens match the prototypes' geometry; `grep -rn "bg-cosmic\|\.dark"
src` returns nothing; `public/hero.webp` ≤ 200 KB exists and `public/template.png` does
not.

### Key Discoveries:

**Exact-match locators — these strings and structures cannot move.**

- `e2e/helpers.ts:48-50` — the booking button's accessible name must be the horse name
  and nothing else (`{ name: horse, exact: true }`). A labelled icon, an `aria-label`
  or extra visible text inside the button breaks both specs. A decorative
  `<svg aria-hidden="true">` is safe.
- `e2e/helpers.ts:43-45` — the hour element's **entire** text must be `"<h>:00"` and it
  must sit inside a `role=listitem` together with the horse controls. Rendering
  `"13:00–14:00"` or `"godz. 13:00"` breaks every hour-scoped assertion.
  Rendered at `jezdziec/osrodki/[id].astro:186` and `osrodek/zapisy.astro:114`.
- `jezdziec/osrodki/[id].astro:189-192` — `{horse.name} — Twój zapis` must stay one
  element with an em dash **U+2014**; asserted four times.
- `e2e/helpers.ts:62-68` — the cancelled chip's whole text must be `odwołany`,
  lowercase (`jezdziec/zapisy.astro:132-134`).
- Heading **levels** are part of the contract: h1 "Ośrodki", h1 `{stable.name}`,
  h1 "Zapisy dnia", h1 "Panel ośrodka", h2 "Wolne sloty", h2 "Nadchodzące",
  h2 "Minione i odwołane".
- `getByLabel("Hasło", { exact: true })` (`auth.setup.ts:28,54`) — the label must stay
  exactly `Hasło`; adding `Hasło *` or `Hasło (min. 6)` breaks sign-in and sign-up
  setup for the whole suite.
- `stables/StableFilter.astro:19` — the `sr-only` label "Szukaj ośrodka" must survive;
  a placeholder-only search box breaks `openStable`.
- `stables/StableCard.astro:16-19` — the whole card must stay a single `<a>` whose
  accessible name contains the stable name.
- `e2e/helpers.ts:79-85` — `getByRole("listitem")` is queried page-wide with no
  container scoping, and `.first()` must resolve to a slot row. Do not wrap the topbar
  or any nav in `<ul><li>` containing a button.
- Banner sentences must render contiguous, in one element, and stay unique on the page
  (Playwright strict mode): "Zapisano na jazdę.", "Zapis został odwołany.",
  "Nie masz nadchodzących zapisów.", "Ośrodek nie ułożył grafiku na ten dzień.",
  and the full 23505 sentence from `src/lib/bookings/errors.ts:23`.

**Structure and tooling.**

- All five islands are `client:load` and hold controlled inputs; `waitForIslands`
  (`e2e/helpers.ts:33-35`) waits for `astro-island[ssr]` to reach zero page-wide.
  Changing a directive, or adding any new `client:visible` island to `/auth/signin` or
  `/auth/signup`, breaks the wait.
- `src/components/auth/FormField.tsx:44` derives the POST field name from the `id`
  (`name={name ?? id}`). Renaming an `id` for styling silently renames a form field.
- The prototypes' slot grid keeps the POST form intact with `.slots form{display:contents}`
  (`jezdziec-sloty.html:129`) — the form stays in the DOM but does not create a flex
  item. This is the mechanism that lets the pill grid wrap correctly.
- Tokens in the five prototypes are byte-identical to DESIGN.md §2 and add
  `--shadow-sm`, `--shadow-md`, `--r-sm|--r|--r-lg|--r-xl` (8/12/18/26 px),
  `--font-display|body|mono`, `--maxw: 1200px`, `--nav-h: 68px`.
- Container width differs by screen: 1200 px on the landing, **880 px** on app screens
  (`jezdziec-sloty.html:48`), matching DESIGN.md §4.
- Interactive targets are `min-height: 44px` throughout (buttons, slots, day-nav links,
  form controls) — this is what makes the 390 px layout usable and satisfies PRD line
  99 ("wygodny w obsłudze na ekranie telefonu").
- Google Fonts, one stylesheet plus two preconnects:
  `https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap`
- `sharp` is already in `node_modules`; `hero.png` converts to ≈117 KB webp at q80 full
  width, ≈91 KB at 1280 px — comfortably inside the 200 KB budget.

## What We're NOT Doing

- **No source changes outside the view layer.** Nothing under `src/pages/api/`,
  `src/lib/`, `src/middleware.ts` or `supabase/` is touched. No new features, fields,
  routes or copy.
- **No "taken slot" state.** The prototype's legend (`jezdziec-sloty.html:160-164`)
  documents three slot states, but `computeSlotSections`
  (`src/lib/bookings/slots.ts:88-94`) omits slots taken by other riders entirely — there
  is no element to restyle. Rendering them would require a third status in `src/lib`,
  which is out of scope and is a product change, not a repaint. Recorded as a follow-up.
- **No dark mode**, no `prefers-color-scheme` handling.
- **No visual regression tests / snapshots** (`test-plan.md` §7).
- **No new e2e scenarios and no edits to `e2e/**`.\*\* If a phase seems to need a spec
  change, the redesign has changed behaviour — stop and re-plan instead.
- **No changes to Polish copy**, headings, button labels or form labels.
- No accessibility audit beyond preserving existing semantics and contrast implied by
  the tokens; no ARIA additions beyond the `aria-hidden` on decorative icons.
- No component library swap: shadcn stays, `npx shadcn add` must keep working.

## Implementation Approach

Work on a single long-lived branch `redesign/ui`, one commit per phase, and open one PR
after the last phase. Every merge to `main` deploys production through Cloudflare
Workers Builds, so a phase-by-phase merge would leave production visibly half-repainted
for days; a single PR keeps the deployed app either fully old or fully new and makes
rollback one revert.

Phase 1 lays the foundation — tokens, fonts, shell, shared components, plus the two
build-side tools (hero conversion, screenshot script) that later phases depend on. Each
screen phase then ports one prototype onto existing markup, changing classes and
wrappers but never text, roles, levels, `name=` attributes or island directives. The
full e2e suite runs at the end of every phase; it is the only thing that can prove
"visual-only" was true.

Prototypes are the visual contract — geometry, tokens, states — not code to copy. Their
`@container` queries exist because the export shows two frames on one page; in the app
the same intent is expressed with Tailwind's own breakpoints.

## Critical Implementation Details

**Token namespace collision.** shadcn's `--muted` and `--accent` are _background_
colours; DESIGN.md's `--muted` is a _text_ colour and `--accent` is the chestnut fill.
`:root` holds the DESIGN.md set verbatim; the shadcn meanings are produced only in
`@theme inline` (`--color-muted: var(--surface-2)`, `--color-muted-foreground:
var(--muted)`, `--color-accent: var(--surface-2)`, `--color-accent-foreground:
var(--fg)`), and the chestnut is exposed under its own utility names. Getting this
backwards makes every ghost button chestnut and every helper text a background colour.

**Screenshot script must not join the e2e suite.** `playwright.config.ts:78` runs
`npm run build && npm run preview` for `e2e/`; a script placed inside `e2e/` would be
collected as a spec and would run in CI. It belongs in `scripts/`, is invoked manually,
and writes to a gitignored directory.

**Hero conversion runs before the landing phase**, and its output is committed. The
build must not depend on `context/changes/**` — the change folder is archived later, so
the landing references `public/hero.webp`, never the source PNG.

**Deleting `Welcome.astro` is the last step, not the second.** `src/pages/index.astro`
stops importing it in Phase 2, but the file stays on disk until Phase 7 so that any
phase can be reverted independently without a broken import.

---

## Phase 1: Foundation and tooling

### Overview

Everything shared: the token set, fonts, the page shell, the five reusable blocks the
prototypes repeat, and the two tools later phases need. No page changes yet, so the app
looks broken-ish at the end of this phase (light background, still-dark page content) —
this is why nothing merges until Phase 7.

### Changes Required:

#### 1. Token set

**File**: `src/styles/global.css`

**Intent**: Replace the starter's neutral shadcn palette and dark block with the
DESIGN.md §2 tokens, keeping shadcn's utility names alive as a mapped compatibility
layer so `button.tsx` and future `npx shadcn add` components keep working.

**Contract**: `:root` contains exactly the DESIGN.md §2 token set (verbatim names and
oklch values) plus the prototype additions `--shadow-sm`, `--shadow-md`, `--r-sm`,
`--r`, `--r-lg`, `--r-xl`, `--font-display`, `--font-body`, `--font-mono`, `--maxw`,
`--nav-h`. `@theme inline` exposes them as `--color-*`, `--radius-*`, `--font-*`,
`--shadow-*` utilities. The four colliding shadcn names map to shadcn semantics as
described in Critical Implementation Details; chestnut is reachable as
`--color-chestnut`, `--color-chestnut-soft`, `--color-chestnut-ink`. Deleted:
`@custom-variant dark` (`:4`), the whole `.dark` block (`:41-73`), the `bg-cosmic`
utility (`:113-115`). The `@layer base` body rule targets the new background and
foreground.

#### 2. Fonts and document shell

**File**: `src/layouts/Layout.astro`

**Intent**: Load the two brand families once, declare a light-only colour scheme, and
give the document the page background.

**Contract**: two `<link rel="preconnect">` (googleapis, gstatic with `crossorigin`)
plus the single stylesheet link from Key Discoveries; `<meta name="color-scheme"
content="light">`; body background `--bg`, text `--fg`, font `--font-body`. `lang="pl"`,
`<title>{title}</title>` and the `missingConfigs` banner loop stay as they are.

#### 3. Shared blocks

**Files**: `src/components/ui/Card.astro`, `EmptyState.astro`, `FailureState.astro`,
`RoleBadge.astro`, `DayNav.astro` (all new)

**Intent**: Extract the blocks the prototypes repeat on five screens so later phases
compose instead of re-deriving geometry, and so 360 hardcoded classes collapse into a
handful of places.

**Contract**:

- `Card.astro` — `--surface`, 1 px `--border`, `--r-lg`, `--shadow-sm`; props `padding`
  (default 22 px per DESIGN.md §4) and `variant` (`default | warn`, the latter being
  the `--warn-soft` failure card).
- `EmptyState.astro` — centred, `--muted` text capped at ~50ch, optional slot for a
  `--primary` link. Renders its children verbatim; **it must not wrap the sentence in
  extra elements** (banner strings are asserted contiguously).
- `FailureState.astro` — the `--warn-soft` card with `--warn-ink` text.
- `RoleBadge.astro` — pill; `stable` → `--primary-strong` on `--primary-soft`,
  `rider` → `--accent-ink` on `--accent-soft` (DESIGN.md §2).
- `DayNav.astro` — the prototype's `.daynav` bar: previous link, mono centred date,
  next link, with a `--faint` non-interactive `<span>` when a direction is unavailable.
  Slots for the three pieces so pages keep owning their exact link text.

#### 4. Topbar and Banner

**Files**: `src/components/Topbar.astro`, `src/components/Banner.astro`

**Intent**: Sticky translucent topbar and the two banner variants, per DESIGN.md §4–§5.

**Contract**: Topbar — sticky, `--nav-h` 68 px, `oklch(100% 0 0 / .82)` with
`backdrop-filter: saturate(140%) blur(14px)`, hairline bottom border, brand
"Stable Booksy" in `--primary-strong` 800, role chip via `RoleBadge`. **The e-mail text
node, the links "Mój panel" / "Zaloguj się" / "Załóż konto" and the sign-out form
(`POST /api/auth/signout`, button "Wyloguj się") stay byte-identical, and the topbar
must not introduce a `<ul><li>` containing a button.** Banner — full container width,
3 px left bar, `--success-soft`/`--success-ink` and `--danger-soft`/`--danger-ink`;
`role="alert"` for error and `role="status"` otherwise stays exactly as today.

#### 5. Hero asset

**Files**: `scripts/hero.mjs` (new), `public/hero.webp` (new, committed)

**Intent**: Turn the 2.12 MB source PNG into a shippable asset inside the 200 KB budget,
reproducibly.

**Contract**: `sharp` is added to `devDependencies` (it is currently only a
transitive dependency of `astro`, so a first-party script must not rely on it being
hoisted). A Node script using it reads
`context/changes/ui-redesign/design/hero.png` and writes `public/hero.webp` at full
source width, quality 80 (≈117 KB measured). The script is documentation of how the
asset was produced; the build never runs it and never reads from `context/`.

#### 6. Screenshot tool

**Files**: `scripts/shots.mjs` (new), `.gitignore`

**Intent**: Make the "compare against the prototype at 390 px and 1440 px" criterion
something that can actually be performed each phase.

**Contract**: a standalone Playwright script — **outside `e2e/`** so the suite does not
collect it — that signs in with the seeded accounts, visits each screen at 390×844 and
1440×900, and writes PNGs to `shots/` (added to `.gitignore`). Invoked by hand against
a running preview; not wired into CI, `npm test` or `playwright.config.ts`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run check` passes
- `npm test` passes (215 tests, unchanged)
- `grep -rn "bg-cosmic\|@custom-variant dark\|^\.dark" src/styles/global.css` returns nothing
- `node scripts/hero.mjs` produces `public/hero.webp` ≤ 200 KB
- `npx playwright test` passes — the shell change must not disturb any locator

#### Manual Verification:

- Topbar at 390 px and 1440 px matches the prototype: height, blur, hairline, brand colour
- Pages other than the shell are expected to be **unreadable** at this point — 53
  `text-white` and 50 `text-purple-*` occurrences now sit on a light background, and
  Playwright's `toBeVisible()` does not check contrast. Only the topbar, the banners
  and the page shell are judged in this phase; each page is fixed in its own phase.

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 2: Landing `/`

### Overview

The first screen a certification reviewer sees, and the only one with no e2e assertion —
the right place to prove the new components before touching guarded screens.

### Changes Required:

#### 1. Landing page

**File**: `src/pages/index.astro`

**Intent**: Replace the starter's English marketing page with the DESIGN.md §6 landing:
hero photograph with a white gradient veil, eyebrow, h1, one sentence, two buttons, then
two role cards.

**Contract**: full-bleed hero using `public/hero.webp` with the white-from-left gradient
overlay; eyebrow in mono uppercase `--primary`; `<h1>Stable Booksy</h1>` at
`clamp(30px, 4vw, 44px)`; primary pill "Załóż konto" → `/auth/signup` and ghost
"Zaloguj się" → `/auth/signin`; below, two role cards each carrying a `RoleBadge`.
Container 1200 px. **`index.astro` renders `<Topbar />` itself** — today only
`Welcome.astro:28` does, so dropping Welcome without this would leave the landing with
no header at all, against DESIGN.md §4 and `landing.html`'s `.nav`.
The existing `?error=` banner (`index.astro:12`) stays and keeps
rendering through `Banner`. `Welcome.astro` is no longer imported but stays on disk
until Phase 7. No "jak to działa", pricing, testimonials or link footer.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run check`, `npm test` pass
- `npx playwright test` passes
- `grep -n "Welcome" src/pages/index.astro` returns nothing
- The hero image is served from `/hero.webp`, not from `context/`

#### Manual Verification:

- Landing at 390 px and 1440 px matches `landing.html`: sticky topbar, hero crop, veil legibility, two buttons, two role cards
- Chestnut appears at most twice on the screen (DESIGN.md §7)
- `/?error=test` still renders the error banner above the hero

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 3: Auth screens

### Overview

Three screens sharing one card shell. Highest label-contract density in the codebase and
the two pages whose islands the whole e2e suite depends on.

### Changes Required:

#### 1. Auth page shells

**Files**: `src/pages/auth/signin.astro`, `signup.astro`, `confirm-email.astro`

**Intent**: Centred card on the new background, per `auth.html`.

**Contract**: `--bg` page, centred `Card` (no `bg-cosmic`), display h1, `--muted` lead
paragraph, footer switch link in `--primary`. Headings "Zaloguj się", "Załóż konto" and
the footer links stay byte-identical; `client:load` on both form islands stays.
`confirm-email.astro` keeps its `import.meta.env.DEV` branch and both copy variants
untouched — tokens only.

#### 2. Form primitives

**Files**: `src/components/auth/FormField.tsx`, `PasswordToggle.tsx`, `RoleSelect.tsx`,
`ServerError.tsx`, `SubmitButton.tsx`

**Intent**: Field, toggle, role picker and error styling on the new tokens.

**Contract**: label 13 px 600 above the control; control `--surface`, `--border-2`,
`--r` 12 px, `min-height: 46px`, focus ring `--primary` with a `--primary-soft` glow;
error state `--danger` border and `--danger-ink` text. **`id`/`htmlFor` pairs and the
`name`-from-`id` derivation (`FormField.tsx:44`) must not change** — renaming an `id`
renames a POST field. `RoleSelect`'s wrapping `<label htmlFor>` stays; its radios keep
`name="role"` with values `stable`/`rider`, and the accessible names keep containing
"Ośrodek" and "Jeździec". `SubmitButton` keeps its `pendingText` swap and the labels
"Zaloguj się" / "Załóż konto".

#### 3. Button component

**File**: `src/components/ui/button.tsx`

**Intent**: Make the one rendered variant match the DESIGN.md pill.

**Contract**: the `default` variant becomes the primary pill (`--primary`, white text,
999 px radius, `--shadow-sm`, hover `--primary-strong`, `min-height: 44px`). Other
variants keep working against the mapped shadcn tokens; the file stays shadcn-shaped so
`npx shadcn add` keeps functioning.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run check`, `npm test` pass
- `npx playwright test` passes — `auth.setup.ts` exercises every label on both pages
- `grep -rn "client:load" src/pages/auth/` still shows both form islands
- `grep -rn "bg-cosmic" src/pages/auth/` returns nothing

#### Manual Verification:

- Sign-in and sign-up at 390 px and 1440 px match `auth.html`
- A field error and a server error banner both render in the new error styling
- Keyboard focus ring is visible on every control
- Chestnut appears at most twice on each screen

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 4: Rider — slots and catalogue

### Overview

The highest-risk phase: `jezdziec/osrodki/[id].astro` is 226 lines carrying 60 hardcoded
classes and nearly every exact-match locator in the suite.

### Changes Required:

#### 1. Slot screen

**File**: `src/pages/jezdziec/osrodki/[id].astro`

**Intent**: Port `jezdziec-sloty.html`: header card, day navigation, day picker, and the
hour list with pill slots.

**Contract**: container 880 px; `DayNav` for the previous/next bar with the mono date;
the day form keeps `method="get"`, `name="dzien"`, `type="date"`, the label text
"Wybierz dzień:" and the button "Pokaż". The hour list stays `<ul>`/`<li>` with the hour
as a standalone element whose entire text is `"{hour}:00"`. Free slots stay
`<form method="post" action="/api/bookings/create">` with the four hidden inputs and a
`<button>` whose only content is `{horse.name}`; the form gets `display: contents` so the
pills wrap as a flex row. The own-booking slot stays a single `<span>` reading
`{horse.name} — Twój zapis` (em dash U+2014) styled `--accent-soft` / `--accent-ink`,
with an optional `aria-hidden` check icon. Both banners, the three empty/failure
sentences and the h1/h2 levels stay byte-identical. **Slots taken by other riders remain
unrendered** (see What We're NOT Doing).

#### 2. Catalogue

**Files**: `src/pages/jezdziec/index.astro`, `src/components/stables/StableCard.astro`,
`src/components/stables/StableFilter.astro`

**Intent**: Search bar and stable cards per the landing prototype's `.stablecard` and
`.search` blocks.

**Contract**: `StableCard` stays a single `<a>` wrapping an `<h2>` with the stable name,
city and clamped description. `StableFilter` keeps `method="get"`, `name="q"`, `id="q"`,
the **`sr-only` label "Szukaj ośrodka"**, the button "Szukaj" and the conditional
"Wyczyść" link. h1 "Ośrodki" and the three list states keep their sentences.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run check`, `npm test` pass
- `npx playwright test` passes — both specs live on these two screens
- `grep -c "aria-label" src/pages/jezdziec/osrodki/\[id\].astro` returns 0 for the booking buttons
- The em dash in "— Twój zapis" is still U+2014 (byte check)

#### Manual Verification:

- Slot grid at 390 px and 1440 px matches `jezdziec-sloty.html`: pill geometry, 44 px targets, wrap behaviour
- Free / own-booking states look like the prototype's two corresponding legend entries
- Chestnut appears only on the own-booking slot

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 5: Stable — schedule, horses, setup, panel

### Overview

Four screens sharing the card and form patterns from `osrodek-grafik.html`.

### Changes Required:

#### 1. Schedule

**Files**: `src/pages/osrodek/grafik.astro`,
`src/components/schedule/ScheduleDayForm.tsx`

**Intent**: Port the schedule screen including the horse checkbox rows.

**Contract**: `DayNav` for day navigation; the four states (failure, read-only past day,
no horses, form) keep their sentences and their card shells. In the island: fieldsets
"Godziny pracy" and "Konie pracujące tego dnia" keep their legends; hour inputs keep
`name="openHour"` / `name="closeHour"`; **the horse checkboxes stay multiple inputs with
the same `name="horseIds"`** — not a multi-select — because `formValues` reads repeated
entries. Each checkbox row becomes the prototype's 12 px card with the horse name at
weight 500. Submit stays "Zapisz grafik" and may take the accent variant as the screen's
single chestnut CTA. `client:load` stays.

#### 2. Horses, setup, panel

**Files**: `src/pages/osrodek/konie.astro`, `nowa-stadnina.astro`, `index.astro`,
`src/components/stables/HorseForm.tsx`, `src/components/stable/NewStableForm.tsx`

**Intent**: Same tokens and components, no new layout work (per the brief).

**Contract**: horse articles become cards; the retired section keeps its `<h2>Wycofane
ze służby</h2>` and `<h3>` names; both toggle forms keep `POST /api/horses/toggle-active`
with `horseId` and `active`. `HorseForm` and `NewStableForm` keep their field ids/names
and submit labels ("Dodaj konia", "Załóż stadninę"). `osrodek/index.astro` keeps
h1 "Panel ośrodka" and the three nav links.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run check`, `npm test` pass
- `npx playwright test` passes — `auth.setup.ts` asserts h1 "Panel ośrodka"
- `grep -c 'name="horseIds"' src/components/schedule/ScheduleDayForm.tsx` is unchanged
- `grep -rn "client:load" src/pages/osrodek/` still shows all three islands

#### Manual Verification:

- Schedule at 390 px and 1440 px matches `osrodek-grafik.html`, including the checkbox rows
- Saving a schedule still works end to end against the local stack
- The failure card uses `--warn-soft` and reads in Polish
- Chestnut appears at most twice on each screen — "Zapisz grafik" is the only accent

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 6: Lists

### Overview

The two list screens from `listy.html`, including the row structures that
`rider-loop.spec.ts` walks.

### Changes Required:

#### 1. Rider bookings

**File**: `src/pages/jezdziec/zapisy.astro`

**Intent**: Port the "Nadchodzące" and "Minione i odwołane" cards.

**Contract**: h2 levels and texts stay. Each upcoming `<li>` keeps **all three** of the
cancel button, the stable name and the horse name inside the same row; the button text
stays "Odwołaj" and its form keeps `POST /api/bookings/cancel` with `bookingId`. The
date/hour span keeps the `"{dzień miesiąc}, {hour}:00"` shape in mono. The cancelled chip
stays a single element whose entire text is `odwołany`, lowercase, styled as a neutral
pill. Both banners and the empty sentence stay byte-identical.

#### 2. Stable day bookings

**File**: `src/pages/osrodek/zapisy.astro`

**Intent**: Port the day list.

**Contract**: h1 "Zapisy dnia"; `DayNav` for navigation; rows stay `<ul>`/`<li>` with the
hour as an element whose entire text is `"{hour}:00"`, then horse, then rider or
"(bez nazwiska)". The four states keep their sentences.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run check`, `npm test` pass
- `npx playwright test` passes — the cancel flow and the stable day list are both walked
- Hour elements on both screens still match `"^\d{1,2}:00$"` as their full text

#### Manual Verification:

- Both lists at 390 px and 1440 px match `listy.html`
- Empty and failure states render in the new styling
- The cancelled chip is legible and does not read as chestnut
- Chestnut appears at most twice on each screen

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 7: Cleanup, docs, merge

### Overview

Remove the dark starter's remains, sync the documents, land the whole redesign in one PR.

### Changes Required:

#### 1. Dead code and assets

**Files**: `src/components/Welcome.astro`, `src/components/ui/LibBadge.astro`,
`public/template.png`, `src/styles/global.css`, `package.json`

**Intent**: Delete what the redesign replaced or orphaned.

**Contract**: delete `Welcome.astro` (replaced in Phase 2), `LibBadge.astro` (imported
nowhere), `public/template.png` (1.27 MB, referenced nowhere). Remove the
`tw-animate-css` import from `global.css` and the dependency from `package.json` —
verified unused: no `animate-in`, `animate-out`, `fade-*`, `zoom-*` or
`slide-in-from-*` class appears in `src`, and the single `animate-spin`
(`SubmitButton.tsx:22`) is core Tailwind. `astro check` and lint are the proof that nothing was orphaned.

#### 2. Documentation

**Files**: `AGENTS.md`, `README.md`, `context/foundation/test-plan.md`

**Intent**: Point future contributors at the design source of truth and record what the
redesign taught.

**Contract**: AGENTS.md gains a "Design" rule — `DESIGN.md` is the visual source of
truth, tokens live in `src/styles/global.css`, shared blocks in `src/components/ui/`,
the shadcn/DESIGN.md name mapping is explained, and the exact-match locator traps are
named. README's stack section drops the dark-theme wording. test-plan §6.5 gets a 2–3
line note for this change (the taken-slot divergence, the container-query mechanism, the
locator traps); §7's visual-appearance exclusion gets a sentence confirming it survived
the redesign it predicted.

#### 3. Follow-up

**File**: `context/changes/ui-redesign/follow-ups/taken-slot.md` (new)

**Intent**: Record the one prototype element deliberately not implemented.

**Contract**: one page naming the prototype legend entry, the `slots.ts` change it would
need, the unit tests it would touch, and why it was excluded here.

#### 4. Merge

**Intent**: Land the redesign.

**Contract**: PR from `redesign/ui` to `main`, wait for `ci`, `db-tests`, `e2e`, merge
commit. Production repaints in one deploy.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run check`, `npm test` pass
- `npx playwright test` passes
- `grep -rn "bg-cosmic\|Welcome.astro\|LibBadge\|template.png" src public README.md` returns nothing
- `npx prettier --check AGENTS.md README.md context/foundation/test-plan.md` passes
- PR merged with `ci`, `db-tests` and `e2e` green

#### Manual Verification:

- All 12 screens reviewed once more at 390 px and 1440 px after the cleanup
- Production after the merge shows the new design end to end

---

## Testing Strategy

### Unit Tests:

None added. This change touches no logic; `npm test` (215 tests) runs unchanged as a
regression check that no import or type was disturbed.

### Integration Tests:

None added. `npm run test:db` is unaffected — no migration, no query.

### Manual Testing Steps:

1. `npx supabase start` and `npx supabase db reset` (the seed's days are `current_date + 1`).
2. `npm run build && npm run preview`, then `node scripts/shots.mjs` to capture all screens at 390 px and 1440 px.
3. Compare each screenshot against the matching prototype file for geometry, colour roles and states.
4. Walk the rider loop by hand once after Phase 6: catalogue → slots → book → "Moje zapisy" → cancel.
5. Confirm chestnut appears at most twice on any single screen (DESIGN.md §7).

## Performance Considerations

The hero is the only new payload: ≈117 KB webp against a 200 KB budget, and the cleanup
removes 1.27 MB of unused PNG, so the deployed asset weight drops. Two Google Fonts
families load from a single stylesheet with `display=swap` and preconnects; the fallback
is `system-ui`, so first paint does not block. No JavaScript is added — the five islands
keep their existing directives.

## Migration Notes

No data or schema migration. Rollback is one revert of the merge commit, which restores
the dark theme wholesale because the change never merges in pieces. Between phases the
branch may look visually inconsistent; that is expected and is the reason for the
single-PR delivery.

## References

- Design contract: `DESIGN.md` (repo root)
- Prototypes: `context/changes/ui-redesign/design/{landing,auth,jezdziec-sloty,osrodek-grafik,listy}.html`
- Brief: `context/changes/ui-redesign/change.md`
- Locator contract: `e2e/helpers.ts`, `e2e/auth.setup.ts`, `e2e/rider-loop.spec.ts`, `e2e/booking-refusal.spec.ts`, `context/foundation/test-plan.md` §6.3
- Visual-testing exclusion: `context/foundation/test-plan.md` §7
- Mobile requirement: `context/foundation/prd.md:99`
- Recurring rule: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Foundation and tooling

#### Automated

- [x] 1.1 `npm run lint` passes
- [x] 1.2 `npm run check` passes
- [x] 1.3 `npm test` passes (215 tests, unchanged)
- [x] 1.4 No `bg-cosmic`, `@custom-variant dark` or `.dark` block left in global.css
- [x] 1.5 `node scripts/hero.mjs` produces `public/hero.webp` ≤ 200 KB
- [x] 1.6 `npx playwright test` passes after the shell change

#### Manual

- [ ] 1.7 Topbar at 390 px and 1440 px matches the prototype
- [ ] 1.8 Pages other than the shell are expected to be unreadable until their own phase

### Phase 2: Landing `/`

#### Automated

- [ ] 2.1 `npm run lint`, `npm run check`, `npm test` pass
- [ ] 2.2 `npx playwright test` passes
- [ ] 2.3 `src/pages/index.astro` no longer imports `Welcome`
- [ ] 2.4 Hero is served from `/hero.webp`, not from `context/`

#### Manual

- [ ] 2.5 Landing at 390 px and 1440 px matches `landing.html`, topbar included
- [ ] 2.6 Chestnut appears at most twice on the screen
- [ ] 2.7 `/?error=test` still renders the error banner

### Phase 3: Auth screens

#### Automated

- [ ] 3.1 `npm run lint`, `npm run check`, `npm test` pass
- [ ] 3.2 `npx playwright test` passes
- [ ] 3.3 Both auth form islands still use `client:load`
- [ ] 3.4 No `bg-cosmic` left under `src/pages/auth/`

#### Manual

- [ ] 3.5 Sign-in and sign-up at 390 px and 1440 px match `auth.html`
- [ ] 3.6 Field error and server error render in the new error styling
- [ ] 3.7 Keyboard focus ring visible on every control
- [ ] 3.8 Chestnut appears at most twice on each screen

### Phase 4: Rider — slots and catalogue

#### Automated

- [ ] 4.1 `npm run lint`, `npm run check`, `npm test` pass
- [ ] 4.2 `npx playwright test` passes
- [ ] 4.3 Booking buttons carry no `aria-label` or extra visible text
- [ ] 4.4 The dash in "— Twój zapis" is still U+2014

#### Manual

- [ ] 4.5 Slot grid at 390 px and 1440 px matches `jezdziec-sloty.html`
- [ ] 4.6 Free and own-booking states match the prototype legend
- [ ] 4.7 Chestnut appears only on the own-booking slot

### Phase 5: Stable — schedule, horses, setup, panel

#### Automated

- [ ] 5.1 `npm run lint`, `npm run check`, `npm test` pass
- [ ] 5.2 `npx playwright test` passes
- [ ] 5.3 Horse checkboxes still share `name="horseIds"`
- [ ] 5.4 All three stable islands still use `client:load`

#### Manual

- [ ] 5.5 Schedule at 390 px and 1440 px matches `osrodek-grafik.html`
- [ ] 5.6 Saving a schedule works end to end against the local stack
- [ ] 5.7 Failure card uses `--warn-soft` and reads in Polish
- [ ] 5.8 Chestnut appears at most twice on each screen

### Phase 6: Lists

#### Automated

- [ ] 6.1 `npm run lint`, `npm run check`, `npm test` pass
- [ ] 6.2 `npx playwright test` passes
- [ ] 6.3 Hour elements on both list screens still have `"{h}:00"` as their full text

#### Manual

- [ ] 6.4 Both lists at 390 px and 1440 px match `listy.html`
- [ ] 6.5 Empty and failure states render in the new styling
- [ ] 6.6 The cancelled chip is legible and not chestnut
- [ ] 6.7 Chestnut appears at most twice on each screen

### Phase 7: Cleanup, docs, merge

#### Automated

- [ ] 7.1 `npm run lint`, `npm run check`, `npm test` pass
- [ ] 7.2 `npx playwright test` passes
- [ ] 7.3 No references left to `bg-cosmic`, `Welcome.astro`, `LibBadge` or `template.png`
- [ ] 7.4 Prettier check passes on the edited documents
- [ ] 7.5 PR merged with `ci`, `db-tests` and `e2e` green

#### Manual

- [ ] 7.6 All 12 screens reviewed at 390 px and 1440 px after the cleanup
- [ ] 7.7 Production after the merge shows the new design end to end
