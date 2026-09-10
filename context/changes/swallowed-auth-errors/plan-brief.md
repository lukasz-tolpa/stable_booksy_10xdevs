# Swallowed Auth Errors — Plan Brief

> Full plan: `context/changes/swallowed-auth-errors/plan.md`

## What & Why

Several places on the auth path drop the result of a dependency call and answer as if
it succeeded, or blame the wrong cause: sign-out always says "done" even when the
session survives, sign-in and the middleware turn a database outage into "your account
is broken" and destroy the session, sign-in/sign-up forward raw English provider text
(or `fetch failed` / `{}`) to the form, and six pages swallow load errors without a
trace. The PRD requires a Polish interface and test-plan §6.4 forbids provider text;
this is the M3L5 test-driven bug-fix for that class of defect.

## Starting Point

`src/lib/db-errors.ts` and `src/lib/bookings/errors.ts` already show the correct
pattern (duck-typed readers, closed Polish set keyed by code, closed-set test). Nothing
in `src/` logs; no unit test covers the auth endpoints or middleware; e2e covers only
the happy path. auth-js 2.105 exposes `error.code` and returns a sign-out error before
removing the session on most failures.

## Desired End State

A wrong password, an existing e-mail, a weak password, a rate limit or a provider outage
each produce one specific Polish sentence. A failed sign-out leaves the user visibly
logged in on `/` with a banner. A database error while reading the profile keeps the
session and says "chwilowy problem"; a missing role still signs out with the account
message. Sign-up without a session sends the user to sign-in with a confirmation note
instead of bouncing silently. Every dropped error is logged with derived fields only.

## Key Decisions Made

| Decision                   | Choice                                                                                              | Why (1 sentence)                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Scope                      | Brief's 5 findings + sign-up no-session bounce + middleware `getUser` error                         | Same defect class in the same files; leaving two known holes would be odd                       |
| Failed sign-out UX         | Stay logged in, banner on `/` via `?error=`, log                                                    | Tells the truth; reuses the project's message transport                                         |
| Profile query error        | Outage sentence, session kept, log; missing role unchanged                                          | A transient failure must not destroy a valid session or blame the account                       |
| Existing e-mail on sign-up | "Konto z tym adresem już istnieje. Zaloguj się."                                                    | GoTrue already reveals existence (422); usability wins                                          |
| Logging                    | `src/lib/log.ts` `logError(scope, error, sink)`, derived fields only, single `console.error`        | One API for nine sites; Sentry (task 2) swaps one line                                          |
| Testability                | Pure helpers in `src/lib/auth/session.ts` taking the client; structural stub in tests, no `vi.mock` | Red test in one line; matches "inject dependencies" convention; middleware untestable otherwise |
| Test layers                | Unit + hermetic stub only; e2e as regression                                                        | Partial failures are unreachable through real infra (M3L2)                                      |
| Message transport          | `?error=` query string everywhere, incl. the sign-up confirm note on the sign-in form               | No new mechanism before the 2026-09-14 deadline                                                 |

## Scope

**In scope:** `src/lib/log.ts`, `src/lib/auth/errors.ts`, `src/lib/auth/session.ts` (+
tests); `signin.ts`, `signup.ts`, `signout.ts`, `src/middleware.ts`, `src/pages/index.astro`;
`logError` in six SSR pages; test-plan §6.4/§6.5, AGENTS.md, `lessons.md`; PR + merge.

**Out of scope:** Sentry; Supabase Auth configuration and `confirm-email.astro`; new
e2e/db tests; React island changes; cookie clearing on failed sign-out; 503 pages;
anti-enumeration masking; retries.

## Architecture / Approach

Endpoint/middleware → helper (`session.ts`, returns `{kind: …}`) → dictionary
(`errors.ts`, closed Polish set by `error.code`) → `?error=` redirect; every non-user
error also → `logError`. Phases 1–2 are TDD (`/10x-tdd`), 3–4 wiring and docs
(`/10x-implement`), all on `bugfix/swallowed-auth-errors`, merged by PR under the ruleset.

## Phases at a Glance

| Phase                                | What it delivers                                             | Key risk                                                                     |
| ------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 1. Log seam + auth dictionary (TDD)  | `log.ts`, `auth/errors.ts`, closed-set tests                 | Choosing sentences that are specific without leaking provider wording        |
| 2. Session helpers on a stub (TDD)   | `auth/session.ts` with every failure branch proven           | Stub drift from the real client chain (`from().select().eq().maybeSingle()`) |
| 3. Wiring + `/` banner               | Endpoints/middleware use helpers; e2e green; manual sabotage | Middleware redirect loops; e2e `auth.setup` timing                           |
| 4. Page logging, docs, lesson, merge | Six pages log; §6.4/AGENTS/lessons updated; PR merged        | Docs over-claiming (keep them to what shipped)                               |

**Prerequisites:** local Supabase stack for Phase 3 manual checks and e2e; owner rights for the PR merge.
**Estimated effort:** ~2 sessions across 4 phases; must fit before 2026-09-14.

## Open Risks & Assumptions

- `error.code` values are taken from auth-js 2.105.3's `error-codes.d.ts`; a GoTrue
  version behind Supabase Cloud could emit codes the dictionary does not know — they
  fall to the per-action fallback and get logged.
- The outage-after-sign-in path leaves a valid session while showing the sign-in form;
  accepted as the honest trade-off.
- `SIGNUP_CONFIRM_MESSAGE` is rendered by the sign-in form's error box (styling reads as
  an error); only reachable if confirmations are ever enabled.

## Success Criteria (Summary)

- No `error.message` reaches `?error=` from auth; all outcomes are Polish and specific.
- A refused sign-out, a profile outage, an expired session and a no-session sign-up
  each have a red-then-green test and a truthful message.
- `npm test`, lint, check and e2e green; every swallowed site logs.
