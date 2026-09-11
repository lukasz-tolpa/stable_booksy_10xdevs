# Certification Readiness — Plan Brief

> Full plan: `context/changes/certification-readiness/plan.md`

## What & Why

The MVP is finished and deployed, but the repository and the live site still
present it badly: the README describes the starter template, one must-have
requirement (the rider's name on the stable's day list) was never implemented,
one page claims to send an email it does not send, and production has no
bookable day. This change closes that gap before the 10xDevs certification
submission on 2026-09-14.

## Starting Point

Seven roadmap slices archived, three test layers required on `main`, the
redesign live since 2026-09-10. `profiles.full_name` exists, the sign-up
trigger already maps it, and the whole read path renders it — only the write
side is missing, so every rider shows as `(bez nazwiska)`. README is the
starter's file and documents a `/dashboard` route that does not exist.
Production's last schedule was 2026-09-08.

## Desired End State

A reviewer reads a Polish README, follows it to the live URL, registers in
seconds without a mailbox, finds a stable with a month of open slots, books a
ride, and the stable's day list names them. Nothing in the repository claims
something the code does not do.

## Key Decisions Made

| Decision                            | Choice                             | Why (1 sentence)                                                                                                                                     | Source      |
| ----------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Name field at sign-up               | Required                           | FR-005 is must-have, and an optional field the reviewer skips reproduces the exact gap we are closing.                                               | Plan        |
| Existing nameless accounts          | Leave them, fallback stays         | A profile-editing screen is a new feature three days before the deadline; the fallback and its unit test remain correct for legacy rows.             | Plan        |
| README language                     | Polish                             | The reader is a Polish reviewer and the product's interface is Polish, even though the agent-facing docs are English.                                | Plan        |
| Production demo data                | Entered by hand, thirty days out   | No new code and no production secrets, and thirty days outlast a feedback window that may run to the end of September.                               | Plan review |
| Demo credentials in a public README | Published, and labelled disposable | The data is fabricated and the accounts own nothing but themselves, so the cost of a stranger editing the demo is a schedule refresh, not a breach.  | Plan review |
| Old `cert-test-*` accounts          | Deleted in Phase 4                 | They have no name and their addresses advertise them as test data; deciding now keeps a late phase from editing the README an earlier one committed. | Plan review |
| Database work                       | None                               | The `handle_new_user` trigger already writes `full_name` from user metadata, so only the client must send it.                                        | Plan        |
| Execution mode                      | TDD for Phase 1 only               | The metadata payload has no test today and the first red assertion is nameable in one sentence; the rest is documentation.                           | Plan        |

## Scope

**In scope:** the name field end to end (schema, endpoint, form, metadata,
unit tests, both e2e touchpoints); a Polish README; the inverted flag on the
confirmation page; roadmap status; the deployment-plan path; four GitHub
issues; production demo accounts, horses and a week of schedule.

**Out of scope:** migrations and seed data; profile editing; re-enabling email
confirmation; any visual change; any change under `src/pages/api/bookings/**`,
`src/pages/api/schedule/**`, `src/lib/bookings/**`, `src/lib/schedule/**`;
scripted production seeding; manual SQL against production.

## Architecture / Approach

The name travels the path the schema already anticipates: form field →
`signUpSchema` → endpoint → `signUpOutcome` → `options.data.full_name` →
existing database trigger → `profiles.full_name` → the read path that is
already complete. Phase 1 carries every risk and goes first, test-first, with
its two end-to-end touchpoints updated in the same commit so the suite never
sits red. Phases 2 and 3 cannot break the build. Phase 4 is manual and depends
on Phase 1 being deployed.

## Phases at a Glance

| Phase                           | What it delivers                                           | Key risk                                                                                                       |
| ------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1. Rider name at sign-up        | FR-005 implemented and proven                              | Two existing test contracts pin today's gap; a required field breaks e2e session setup unless updated together |
| 2. README and confirmation page | A repository that describes itself honestly                | Rewriting prose that already contains accurate sections — the Deployment and CI parts must survive             |
| 3. Repository consistency       | Roadmap status, plan path, closed issues, the merge itself | A `git mv` that leaves a stale reference behind                                                                |
| 4. Production demo data         | A reviewer can see the product work                        | Manual, and it cannot start until Phase 3's merge is live                                                      |

**Prerequisites:** Docker running with the local Supabase stack and a seed
loaded today (Phases 1 and 2 verification); Supabase dashboard access
(Phase 4); criterion 3.4 checked, meaning Phases 1 to 3 are merged and
published, before Phase 4 begins.

**Estimated effort:** roughly one session for Phase 1, one for Phases 2 and 3
together, half an hour of clicking for Phase 4.

## Open Risks & Assumptions

- The sign-up schema's existing assertion reads the _first_ validation issue;
  adding a field ahead of it breaks the test for the wrong reason unless the
  shared fixture is updated.
- Playwright locates password and e-mail fields with strict labels, so the new
  label must not contain "hasło" or "e-mail".
- Demo data is still perishable, only less so: thirty days covers the expected
  feedback window, but a schedule has an end date either way.
- The demo credentials sit in a public repository, so anyone can log in as the
  demo stable and empty the schedule. Nothing of value is exposed, but the
  demo may need a refresh before the review.
- The production demo accounts use `@example.com`, matching the accounts already
  in use; if the reviewer expects deliverable addresses this would need
  revisiting, but with confirmation disabled nothing is ever sent.

## Success Criteria (Summary)

- A rider registered from scratch on production is named on the stable's day
  list, and no path creates a nameless account any more.
- Every statement in the README is true, in Polish, and every command in it runs.
- A reviewer who follows the README alone can book a ride on production without
  asking a question.
