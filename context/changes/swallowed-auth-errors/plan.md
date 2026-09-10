# Swallowed Auth Errors Implementation Plan

## Overview

Every call to a dependency on the auth path (GoTrue sign-in/sign-up/sign-out, the
`profiles` lookup, `getUser`) and on the six SSR data pages has its result checked, and
the user is told the true cause in Polish. Today sign-out always claims success,
`signin.ts` and the middleware turn a database outage into "your account is broken"
and destroy the session, sign-in/sign-up forward raw English provider text (or
`fetch failed` / `{}`), sign-up redirects without checking that a session came back,
and nothing on the server is logged. This is test-driven bug-fixing (M3L5): the red
test comes first, the oracle is the PRD ("interfejs po polsku") and test-plan §6.4 (no
`{}` or provider text), and partial failures real infra cannot trigger are proven with
a stub client (M3L2).

## Current State Analysis

- `src/pages/api/auth/signout.ts:4-10` — `await supabase.auth.signOut()` result ignored,
  always `redirect("/")`. auth-js returns the error **before** `_removeSession()` for any
  status other than 401/403/404, so the cookie survives and the Topbar still shows the
  user as logged in. `/` (`src/pages/index.astro`) does not read `?error=`.
- `src/pages/api/auth/signin.ts:28-32` and `signup.ts:34-42` — `error.message` from
  GoTrue passed verbatim into `?error=` (English; transport errors give `fetch failed`
  or `{}` via auth-js `_getErrorMessage`). `signin.ts:36-41` — profile lookup drops
  `error`; a failed query looks like a missing role: the fresh session is signed out
  (result ignored) and the user is told "Nie udało się ustalić rodzaju Twojego konta".
  `signup.ts:44-47` — redirects to the role home without checking `data.session`;
  with confirmations on, or GoTrue's anti-enumeration "no error, obfuscated user", the
  user bounces silently to `/auth/signin` (middleware, no `?error=`).
- `src/middleware.ts:21-30` — `getUser()` error and profile error dropped; an outage or
  an expired refresh token equals "anonymous" (redirect to sign-in without a message)
  or "unknown role" (sign-out + `BROKEN_SESSION_MESSAGE`).
- Six pages swallow the thrown error: `src/pages/jezdziec/index.astro:27`,
  `jezdziec/zapisy.astro:28`, `jezdziec/osrodki/[id].astro:60`, `osrodek/grafik.astro:36`,
  `osrodek/konie.astro:23`, `osrodek/zapisy.astro:40` — `catch { loadFailed = true }`.
  The failure state shown is correct; the cause is lost. No `console.*` exists in
  `src/`; `wrangler.jsonc` has `observability.enabled: true`.
- The correct pattern exists elsewhere: `src/lib/db-errors.ts` (duck-typed `errorCode` /
  `errorMessage`, tested for `{}`, `TypeError`, numeric codes), `src/lib/bookings/errors.ts`
  (closed Polish set keyed by code, `FALLBACK`), `src/lib/bookings/errors.test.ts` (closed
  set + `it.each` probes + `not.toMatch(/fetch|TypeError|duplicate key|violates|\{\}/)`).
- Provider facts (auth-js 2.105.3, verified in `node_modules`): `AuthError.code` is an
  `ErrorCode | string | undefined` (`invalid_credentials`, `email_not_confirmed`,
  `user_already_exists`, `email_exists`, `weak_password`, `over_request_rate_limit`,
  `over_email_send_rate_limit`, `request_timeout`, `session_not_found`, `bad_json`,
  `validation_failed`, …); `AuthError.status` is `number | undefined`; transport
  failures are `AuthRetryableFetchError` with `code: undefined`, `status: 0`;
  `signOut()` resolves `{ error: AuthError | null }`.
- Conventions: errors travel as Polish text in `?error=` and pages render it (test-plan
  §6.4); unit tests colocated `*.test.ts`, Polish `it()` names, no mocks/fake timers,
  dependencies injected as parameters (AGENTS.md "Testing"); ESLint `no-console: warn`,
  type-aware; every commit through lint-staged, every push through `npm test` +
  `npm run check`; `main` accepts only PR merges with green `ci`/`db-tests`/`e2e`.
- Tests today: `src/lib/auth/{schemas,roles}.test.ts` (no messages, no endpoints),
  `e2e/auth.setup.ts` (happy-path sign-up and sign-in only).

## Desired End State

- Sign-out that fails leaves the user visibly logged in on `/` with the message
  "Nie udało się wylogować. Spróbuj ponownie." in an error banner, and a log entry.
- Sign-in/sign-up failures show one sentence from a closed Polish set chosen by
  `error.code`; transport failures say "Chwilowy problem z połączeniem…"; nothing
  English, no `{}`, no `fetch failed` ever reaches `?error=`.
- A database error while reading the profile (sign-in or middleware) keeps the session,
  shows the outage sentence and logs; a genuinely missing/unknown role behaves as today
  (sign-out + "Nie udało się ustalić rodzaju Twojego konta…").
- Sign-up that returns no session sends the user to sign-in with "Konto utworzone.
  Potwierdź adres e-mail z wiadomości, a potem zaloguj się." instead of a silent bounce.
- Middleware distinguishes anonymous / expired session / provider outage on guarded
  routes: expired → "Sesja wygasła. Zaloguj się ponownie.", outage → the outage sentence;
  anonymous → redirect without message (as today).
- The six SSR pages still show their failure state and now log the original error.
- `src/lib/log.ts`, `src/lib/auth/errors.ts`, `src/lib/auth/session.ts` exist with unit
  tests; `npm test`, `npm run lint`, `npm run check`, `npm run test:e2e` green; §6.4 and
  AGENTS.md describe the auth mapping and the stub-client pattern; `lessons.md` carries
  the rule.

Verification of the whole: the sabotage steps in Phases 1–3 each go red then green; the
manual checks in Phase 3 show Polish text for a wrong password and an existing e-mail.

### Key Discoveries:

- `src/lib/db-errors.ts:14-25` — reuse `errorCode`/`errorMessage` for log entries and for
  reading GoTrue errors (they carry `code`/`message` fields too).
- `src/lib/bookings/errors.test.ts:44-64` — the closed-set test shape to copy.
- `src/lib/auth/roles.ts` — `isUserRole`, `homeRouteForRole`, `SIGN_IN_ROUTE`; the
  middleware's Polish sentence lives at `src/middleware.ts:13`.
- `src/components/Banner.astro:11` — `variant="error"` renders `role="alert"`;
  `src/layouts/Layout.astro:23-35` shows how a banner is placed above the slot.
- `src/pages/auth/signin.astro:5,16` / `signup.astro:5,16` — `?error=` → `serverError`
  prop → `ServerError.tsx` renders the string; no change needed there.
- `e2e/auth.setup.ts:31,56` — waits for `**/jezdziec` / `**/osrodek`; must stay green.
- `astro.config.mjs:20-21` — `SUPABASE_*` optional; `createClient` returns `null` when
  missing (the "Supabase nie jest skonfigurowany" branch stays as is).
- auth-js `_signOut` returns before `_removeSession()` on non-401/403/404 errors — the
  reason a failed sign-out leaves the cookie.

## What We're NOT Doing

- No Sentry or any external error sink (task 2, deadline 2026-09-14).
- No integration (`test:db`) or new e2e scenarios; the existing e2e suite is the
  regression gate.
- No change to Supabase Auth configuration, confirmation settings, rate limits, or the
  dormant `confirm-email.astro` page (test-plan §7).
- No client-side (React island) error handling changes; `ServerError.tsx` keeps rendering
  the string it gets.
- No anti-enumeration masking on sign-up: "Konto z tym adresem już istnieje" is shown
  (decision: GoTrue already reveals existence with a 422).
- No 503 pages, no flash cookies: `?error=` stays the transport.
- No local cookie clearing on failed sign-out (decision: tell the truth, stay logged in).
- No retry logic.

## Implementation Approach

Two TDD phases build the pure pieces (a log seam, the auth error dictionary, and
session helpers that take the client as a parameter and return discriminated results),
then one phase wires endpoints, middleware and the `/` banner and proves it with the
e2e regression plus manual sabotage, then one phase adds logging to the six pages and
syncs docs and the lesson. Work on branch `bugfix/swallowed-auth-errors`, land by PR.
Phases 1–2 run with `/10x-tdd` (the first red assertion is nameable); 3–4 with
`/10x-implement`.

## Critical Implementation Details

**Transport vs auth errors.** An `AuthRetryableFetchError` has `code: undefined` and
`status: 0`; an unknown code with a real HTTP status is an auth error the dictionary
does not know. Classify by `code`/`status`/`name`, never by `message` text.

**Outage after successful sign-in.** When `resolveRole` reports an outage right after
`signInWithPassword` succeeded, the session cookie is already set. Do not sign out;
redirect to `/auth/signin?error=<outage>` — on the next request the middleware
re-resolves the role. This is the chosen trade-off, not an oversight.

**Log entries carry only derived fields.** `logError` forwards `{ scope, name, code,
status, message }`, never the original object, so an e-mail from a request body or a
token from a cookie cannot land in Workers logs.

**No log for expected user errors.** `invalid_credentials`, `email_not_confirmed`,
`user_already_exists`/`email_exists`, `weak_password` and the rate-limit codes are user
errors, not incidents — do not log them. Log transport errors, unknown codes, failed
sign-outs, profile-query errors and page load failures.

---

## Phase 1: Log seam and the auth error dictionary (TDD)

### Overview

Two pure modules with their tests written first: a single place that writes to the
server log, and the closed Polish set for GoTrue error codes.

### Changes Required:

#### 1. Log seam

**File**: `src/lib/log.ts` (new) + `src/lib/log.test.ts` (new)

**Intent**: One function every swallowed site calls, so the format is uniform and a
future sink (Sentry) replaces one line.

**Contract**: `logError(scope: string, error: unknown, sink: (entry: LogEntry) => void = defaultSink): void`
where `LogEntry = { scope: string; name?: string; code?: string; status?: number; message?: string }`,
derived with `errorCode`/`errorMessage` from `@/lib/db-errors` plus `name` (from
`Error`) and numeric `status`. The default sink is the only `console.error` in `src/`
(one `eslint-disable-next-line no-console`). Never throws. Tests (red first): the
entry for `{ code: "23505", message: "duplicate key" }` has scope, code and message;
`it.each` over `{}`, `null`, `undefined`, `new TypeError("fetch failed")`, `"x"`,
`{ code: 42 }` never throws and always yields an entry with the scope; an input with
extra fields (`{ message: "m", email: "a@b", access_token: "t" }`) produces an entry
with exactly the five keys and no `email`/`access_token`.

#### 2. Auth error dictionary

**File**: `src/lib/auth/errors.ts` (new) + `src/lib/auth/errors.test.ts` (new)

**Intent**: Map GoTrue `error.code` to a closed Polish set and expose the shared
sentences other phases use.

**Contract**:

- Code constants: `INVALID_CREDENTIALS = "invalid_credentials"`,
  `EMAIL_NOT_CONFIRMED`, `USER_ALREADY_EXISTS = "user_already_exists"`,
  `EMAIL_EXISTS = "email_exists"`, `WEAK_PASSWORD`, `RATE_LIMITED` (both
  `over_request_rate_limit` and `over_email_send_rate_limit`), `REQUEST_TIMEOUT`.
- `type AuthAction = "signin" | "signup"`.
- `authErrorMessage(code: string | undefined, action: AuthAction): string` — closed set:
  invalid credentials → "Nieprawidłowy e-mail lub hasło."; not confirmed → "Adres e-mail
  nie został jeszcze potwierdzony. Sprawdź skrzynkę."; already exists (both codes) →
  "Konto z tym adresem już istnieje. Zaloguj się."; weak password → "Hasło nie spełnia
  wymagań bezpieczeństwa. Wybierz dłuższe hasło."; rate limited → "Zbyt wiele prób.
  Odczekaj chwilę i spróbuj ponownie."; `request_timeout` → `OUTAGE_MESSAGE`; anything
  else → per-action fallback ("Nie udało się zalogować. Spróbuj ponownie." /
  "Nie udało się utworzyć konta. Spróbuj ponownie.").
- Exported sentences: `OUTAGE_MESSAGE = "Chwilowy problem z połączeniem. Spróbuj ponownie za chwilę."`,
  `SIGN_OUT_FAILED_MESSAGE = "Nie udało się wylogować. Spróbuj ponownie."`,
  `SESSION_EXPIRED_MESSAGE = "Sesja wygasła. Zaloguj się ponownie."`,
  `SIGNUP_CONFIRM_MESSAGE = "Konto utworzone. Potwierdź adres e-mail z wiadomości, a potem zaloguj się."`,
  `BROKEN_ACCOUNT_MESSAGE` (moves the existing sentence from `signin.ts:40`) and
  `BROKEN_SESSION_MESSAGE` (moves `middleware.ts:13`).
- `isTransportError(error: unknown): boolean` — true when `code` is `undefined` and
  `status` is `0`/`undefined`, or `name === "AuthRetryableFetchError"`; false for any
  object carrying a string `code`.
- `isExpectedUserError(code: string | undefined): boolean` — the five user-error codes
  above (no log for those).
- Tests (red first, mirroring `bookings/errors.test.ts`): each known code yields its
  sentence; both "exists" codes yield the same sentence; the two actions differ only in
  the fallback; closed-set probe over known codes + `"42501"`, `""`, `"PGRST116"`,
  `"invalid_credentialsx"`, `undefined` — every output is in the set and
  `not.toMatch(/fetch|TypeError|Invalid login|rate limit|registered|\{\}/)`;
  `isTransportError` true for `{ name: "AuthRetryableFetchError", status: 0, message: "fetch failed" }`
  and `new TypeError("fetch failed")`, false for `{ code: "invalid_credentials", status: 400 }`;
  `isExpectedUserError` table.

### Success Criteria:

#### Automated Verification:

- Red first: `npx vitest run src/lib/log.test.ts src/lib/auth/errors.test.ts` fails before the modules exist, then passes
- `npm test` passes (existing 159 tests + new)
- `npm run lint` passes with exactly one `console.error` in `src/` (`grep -rn "console\." src` shows only `src/lib/log.ts`)
- `npm run check` passes

#### Manual Verification:

- Read the closed set once: every sentence is Polish, specific, and tells the user what to do next

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 2: Session helpers proven on a stub client (TDD)

### Overview

Pure functions that take the Supabase client as a parameter and return discriminated
results, so endpoints and middleware only map results to redirects. Partial failures
(sign-out refused, profile query error, `getUser` transport error, sign-up without a
session) are driven by a hand-written stub — real infra cannot trigger them.

### Changes Required:

#### 1. Session helpers

**File**: `src/lib/auth/session.ts` (new) + `src/lib/auth/session.test.ts` (new)

**Intent**: Give every auth dependency call one place where its result is inspected and
classified.

**Contract** (client type: `SupabaseClient<Database>` from `@/lib/supabase`'s return;
tests build a minimal structural stub and cast it once in a local `stubClient()`
helper — no `vi.mock`, no module mocking):

- `signOutUser(client): Promise<{ ok: true } | { ok: false; error: unknown }>` — wraps
  `auth.signOut()`; `error !== null` → `ok: false`; a thrown value is caught and
  returned the same way.
- `resolveRole(client, userId): Promise<{ kind: "role"; role: UserRole } | { kind: "no-role" } | { kind: "outage"; error: unknown }>`
  — `from("profiles").select("role").eq("id", userId).maybeSingle()`; query `error` →
  `outage`; `data` null or `!isUserRole(data.role)` → `no-role`; else `role`.
- `currentUser(client): Promise<{ kind: "user"; user: User } | { kind: "anonymous" } | { kind: "expired"; error: unknown } | { kind: "outage"; error: unknown }>`
  — `auth.getUser()`; `isTransportError(error)` → `outage`; any other `error` →
  `expired` (covers `session_not_found`, `refresh_token_not_found`, `bad_jwt`,
  `user_not_found`); no error and `user` null → `anonymous`.
- `signUpOutcome(client, input: { email; password; role }): Promise<{ kind: "session"; role } | { kind: "confirm" } | { kind: "error"; error: unknown }>`
  — `auth.signUp` with `options.data.role`; `error` → `error`; no error and
  `data.session === null` → `confirm`; else `session`.
- Tests (red first, one `it` per branch, Polish names, `it.each` where the shape
  repeats): stub returning `{ error: { status: 500, message: "boom" } }` → `signOutUser`
  is `ok: false` with that error; stub throwing → same; `{ error: null }` → `ok: true`.
  `resolveRole`: query error → `outage` (and the error is returned unchanged); `data:
null` → `no-role`; `role: "admin"` → `no-role`; `role: "rider"` → `role`. `currentUser`:
  `AuthRetryableFetchError`-shaped error → `outage`; `{ code: "session_not_found",
status: 403 }` → `expired`; `{ user: null }` → `anonymous`; user → `user`.
  `signUpOutcome`: `{ data: { user: {...}, session: null }, error: null }` → `confirm`;
  with session → `session`; error → `error`.
- The stub helper accepts per-call results, e.g. `stubClient({ signOut: { error: null },
profile: { data: { role: "rider" }, error: null }, getUser: …, signUp: … })`, and
  implements only the chain methods the helpers call.

### Adaptation (2026-09-10)

- `resolveRole` takes a `RoleLoader` (`(userId) => PromiseLike<{ data, error }>`) instead of
  the client: describing `from("profiles").select("role")…` with a narrow structural
  interface makes TypeScript hit ts2589 ("instantiation excessively deep") when the real
  PostgREST client is assigned to it. `SessionClient` covers only the `auth` surface
  (`asSessionClient` proves the real client fits at compile time) and
  `profileRoleLoader(client)` builds the loader from the real client in one place. Tests
  stub the loader with a function; nothing else changed.

### Success Criteria:

#### Automated Verification:

- Red first: `npx vitest run src/lib/auth/session.test.ts` fails before `session.ts` exists, then passes
- `npm test`, `npm run lint`, `npm run check` pass
- `grep -rn "vi.mock\|vi.fn\|useFakeTimers" src/lib/auth/session.test.ts` returns nothing (structural stub only)

#### Manual Verification:

- Read `session.test.ts` once: every `it` names a user-visible outcome, not an internal call

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 3: Wire endpoints, middleware and the `/` banner

### Overview

Replace the swallowing sites with the helpers and the dictionary, render a sign-out
failure on `/`, keep the e2e suite green, and prove the user-visible outcomes by hand.

### Changes Required:

#### 1. Sign-out

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Never claim a sign-out that did not happen.

**Contract**: `signOutUser(client)`; on `ok: false` → `logError("auth:signout", error)`
and `redirect("/?error=" + encodeURIComponent(SIGN_OUT_FAILED_MESSAGE))`; on `ok: true`
→ `redirect("/")` as today. Missing client → `redirect("/")` unchanged.

#### 2. Home page banner

**File**: `src/pages/index.astro`

**Intent**: Give `/` a place to show the sign-out failure (and any future `?error=`).

**Contract**: read `Astro.url.searchParams.get("error")`; when non-empty render
`<Banner variant="error">{error}</Banner>` above `<Welcome />` (same spoofable-query
convention as every other page, test-plan §6.4).

#### 3. Sign-in

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Polish message by code, honest cause for profile failures, session preserved
on outage.

**Contract**: `signInWithPassword` error → if `isTransportError(error)` or
`!isExpectedUserError(code)` then `logError("auth:signin", error)`; message =
`isTransportError ? OUTAGE_MESSAGE : authErrorMessage(errorCode(error), "signin")`.
Then `resolveRole(client, user.id)`: `outage` → log + `backToForm(OUTAGE_MESSAGE)`
(no sign-out); `no-role` → `signOutUser` (log if `ok: false`) + `backToForm(BROKEN_ACCOUNT_MESSAGE)`;
`role` → `redirect(homeRouteForRole(role))`.

#### 4. Sign-up

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Same mapping; no redirect into a role space without a session.

**Contract**: `signUpOutcome(client, { email, password, role })`: `error` → log when
transport/unknown, message as in sign-in with action `"signup"`; `confirm` →
`redirect("/auth/signin?error=" + encodeURIComponent(SIGNUP_CONFIRM_MESSAGE))`
(rendered by the sign-in form's message box; accepted simplification); `session` →
`redirect(homeRouteForRole(role))`.

#### 5. Middleware

**File**: `src/middleware.ts`

**Intent**: Distinguish anonymous, expired and outage; never destroy a session over a
transient database error; log every dropped error.

**Contract**: `currentUser(client)`: `user` → as today; `anonymous` → as today;
`expired` → `logError("auth:session", error)` and, on a guarded route,
`redirect(SIGN_IN_ROUTE + "?error=" + SESSION_EXPIRED_MESSAGE)`; `outage` → log and, on
a guarded route, redirect with `OUTAGE_MESSAGE`; on non-guarded routes both fall through
as anonymous. Profile: `resolveRole(client, user.id)`: `outage` → log + redirect to
sign-in with `OUTAGE_MESSAGE` without signing out; `no-role` → `signOutUser` (log on
failure) + `BROKEN_SESSION_MESSAGE` (now imported from `@/lib/auth/errors`); `role` →
`context.locals.profile` keeps its current shape. The `stables` count query keeps its
current behaviour (out of scope).

### Adaptation (2026-09-10)

- The first e2e run showed auth-js reporting a **missing cookie** as
  `AuthSessionMissingError` (status 400, no code) — `currentUser` classified it as
  `expired`, which would show "Sesja wygasła" to plain visitors on guarded routes and
  log every anonymous request. Fixed test-first in `session.ts` (`isMissingSessionError`
  → `anonymous`; new `it` in `session.test.ts`). Second e2e run: no `[auth:session]`
  entries.
- The middleware keeps `select("*")` for `locals.profile` (pages read `profile.id`) and
  feeds the loaded row to `resolveRole` through a one-shot loader; `userRole` (typed
  `UserRole`) drives the guard instead of `profile.role` (typed `string`).
- `authFailureMessage(scope, error, action)` lives in `session.ts` (message + log in one
  call for sign-in and sign-up).

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run lint`, `npm run check` pass
- `grep -n "error.message" src/pages/api/auth/*.ts` returns nothing
- `npm run test:e2e` passes against the local stack (sign-up and sign-in in `auth.setup.ts` unchanged)
- Sabotage: temporarily make the stubbed `signOutUser` path unreachable (e.g. revert `signout.ts` to ignore the result) — `session.test.ts` stays green but `grep` for `signOutUser` in `signout.ts` fails; restore. (Documents that the endpoint wiring is verified by review + manual, not by a unit test.)

#### Manual Verification:

- Local stack: wrong password on `/auth/signin` shows "Nieprawidłowy e-mail lub hasło." (no English text in the URL)
- Sign-up with the seeded `anna.kowalska@example.com` shows "Konto z tym adresem już istnieje. Zaloguj się."
- With Supabase stopped (`npx supabase stop`) a sign-in attempt shows the outage sentence, and `npm run dev` output carries a `[auth:signin]` entry with `name`/`message`, no e-mail
- Sign-out on the running stack still lands on `/` logged out; `/?error=test` shows the banner

**Implementation Note**: After completing this phase and all automated verification
passes, pause here for manual confirmation from the human before proceeding.

---

## Phase 4: Page logging, docs, lesson, merge

### Overview

Log the six page-load failures, record the pattern in the cookbook and the agent guide,
capture the lesson, land the change through the ruleset.

### Changes Required:

#### 1. Six SSR pages

**Files**: `src/pages/jezdziec/index.astro`, `src/pages/jezdziec/zapisy.astro`,
`src/pages/jezdziec/osrodki/[id].astro`, `src/pages/osrodek/grafik.astro`,
`src/pages/osrodek/konie.astro`, `src/pages/osrodek/zapisy.astro`

**Intent**: Keep the failure state, stop discarding the cause.

**Contract**: `catch (error) { loadFailed = true; logError("page:<route>", error); }`
with `<route>` the page path (e.g. `page:jezdziec/zapisy`). No other change.

#### 2. Cookbook and agent guide

**Files**: `context/foundation/test-plan.md` (§6.4, §6.5), `AGENTS.md`

**Intent**: Make the pattern discoverable for the next endpoint.

**Contract**: §6.4 gains two bullets — "Auth errors: map GoTrue `error.code` through
`src/lib/auth/errors.ts` (closed Polish set, `authErrorMessage`), classify transport
with `isTransportError`, never forward `error.message`" and "Dependency results: every
`auth.*`/`from()` call goes through `src/lib/auth/session.ts` helpers returning
discriminated results; partial failures are proven with a structural stub client in
`session.test.ts` (no `vi.mock`); log with `logError(scope, error)` from `src/lib/log.ts`
(derived fields only)". §6.5 gets a 2–3 line note for this change (date, the sign-out
mechanism, the outage-vs-no-role split). AGENTS.md: the Database/Coding sections
mention `src/lib/auth/{errors,session}.ts` and `src/lib/log.ts`, and the rule "check
and log the result of every dependency call; provider messages never reach the UI".

#### 3. Lesson

**File**: `context/foundation/lessons.md` (created by `/10x-lesson`)

**Intent**: Persist the recurring rule for future reviews and plans.

**Contract**: run `/10x-lesson` with Context "auth endpoints, middleware, SSR pages
(2026-09-10)", Problem "results of dependency calls dropped; responses claimed success
or a misleading cause", Rule "the result of every dependency call is checked and logged;
provider messages never reach the UI", Applies to "any `await client.*` in
`src/pages/api/**`, `src/middleware.ts`, `src/pages/**/*.astro`".

#### 4. Merge

**Intent**: Land through the gate.

**Contract**: PR from `bugfix/swallowed-auth-errors` to `main`, wait for `ci`,
`db-tests`, `e2e`, merge (merge commit).

### Adaptation (2026-09-10)

- 4.4 cannot be reproduced by stopping the database: `getUser` then fails in the
  middleware first (GoTrue without its database answers 5xx) and the request never
  reaches the page. Verified instead by a code sabotage on the dev server: with
  `getRiderBookings` throwing, a signed-in rider's `/jezdziec/zapisy` returned 200 with
  "Nie udało się wczytać zapisów." and the dev log carried
  `[page:jezdziec/zapisy] { name: 'Error', message: 'SABOTAGE: …' }`; sabotage reverted.
- That analysis exposed a classification gap: a GoTrue **5xx** on `getUser` was
  `expired` ("Sesja wygasła"). Fixed test-first: `isProviderOutage` (transport or
  status ≥ 500) in `errors.ts`, used by `currentUser` and `authFailureMessage`.

### Success Criteria:

#### Automated Verification:

- `grep -c "logError(" src/pages/jezdziec/index.astro src/pages/jezdziec/zapisy.astro "src/pages/jezdziec/osrodki/[id].astro" src/pages/osrodek/grafik.astro src/pages/osrodek/konie.astro src/pages/osrodek/zapisy.astro` shows 1 per file
- `npm run lint`, `npm run check`, `npm test` pass; `npx prettier --check context/foundation/test-plan.md AGENTS.md context/foundation/lessons.md` passes
- PR merged with `ci`, `db-tests`, `e2e` green

#### Manual Verification:

- With the local database stopped, opening `/jezdziec/zapisy` shows the existing failure state and the dev server log carries a `[page:jezdziec/zapisy]` entry

---

## Testing Strategy

### Unit Tests:

- `src/lib/log.test.ts` — entry shape, never throws, no leaked fields.
- `src/lib/auth/errors.test.ts` — closed Polish set by code, transport classification,
  expected-user-error table.
- `src/lib/auth/session.test.ts` — every discriminated branch on a structural stub:
  sign-out refused/thrown, profile outage vs no-role, `getUser` outage vs expired vs
  anonymous, sign-up confirm vs session vs error.

### Integration Tests:

- None added. `npm run test:e2e` (sign-up, sign-in, rider loop) is the regression gate.

### Manual Testing Steps:

1. Wrong password → Polish sentence, URL contains no English.
2. Sign-up with a seeded e-mail → "Konto z tym adresem już istnieje. Zaloguj się."
3. Stop Supabase → sign-in shows the outage sentence; log entry without e-mail.
4. `/?error=test` shows the error banner; normal sign-out still works.
5. Stop the database → `/jezdziec/zapisy` shows the failure state; log entry present.

## Performance Considerations

None: one extra branch per request; no new queries.

## Migration Notes

None. Rollback is `git revert` of the merge commit; no data or config changes.

## References

- Brief: `context/changes/swallowed-auth-errors/change.md`
- Pattern: `src/lib/bookings/errors.ts`, `src/lib/bookings/errors.test.ts`, `src/lib/db-errors.ts`
- Prior decisions: `context/archive/2026-08-10-role-aware-auth/plan.md` (role from
  profile, confirmations off, no redirect loops), `context/archive/2026-09-09-testing-rider-loop-in-the-browser/research.md:75-82,236-247` (`{}` incident hypothesis, sign-in pass-through noted)
- Test plan: `context/foundation/test-plan.md` §2 risk #3, §6.4, §7

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Log seam and the auth error dictionary (TDD)

#### Automated

- [x] 1.1 Red first: the two new test files fail before the modules exist, then pass — 093f732
- [x] 1.2 `npm test` passes — 093f732
- [x] 1.3 `npm run lint` passes with `console.error` only in `src/lib/log.ts` — 093f732
- [x] 1.4 `npm run check` passes — 093f732

#### Manual

- [x] 1.5 Closed set read once: Polish, specific, actionable — 093f732

### Phase 2: Session helpers proven on a stub client (TDD)

#### Automated

- [x] 2.1 Red first: `session.test.ts` fails before `session.ts` exists, then passes — cfb9abd
- [x] 2.2 `npm test`, `npm run lint`, `npm run check` pass — cfb9abd
- [x] 2.3 No `vi.mock`/`vi.fn`/fake timers in `session.test.ts` — cfb9abd

#### Manual

- [x] 2.4 Every `it` in `session.test.ts` names a user-visible outcome — cfb9abd

### Phase 3: Wire endpoints, middleware and the `/` banner

#### Automated

- [x] 3.1 `npm test`, `npm run lint`, `npm run check` pass — 90a56e4
- [x] 3.2 No `error.message` left in `src/pages/api/auth/*.ts` — 90a56e4
- [x] 3.3 `npm run test:e2e` passes — 90a56e4
- [x] 3.4 Sabotage: reverting `signout.ts` to ignore the result is caught by the wiring grep; restored — 90a56e4

#### Manual

- [x] 3.5 Wrong password shows the Polish sentence — 90a56e4
- [x] 3.6 Existing e-mail on sign-up shows "Konto z tym adresem już istnieje" — 90a56e4
- [x] 3.7 Stopped Supabase shows the outage sentence and logs without e-mail — 90a56e4
- [x] 3.8 Sign-out still works; `/?error=test` shows the banner — 90a56e4

### Phase 4: Page logging, docs, lesson, merge

#### Automated

- [x] 4.1 Each of the six pages calls `logError` once
- [x] 4.2 lint, check, test and Prettier on docs pass
- [ ] 4.3 PR merged with `ci`, `db-tests`, `e2e` green

#### Manual

- [x] 4.4 Stopped database: `/jezdziec/zapisy` failure state plus a `[page:…]` log entry
