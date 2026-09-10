<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Swallowed Auth Errors

- **Plan**: context/changes/swallowed-auth-errors/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-09-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Automated success criteria re-run at review time (all green): `npm test` (215), `npm run lint`, `npm run check`, single `console.error` in `src/lib/log.ts`, no module mocks in `session.test.ts`, no `error.message` in `src/pages/api/auth/*`, six `logError` calls, Prettier on the docs, `npm run test:e2e` 5/5.

## Findings

### F1 — "expired" branch unreachable for a revoked session; test stubs a shape auth-js never returns

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth/session.ts:101-114, src/lib/auth/session.test.ts:109-120
- **Detail**: auth-js turns a GoTrue 403 `session_not_found` into `AuthSessionMissingError` and removes the session itself (fetch.js:76-81, GoTrueClient.js:2508-2513), so a revoked cookie lands in `isMissingSessionError` → anonymous: no "Sesja wygasła", no log. The stub `{ code: "session_not_found", status: 403 }` is a shape the real client never returns. `expired` is reachable only through refresh failures (`refresh_token_not_found`, `bad_jwt`).
- **Fix**: Restub with a refresh-failure shape, rename the test, and record in the `isMissingSessionError` comment that a revoked session is treated as anonymous because auth-js already cleared the cookie.
  - Strength: Test oracle back to provider truth; decision recorded.
  - Tradeoff: A revoked session still gets no message — an auth-js limitation.
  - Confidence: HIGH — read from auth-js 2.105.3.
  - Blind spot: Behaviour of other auth-js versions.
- **Decision**: FIXED — test restubbed with the refresh-failure shape (`AuthApiError` / `refresh_token_not_found`), renamed; `isMissingSessionError` comment records that a revoked session is treated as anonymous because auth-js already cleared the cookie

### F2 — `authFailureMessage` has no test and a hidden log dependency

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/auth/session.ts:35-43
- **Detail**: Owns the "which codes get logged" decision and the outage precedence, yet is untested; calls `logError` with the default sink so it cannot be tested without the console. Other helpers take their dependency as a parameter.
- **Fix**: Add `sink: LogSink = defaultSink` and three tests (outage → logged + `OUTAGE_MESSAGE`; user code → not logged; unknown code → logged).
- **Decision**: FIXED — `authFailureMessage(scope, error, action, sink?)`; three tests (outage → log + OUTAGE_MESSAGE, user error → no log, unknown code → log)

### F3 — PII can reach Workers logs through `message` for two GoTrue codes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth/errors.ts:36-43, src/lib/log.ts:45-50
- **Detail**: GoTrue interpolates the submitted address into `message` for `email_address_invalid` and `email_address_not_authorized`; neither is in `USER_ERROR_CODES`, so it is logged verbatim. `log.test.ts` proves only that the `email` field is dropped.
- **Fix**: Add both codes to `USER_ERROR_CODES` and redact `\S+@\S+` in `message` inside `logError` (with a test).
- **Decision**: FIXED — `email_address_invalid` / `email_address_not_authorized` added to the user-error set with their own sentence; `logError` redacts `\S+@\S+` in `message` (test)

### F4 — Throwing client not handled in `currentUser`, `signUpOutcome` and around `signInWithPassword`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth/session.ts:107-128, src/pages/api/auth/signin.ts:31
- **Detail**: auth-js re-throws anything that is not an `AuthError` (e.g. a cookie-adapter exception). `signOutUser` catches it; the other helpers and endpoints do not, so such a throw is still an unlogged 500, and in the middleware it would take down every request.
- **Fix**: Wrap `currentUser` (→ outage), `signUpOutcome` (→ error) and the `signInWithPassword` call like `signOutUser`, with "client throws" tests on the stub.
  - Strength: One rule for every helper; middleware resilient.
  - Tradeoff: A non-Auth exception surfaces as "chwilowy problem" but is logged.
  - Confidence: HIGH — re-throw behaviour read from GoTrueClient.js.
  - Blind spot: None significant.
- **Decision**: FIXED — try/catch in `currentUser` (→ outage), `signUpOutcome` (→ error), `resolveRole` (→ outage) and around `signInWithPassword` in signin.ts; stub `getUserThrows` / `signUpThrows` tests

### F5 — Every PostgREST error on the profile query is "outage", including permanent misconfiguration (42501)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth/session.ts:94-99
- **Detail**: `PostgrestError` has no `status`, so the ≥ 500 rule never applies; an RLS denial on the own profile reads as a transient problem (code is logged; no privilege gain).
- **Fix**: Acceptable for MVP; optionally map 42501/PGRST3xx to a distinct kind.
- **Decision**: ACCEPTED — MVP; recorded in follow-ups/review-fixes.md

### F6 — Outage after a successful sign-in bounces a logged-in user to the sign-in form

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signin.ts:44-48
- **Detail**: Planning decision; secure. UX oddity: login form with "Chwilowy problem" while a session exists; middleware logs a second entry on the sign-in page render.
- **Fix A ⭐ Recommended**: Redirect to `/?error=OUTAGE_MESSAGE` — the home banner exists and the Topbar shows the user as logged in.
- **Fix B**: Sign out on outage.
- **Decision**: FIXED via Fix A — sign-in outage after a verified password redirects to `/?error=OUTAGE_MESSAGE` (home banner, Topbar shows the session)

### F7 — `?error=` on `/` is a reflected-text surface (same class as existing pages)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/pages/index.astro:8-12
- **Detail**: No XSS, no open redirect; a crafted link can show arbitrary Polish text in a site banner. Already true on seven pages.
- **Fix**: Cross-cutting later: pass a key in `?error=` and look the sentence up server-side.
- **Decision**: ACCEPTED — cross-cutting follow-up recorded in follow-ups/review-fixes.md (key-based `?error=`)

### F8 — Rate-limit codes are deliberately not logged

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth/errors.ts:36-43
- **Detail**: The only user error that is also a credential-stuffing signal; visible in Supabase auth logs, not in the app log.
- **Fix**: Log a message-free `{ scope, code }` entry for rate-limit codes, or record the "no" in a comment.
- **Decision**: FIXED — rate-limit codes log a message-free `{ scope, code, status }` entry (`isRateLimited`), test added

### F9 — Inaccurate comments and docs (four small items)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/test-plan.md §6.4; src/lib/auth/session.ts:65; src/lib/auth/errors.ts:72-77; context/foundation/lessons.md:10
- **Detail**: (a) §6.4 "every `auth.*` call goes through a helper" — `signInWithPassword` is called directly; (b) "the only place querying profiles" — the middleware has its own `select("*")`; (c) `isTransportError` lacks the plan's `name === "AuthRetryableFetchError"` clause; (d) lesson: the path list landed in Context, `Applies to: all`.
- **Fix**: Three wording fixes plus the `name` clause in `isTransportError`.
- **Decision**: FIXED — §6.4 wording ("result … is classified by a helper"), `profileRoleLoader` comment, `isTransportError` name clause, lesson `Applies to` now lists skills + paths

### F10 — Post-edit hook does not know the new risk area `src/lib/auth/`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architecture
- **Location**: .claude/hooks/post-edit.mjs:25, AGENTS.md:53
- **Detail**: `RISK_AREAS` lists bookings/schedule/pages/api; edits under `src/lib/auth/` and `src/lib/log.ts` do not trigger `vitest related` although they carry tested contracts.
- **Fix**: Add `src/lib/auth/` to `RISK_AREAS` and to the AGENTS.md sentence.
- **Decision**: FIXED — `src/lib/auth/` and `src/lib/log.ts` added to RISK_AREAS in .claude/hooks/post-edit.mjs and to AGENTS.md
