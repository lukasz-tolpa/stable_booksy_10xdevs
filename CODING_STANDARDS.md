# Coding Standards

Rules a reviewer applies to a diff. Each one is a judgement call that tooling cannot make.

## Already enforced — skip in review

- Formatting, import order, unused code, type errors: Prettier, ESLint (`npm run lint`), `astro check` (`npm run check`).
- Colour and font literals outside `src/styles/global.css`: `scripts/check-tokens.mjs` (part of `npm run lint`).
- Database guarantees and the rider loop: `npm run test:db`, `npm run test:e2e`.

A mechanical rule that keeps coming up in review belongs in one of these checks, not in this file.

## Structure

- **One place computes.** A page or component that derives a number, sorts rows or picks a label from raw data is doing the work of its `src/lib/<area>/` module. The module returns a view model; markup renders it.
- **One formatter per kind of value.** Numbers and hours go through `src/lib/format.ts`; error text goes through the area's `errors.ts`. A second inline formatter is a finding.
- **Shared blocks before new markup.** `Card`, `EmptyState`, `FailureState`, `NoticeCard`, `RoleBadge`, `DayNav`, `BarChart` in `src/components/ui/`. A hand-built surface with border, radius and shadow is a re-cut `Card`.
- **`EmptyState` is not `FailureState`.** "Nothing to show" and "we could not load it" get different blocks and different copy.
- **Domain names.** Identifiers, test descriptions and UI copy use the terms in `GLOSSARY.md`; a synonym for a glossary term is a finding.

## Dependency calls

- Every `await supabase.*` / `await client.*` reads its result and branches on it. A dropped `error` is a finding.
- Provider text never reaches the UI. Codes map through the area's closed Polish set (`src/lib/<area>/errors.ts`).
- A non-user error is logged with `logError(scope, error)` from `src/lib/log.ts`; SSR pages log in their `catch` as `page:<route>`.
- A response claims success only after the dependency confirmed it: a mutation reads the row back before redirecting to `?sukces=1`.
- API routes set `prerender = false` and validate input with zod before the first mutation.

Background: `context/foundation/lessons.md`, `context/foundation/test-plan.md` §6.4.

## Data and access

- Ownership is enforced twice: an explicit `rider_id` / `stable_id` filter in the query and an RLS policy proven in `supabase/tests/`.
- A migration that changes a table, policy or trigger comes with a change to a script in `supabase/tests/`.
- Code that shows a rider next to a booking handles `rider_id` NULL (ADR-0001), and shows such riders pooled, never individually.

## Tests

- A test asserts behaviour a user or caller can observe, through the module's public function. A test that pins a private helper's shape is a finding.
- Time and other ambient values arrive as defaulted parameters; a mock or fake timer means the seam is missing.
- A change under `src/pages/**` that adds a user-visible outcome has an e2e assertion for it, or the PR says why not.
- e2e locators are role, label and exact text. New prose on a screen is checked against the locator traps in `context/foundation/test-plan.md` §6.3.

## Visual

- Chestnut appears at most twice per screen (`DESIGN.md` §7).
- Every chart carries its data as a table inside `<details>`.
- A screen works at 390 px without horizontal page scroll.
- Tailwind classes are combined with `cn()` from `@/lib/utils`.
