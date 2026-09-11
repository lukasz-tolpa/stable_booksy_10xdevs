# Certification Readiness Implementation Plan

## Overview

Close the last gap between what the certification reviewer will see and what
the project actually is. One functional requirement (FR-005, the rider's name
on the stable's day list) is implemented test-first; everything else is
documentation that currently states things the code does not do, plus the
production data a reviewer needs in order to see the product work at all.

## Current State Analysis

The MVP is complete and deployed. All seven roadmap slices are archived, three
test layers are required checks on `main`, and the redesign shipped on
2026-09-10. What remains is not feature work — it is the difference between a
finished product and a _presentable_ one.

- **FR-005 is the only unimplemented must-have.** `profiles.full_name` exists
  (`supabase/migrations/20260810090000_identity_and_stables.sql:31`) and the
  sign-up trigger already maps it from user metadata
  (`…:138-166`, `nullif(new.raw_user_meta_data ->> 'full_name', '')`). The
  read path is complete too: `src/lib/bookings/queries.ts:66,80` selects it,
  `src/lib/bookings/rows.ts:18,29` applies the `(bez nazwiska)` fallback, and
  `src/pages/osrodek/zapisy.astro:111` renders it. **Only the write side is
  missing** — nothing ever puts a name into `options.data`.
- **Two test contracts pin today's gap.** `e2e/rider-loop.spec.ts:73-74`
  asserts the stable's day list reads `(bez nazwiska)` for a freshly
  registered rider, and `e2e/auth.setup.ts:21-34` creates both rider sessions
  through the real registration form. A required field breaks the second and
  invalidates the first.
- **README describes a different project.** It is the starter's file: the
  title is "10x Astro Starter", the clone URL points at
  `przeprogramowani/10x-astro-starter`, and it documents a `/dashboard` route
  and a `PROTECTED_ROUTES` array — neither exists (the real guard is
  `routeGuardFor` in `src/lib/auth/roles.ts`). Its "Email confirmation in local
  development" section claims Supabase requires confirmation by default, while
  this project disables it on both sides. The Deployment and CI sections, by
  contrast, are accurate and project-specific.
- **`src/pages/auth/confirm-email.astro:11`** picks its message from
  `import.meta.env.DEV`, so in production the page says an email was sent while
  the comment three lines above states that confirmation is off everywhere.
  Verified on production 2026-09-10: sign-up answers 302 straight to the role's
  home route, no mail involved.
- **Production has no bookable day.** The last schedule is 2026-09-08, so every
  rider sees "Ośrodek nie ułożył grafiku na ten dzień." A reviewer signing up
  today would find an app with nothing to book.
- **Repository metadata lags.** `roadmap.md` frontmatter still says
  `status: draft`; GitHub issues #1, #6, #7 and #8 are open for archived work;
  the deployment plan sits at `context/changes/deployment/deployment-plan.md`
  while M1L5 expects `context/deployment/deploy-plan.md`.

### Key Discoveries:

- The database needs no migration — `handle_new_user` already writes
  `full_name` (`supabase/migrations/20260810090000_identity_and_stables.sql:155`).
- `FormField` derives the POST field name from `id`
  (`src/components/auth/FormField.tsx:52`) and renders `<label htmlFor={id}>`
  (`:45`), so a new field is addressable by `getByLabel` with no extra wiring.
- `src/lib/auth/session.test.ts:173-203` exercises `signUpOutcome` but never
  inspects the `options.data` payload — the metadata contract is currently
  untested, which is exactly where the first red test goes.
- `supabase/seed.sql:29,38,47,56` already sets `full_name` for all four seeded
  users, and the database tests resolve riders **by name**
  (`supabase/tests/rls_isolation.sql:107,112`,
  `supabase/tests/concurrent_double_booking.sh:48-49`). The seed must not change.
- `src/lib/bookings/rows.test.ts:39-41` pins the `(bez nazwiska)` fallback.
  That test stays valid — legacy profiles (including the current production
  accounts) keep a null name.

## Desired End State

A reviewer opens the repository, reads a Polish README that describes Stable
Booksy, follows it to a live URL, registers in ten seconds without touching a
mailbox, sees a stable with a schedule covering the coming week, books a ride,
and the stable's day list names them. Nothing in the repository claims
something the code does not do.

Verify by: registering a fresh rider on production, completing the booking
loop, and confirming the stable's "Zapisy dnia" shows the rider's name rather
than `(bez nazwiska)`.

## What We're NOT Doing

- No profile-editing screen. Existing accounts without a name keep the
  `(bez nazwiska)` fallback; the fallback and its unit test stay.
- No changes to `supabase/migrations/**` or `supabase/seed.sql`. The trigger
  already maps the field, and the database tests resolve riders by the seeded
  names.
- No manual SQL against production data.
- No re-enabling of email confirmation. It is not a certification requirement;
  the requirement is an access-control mechanism, satisfied by login, roles and
  RLS.
- No redesign work. The `ui-redesign` locator contract in `AGENTS.md` §Design
  stands. The one visual delta in this change is the new sign-up field, which
  follows the existing `FormField` pattern and is verified like any other field.
- No new features beyond FR-005. `src/pages/api/bookings/**`,
  `src/pages/api/schedule/**`, `src/lib/bookings/**` and `src/lib/schedule/**`
  are untouched.
- No scripted production seeding. Demo data is entered by hand, which doubles
  as the manual verification of the deployed loop.

## Implementation Approach

Phase 1 carries all the risk and goes first, test-first: the metadata payload
is the contract, and it currently has no test at all. Its e2e counterparts are
updated in the same phase so the suite never sits red between commits. Phases 2
and 3 are documentation and cannot break the build. Phase 4 is a manual gate on
production and depends on Phase 1 being deployed, so that the demo rider is
created with a name.

Demo credentials are fixed here so Phase 2 can document them before Phase 4
creates them:

| Account | E-mail                      | Password    | Name       |
| ------- | --------------------------- | ----------- | ---------- |
| Stable  | `demo.osrodek@example.com`  | `sekret123` | Marta Demo |
| Rider   | `demo.jezdziec@example.com` | `sekret123` | Jan Demo   |

Demo stable: **Stadnina Demo**, Kraków, horses Bella, Grom, Iskra.

## Critical Implementation Details

**The sign-up schema test is order-sensitive.**
`src/lib/auth/schemas.test.ts:37-43` asserts that the _first_ validation issue
for mismatched passwords has `path: ["confirmPassword"]`. The shared fixture
`validSignUp` (`:5-10`) must gain a valid name, otherwise a missing-name issue
sorts ahead of it and the assertion fails for the wrong reason.

**Label collisions break strict-mode locators.** The suite uses
`getByLabel("Hasło", { exact: true })` and `getByLabel("Adres e-mail")`. A label
of "Imię i nazwisko" is safe; anything containing "hasło" or "e-mail" is not.
`AGENTS.md` §Design records the same trap for prose repeating a validation
message.

**Trim client-side, not just in the database.** The trigger's `nullif` turns an
empty string into NULL, but a whitespace-only name would survive as
whitespace. The schema trims before the length check, mirroring
`newStableSchema` (`src/lib/auth/schemas.ts:36-39`).

---

## Phase 1: Rider name at sign-up

### Overview

Collect the rider's name during registration and carry it into the profile, so
the stable's day list identifies who booked. Driven test-first: the first red
test asserts the metadata payload, which no test covers today.

### Changes Required:

#### 1. Validation schema

**File**: `src/lib/auth/schemas.ts`

**Intent**: Make the name a required part of sign-up so no new account can be
created without one.

**Contract**: `signUpSchema` gains a `fullName` field — trimmed string, minimum
length 1, Polish message in the same voice as the neighbouring fields. Follow
the trim pattern already used by `newStableSchema`. `SignUpInput` picks the
field up through `z.infer`.

#### 2. Sign-up session helper

**File**: `src/lib/auth/session.ts`

**Intent**: Carry the name to Supabase as user metadata, where the existing
database trigger will copy it onto the profile row.

**Contract**: `signUpOutcome`'s `input` parameter gains `fullName: string`, and
the `options.data` object passed to `client.auth.signUp` gains
`full_name: input.fullName` alongside the existing `role`. The `SessionClient`
interface at `:68-73` already types `options.data` as an open record, so no
interface change is needed.

#### 3. Sign-up endpoint

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Read the new form field and forward it, with the same validation
path as every other field.

**Contract**: The `signUpSchema.safeParse` object gains
`fullName: formValue(form, "fullName")`, and the destructure plus the
`signUpOutcome` call carry it through. No new error branch — a missing name is
an ordinary validation failure returning `?error=` with the Polish message.

#### 4. Sign-up form

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Add the field to the form and repeat its validation message
client-side, so a user with JavaScript sees the same sentence as one without.

**Contract**: A `FormField` with `id="fullName"` and
`label="Imię i nazwisko"`, placed between `RoleSelect` and the e-mail field,
with a lucide `User` icon to match the existing field pattern. `FormField`
derives the POST name from `id`, so no `name` prop is needed. Local state and a
`validate()` branch mirror the schema's message exactly, following the existing
comment at `:36-38`.

#### 5. Schema unit tests

**File**: `src/lib/auth/schemas.test.ts`

**Intent**: Pin the new requirement and keep the existing order-sensitive
assertion honest.

**Contract**: The `validSignUp` fixture gains a valid `fullName`. New cases
reject a missing name and a whitespace-only name, each asserting the Polish
message. Oracle is FR-005 in `context/foundation/prd.md`, not the form.

#### 6. Metadata payload test — the first red test

**File**: `src/lib/auth/session.test.ts`

**Intent**: Prove the name actually reaches Supabase. This is the assertion
that fails first and drives the whole phase.

**Contract**: Extend the existing stub client so the test can read the argument
handed to `signUp`, then assert that `options.data` carries both
`role` and `full_name` with the submitted name. Written and seen failing before
any production code changes. The shared `input` fixture at `:174` gains the
field too — it feeds five calls in this file, all of which stop typechecking
the moment `fullName` becomes required.

#### 7. End-to-end session setup

**File**: `e2e/auth.setup.ts`

**Intent**: Keep the browser suite able to register riders now that the form
has one more required field.

**Contract**: `e2e/helpers.ts` exports `RIDER_A_NAME` and `RIDER_B_NAME`
alongside the existing `RIDER_A_STATE` / `RIDER_B_STATE` constants.
`signUpRider` takes the matching name and fills
`getByLabel("Imię i nazwisko")` with it. Constants rather than a value returned
from setup: the setup project and the spec run as separate Playwright projects
and share nothing but files on disk, and the storage state carries cookies, not
a name.

#### 8. Rider loop expectation

**File**: `e2e/rider-loop.spec.ts`

**Intent**: Turn an assertion that pinned the gap into one that proves FR-005.

**Contract**: The stable day-list assertion at `:73-74` expects the registered
rider's name instead of `(bez nazwiska)`, and the comment above it is updated —
a freshly registered rider now _does_ have a name.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npm run check`
- Linting passes: `npm run lint`
- Browser suite passes: `npx playwright test` (local Supabase up, seed reset today)
- No occurrence of `(bez nazwiska)` remains in `e2e/`

#### Manual Verification:

- Sign-up form renders the new field in the DESIGN.md style at 390 px and 1440 px
- Submitting an empty name shows the Polish message, with JavaScript disabled too
- After registering locally, the stable's "Zapisy dnia" names the rider

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Polish README and an honest confirmation page

### Overview

Make the repository describe this project rather than the starter, and stop the
confirmation page from claiming an email was sent.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Give the reader — a certification reviewer — an accurate Polish
description of the product, how to run it, how to test it, and how to log in to
the live version.

**Contract**: Rewrite in Polish. Keep and translate the accurate Deployment and
CI sections. Replace the starter identity (title, description, clone URL) with
Stable Booksy and this repository. Add: what the product does, the two roles,
the production URL, the demo credentials from the Implementation Approach
table, and a line stating that registration needs no email confirmation. Delete
the `/dashboard` row and the `PROTECTED_ROUTES` sentence from the auth-routes
table; name `routeGuardFor` in `src/lib/auth/roles.ts` as the real guard. Add
`/jezdziec` and `/osrodek` routes. Correct the email-confirmation section:
confirmation is off locally (`enable_confirmations`) and remotely
(`mailer_autoconfirm`), so no dashboard toggle is needed.

This repository is public, so the demo credentials are readable by anyone and
the demo stable can be edited by anyone who finds them. Say so in one sentence:
the demo data is disposable, the reader is welcome to register their own
account instead, and the schedule may need refreshing if someone has emptied
it. No production secret is exposed — the data is fabricated and the accounts
own nothing but themselves.

#### 2. Confirmation page

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Say what is true. Auto-confirmation is on in every environment, so
the page has one message, not two.

**Contract**: Drop the `import.meta.env.DEV` branch at `:11` and keep only the
"Konto założone" content. The existing comment at `:6-10` already documents
why; extend it to record that the branch was removed because the flag was
inverted in production. No layout or copy changes beyond removing the unused
branch.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run check`
- Linting passes: `npm run lint`
- Formatting is clean: `npx prettier --check README.md src/pages/auth/confirm-email.astro`
- README mentions no `/dashboard` and no `PROTECTED_ROUTES`

#### Manual Verification:

- README read end to end: every command in it actually runs
- `/auth/confirm-email` on a local preview shows "Konto założone"

---

## Phase 3: Repository consistency

### Overview

Bring the project's own bookkeeping in line with reality.

### Changes Required:

#### 1. Roadmap status

**File**: `context/foundation/roadmap.md`

**Intent**: The roadmap is finished; the frontmatter should say so.

**Contract**: `status: draft` becomes `status: done`, `updated` becomes today.
No change to the slice table — every row already reads `done`.

#### 2. Deployment plan location

**File**: `context/changes/deployment/deployment-plan.md` →
`context/deployment/deploy-plan.md`

**Intent**: Put the deployment plan where the workflow expects it, and empty a
change folder that was never a change.

**Contract**: `git mv` preserving history; the source folder
`context/changes/deployment/` is removed once empty. Update any reference to
the old path (check `AGENTS.md` and `context/foundation/infrastructure.md`).

#### 3. GitHub issues

**Intent**: Close tracking issues for work that shipped weeks ago.

**Contract**: Close #6, #7, #8 with a comment naming the archive folder and the
merge commit for each slice; close #1 (roadmap tracking) with a comment
pointing at `context/foundation/roadmap.md` and its `done` status. No code
change.

### Success Criteria:

#### Automated Verification:

- `context/deployment/deploy-plan.md` exists and `context/changes/deployment/` does not
- No reference to `deployment-plan.md` remains: `grep -rn "deployment-plan" --exclude-dir=.git .`
- Formatting is clean: `npx prettier --check context/foundation/roadmap.md`
- Pull request merged with `ci`, `db-tests` and `e2e` green

#### Manual Verification:

- `gh issue list --state open` returns nothing for the roadmap slices

---

## Phase 4: Production demo data

### Overview

Give the reviewer an account and a month of bookable days. Manual work against
production, gated on Phase 1 being deployed so the demo rider is created with a
name.

**Prerequisite**: criterion 3.4 is checked — the pull request carrying Phases 1
to 3 is merged and Cloudflare Workers Builds has published it. Until then the
production sign-up form has no name field and every criterion below fails.

### Changes Required:

No code. Operations against the live application, in this order:

1. Register `demo.osrodek@example.com` as a stable with the name from the
   Implementation Approach table; create **Stadnina Demo** in Kraków; add
   horses Bella, Grom and Iskra; set a schedule of 10–16 for each of the next
   thirty days. Thirty rather than seven: the submission window closes on
   2026-09-14 but feedback may arrive up to two weeks later, and a reviewer
   opening the app after the schedule runs out sees the same empty state this
   phase exists to remove.
2. Register `demo.jezdziec@example.com` as a rider.
3. Delete the throwaway accounts in the Supabase dashboard
   (Authentication → Users): `cert-check-1789075322559@example.com` and
   `cert-check-networkidle-1789075352827@example.com` from the sign-up audit,
   plus the older `cert-test-osrodek@example.com` and
   `cert-test-jezdziec@example.com`. None of them has a name and their
   addresses advertise that they are test data. Deleting the stable account
   cascades its stadnina away, which is intended — Stadnina Demo replaces it.
   Decided here so that no step in this phase edits the README that Phase 2
   already committed.

### Success Criteria:

#### Manual Verification:

- Production sign-up refuses an empty name with the Polish message
- A fresh rider registered on production reaches `/jezdziec` and sees Stadnina Demo
- Days across the coming month offer free slots, and booking one succeeds
- The stable's "Zapisy dnia" shows the rider's name, not `(bez nazwiska)`
- All four throwaway accounts are gone from Supabase Auth
- README credentials sign in successfully on production

---

## Testing Strategy

### Unit Tests:

- `signUpSchema` accepts a valid name, rejects a missing one and a
  whitespace-only one, and still reports mismatched passwords first.
- `signUpOutcome` passes `full_name` alongside `role` in `options.data`.
- The `(bez nazwiska)` fallback keeps its existing coverage in
  `src/lib/bookings/rows.test.ts` — legacy profiles still have no name.

### Integration Tests:

- None added. The database side is unchanged, and `npm run test:db` already
  covers the profile trigger and the RLS path that lets a stable read rider
  names.

### Manual Testing Steps:

1. Register a rider locally with a name; confirm the stable's day list shows it.
2. Submit the sign-up form with the name blank and JavaScript disabled; confirm
   the server returns the Polish message.
3. Open `/auth/confirm-email` on a preview build; confirm it says the account
   was created.
4. Run the production walkthrough listed in Phase 4.

## Migration Notes

No schema migration. Profiles created before this change keep `full_name` NULL
and continue to render through the `(bez nazwiska)` fallback; that is the
intended end state, not a temporary one.

## References

- Change notes: `context/changes/certification-readiness/change.md`
- Sign-up trigger: `supabase/migrations/20260810090000_identity_and_stables.sql:138-166`
- Locator contract: `AGENTS.md` §Design
- Unit-test conventions: `context/foundation/test-plan.md` §6.1
- Endpoint conventions: `context/foundation/test-plan.md` §6.4
- Dependency-call rule: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Rider name at sign-up

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Type checking passes: `npm run check`
- [x] 1.3 Linting passes: `npm run lint`
- [x] 1.4 Browser suite passes: `npx playwright test`
- [x] 1.5 No occurrence of `(bez nazwiska)` remains in `e2e/`

#### Manual

- [ ] 1.6 Sign-up form renders the new field in the DESIGN.md style at 390 px and 1440 px
- [ ] 1.7 Submitting an empty name shows the Polish message, with JavaScript disabled too
- [ ] 1.8 After registering locally, the stable's "Zapisy dnia" names the rider

### Phase 2: Polish README and an honest confirmation page

#### Automated

- [ ] 2.1 Type checking passes: `npm run check`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Formatting is clean on the edited documents
- [ ] 2.4 README mentions no `/dashboard` and no `PROTECTED_ROUTES`

#### Manual

- [ ] 2.5 README read end to end: every command in it actually runs
- [ ] 2.6 `/auth/confirm-email` on a local preview shows "Konto założone"

### Phase 3: Repository consistency

#### Automated

- [ ] 3.1 `context/deployment/deploy-plan.md` exists and `context/changes/deployment/` does not
- [ ] 3.2 No reference to `deployment-plan.md` remains anywhere in the repo
- [ ] 3.3 Formatting is clean on `context/foundation/roadmap.md`
- [ ] 3.4 Pull request merged with `ci`, `db-tests` and `e2e` green

#### Manual

- [ ] 3.5 `gh issue list --state open` returns nothing for the roadmap slices

### Phase 4: Production demo data

#### Manual

- [ ] 4.1 Production sign-up refuses an empty name with the Polish message
- [ ] 4.2 A fresh rider registered on production reaches `/jezdziec` and sees Stadnina Demo
- [ ] 4.3 Days across the coming month offer free slots, and booking one succeeds
- [ ] 4.4 The stable's "Zapisy dnia" shows the rider's name, not `(bez nazwiska)`
- [ ] 4.5 All four throwaway accounts are gone from Supabase Auth
- [ ] 4.6 README credentials sign in successfully on production
