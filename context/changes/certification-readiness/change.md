---
change_id: certification-readiness
title: Certification readiness — README, rider name, demo data and doc consistency
status: implementing
created: 2026-09-10
updated: 2026-09-11
archived_at: null
---

## Notes

Last change before the 10xDevs certification submission (deadline 2026-09-14
23:59). Closes the gap between what the reviewer will see and what the project
actually is. Scope was established by an audit on 2026-09-10 against the
certification requirements (prework 4.2 + M4L1) and against `prd.md`.

### Scope — eight items, ordered by weight

1. **README** (`README.md`) — still the starter's "10x Astro Starter" text.
   It is the first file the reviewer opens. Needs: what the app does, the two
   roles, stack, local run (Docker + `npx supabase start`), how to run each
   test layer, production URL, demo accounts, and one line stating that sign-up
   needs no email confirmation.
2. **Rider name at sign-up** (FR-005, must-have, the only unimplemented
   functional requirement). `profiles.full_name` exists and
   `src/lib/bookings/queries.ts` already reads it, but the sign-up form never
   collects it, so the stable's day list renders "(bez nazwiska)". Needs a
   field in `SignUpForm.tsx`, the schema in `src/lib/auth/schemas.ts`, and
   `options.data.full_name` in `signUpOutcome`. The database trigger from F-01
   already maps `raw_user_meta_data ->> 'full_name'` onto the profile row, so
   no migration.
3. **Inverted flag on the confirmation page** (`src/pages/auth/confirm-email.astro`
   line 11). `const isAutoConfirmed = import.meta.env.DEV` makes production
   claim "Wysłaliśmy link potwierdzający", while confirmation is disabled on
   both sides (`enable_confirmations = false` locally, `mailer_autoconfirm`
   remotely — verified on production 2026-09-10: sign-up returns 302 straight
   to the role's home route). The page sits outside the flow, but it states
   something untrue. One-line fix; the comment right above it already describes
   the correct behaviour.
4. **Roadmap status** (`context/foundation/roadmap.md` frontmatter) — `status:
draft` while all seven slices are `done`.
5. **GitHub issues** — #1, #6, #7, #8 still open for work long since archived.
   Close with a comment naming the merge commit.
6. **Deployment plan path** — the plan lives at
   `context/changes/deployment/deployment-plan.md`; M1L5 expects
   `context/deployment/deploy-plan.md`.
7. **Production demo data** (manual, no code) — the last schedule on production
   is 2026-09-08, so every rider sees "Ośrodek nie ułożył grafiku na ten
   dzień." A reviewer signing up as a rider would find an app with no bookable
   slots. Needs a demo stable account with horses and a schedule covering the
   next seven days, plus a demo rider account.
8. **Cleanup of audit accounts** (manual) — delete
   `cert-check-1789075322559@example.com` and
   `cert-check-networkidle-1789075352827@example.com` from Supabase Auth;
   they were created while verifying the sign-up flow.

### Out of scope (hard)

- No visual changes. The redesign shipped in `ui-redesign` (archived
  2026-09-10) and its locator contract in `AGENTS.md` §Design stands.
- No new features beyond FR-005. No changes to `src/pages/api/bookings/**`,
  `src/pages/api/schedule/**`, `src/lib/bookings/**`, `src/lib/schedule/**`
  or `supabase/migrations/**`.
- Email confirmation stays off. It is not a certification requirement — the
  requirement is an access-control mechanism, which login plus roles plus RLS
  already satisfies.

### Contracts to protect

- Every text the e2e suite locates by role or label stays byte-identical
  (`AGENTS.md` §Design, `e2e/*.spec.ts`). Adding a field to the sign-up form
  must not rename "Adres e-mail", "Hasło", "Powtórz hasło", the role radios or
  the "Załóż konto" button.
- `signUpSchema` currently drives both validation and the endpoint; adding a
  required field changes an existing contract, so the new field must be
  optional or the seeded e2e sign-up path must be updated in the same phase.

### Execution notes for the plan

- Item 2 is TDD-able: the first red test can be named in one sentence
  ("rejestracja przekazuje podane imię w `options.data.full_name`, a lista
  zapisów ośrodka pokazuje je zamiast «(bez nazwiska)»"). Drive that phase with
  `/10x-tdd`; everything else with `/10x-implement`.
- Items 7 and 8 are manual gates — they belong in a phase's `Manual` success
  criteria, not in `Changes Required`.
- Oracle for item 2 is `prd.md` FR-005, not the current UI.

### Verification

- `npm run lint`, `npm run check`, `npm test` after every phase.
- `npx playwright test` green after the sign-up form changes (local Supabase
  up, seed reset today).
- Manual: production sign-up as a rider ends on `/jezdziec` with a non-empty
  slot list for at least one day in the coming week.
