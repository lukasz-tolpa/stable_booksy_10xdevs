---
change_id: swallowed-auth-errors
title: Swallowed auth errors
status: impl_reviewed
created: 2026-09-10
updated: 2026-09-10
archived_at: null
---

## Notes

Lesson M3L5 task 1 (test-driven bugfixing): find places where the result of an
operation on a dependency is dropped and the response reports success or a
misleading cause. Scan of `src/` done on 2026-09-10 (grep for `catch`,
`console.*`, and Supabase calls that do not destructure `error`). Findings are
the scope of this change; nothing else.

### Findings (swallowed / misreported errors)

1. `src/pages/api/auth/signout.ts` — result of `supabase.auth.signOut()` is
   ignored; the endpoint always redirects to `/`. If sign-out fails the session
   cookie survives while the user believes they are logged out. Purest match of
   the lesson's pattern (side effect fails, response says OK).
2. `src/pages/api/auth/signin.ts` (profile lookup after password sign-in) —
   `const { data: profile } = await supabase.from("profiles")...` drops
   `error`. A database failure yields `profile = null`, the user is signed out
   and told "Nie udało się ustalić rodzaju Twojego konta" — wrong cause, no log.
   Same file: `await supabase.auth.signOut()` in that branch ignores its result.
3. `src/middleware.ts` — same profile lookup pattern; a transient database
   error becomes `profile = null`, which on guarded routes looks like a missing
   role instead of an outage. No log.
4. Six SSR pages swallow the exception without logging it
   (`catch { loadFailed = true }`): `src/pages/jezdziec/index.astro`,
   `src/pages/jezdziec/zapisy.astro`, `src/pages/jezdziec/osrodki/[id].astro`,
   `src/pages/osrodek/grafik.astro`, `src/pages/osrodek/zapisy.astro`,
   `src/pages/osrodek/konie.astro`. The user sees the failure state (good), but
   Workers logs carry no trace although `observability` is enabled in
   `wrangler.jsonc`. Fix: keep the failure state, add `console.error` with the
   original error.
5. Related, same scope (test-plan §2 risk #3, §6.4): `signin.ts` and
   `signup.ts` pass the raw Supabase `error.message` (English) straight to the
   form. Map known auth codes (invalid credentials, email already registered,
   weak password, provider unreachable) to Polish messages in a new
   `src/lib/auth/errors.ts`, log the original with `console.error`, fall back to
   a generic Polish message.

### Not a finding (checked, behaves correctly)

- `src/pages/api/bookings/create.ts` and `src/pages/api/schedule/save.ts`
  `catch` blocks translate the error code to a user message and return a
  failure redirect — errors propagate.
- `src/pages/api/bookings/cancel.ts` `catch` returns a Polish failure message.
- All query helpers in `src/lib/**/queries.ts` `throw` on `error`.

### Constraints for the plan

- Red test before the fix (M3L5). Unit tests for the error mapping (oracle:
  PRD NFR "interfejs po polsku", test-plan §6.4 "no `{}` or provider text").
  Hermetic stub-client tests for sign-out and the profile-lookup branches
  (partial failures real infra cannot trigger — M3L2 rule). No integration or
  e2e tests needed; existing e2e must stay green.
- Follow §6.1 conventions: colocated `*.test.ts`, Polish `it()` descriptions,
  no mocks of time, inject dependencies as parameters.
- Sentry (task 2) is out of scope — deadline 2026-09-14. Runtime logs channel
  is already available via Workers observability (`npx wrangler tail`).
- Final phase: cookbook/docs sync (test-plan §6.4 note on auth error mapping,
  AGENTS.md if a new module appears) and a `/10x-lesson` entry: "the result of
  every dependency call is checked and logged; provider messages never reach
  the UI". `context/foundation/lessons.md` does not exist yet.
