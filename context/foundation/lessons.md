# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Check and log the result of every dependency call; provider text never reaches the UI

- **Context**: auth endpoints (`src/pages/api/auth/*`), `src/middleware.ts` and the SSR data pages under `src/pages/jezdziec` and `src/pages/osrodek` — any `await supabase.*` / `await client.*` on a request path (change `swallowed-auth-errors`, 2026-09-10).
- **Problem**: results of dependency calls were dropped — `signOut()` ignored so the endpoint claimed success while the session cookie survived; profile-query `error` not destructured so a database outage looked like a missing role and destroyed the session; raw English `error.message` from GoTrue (or `fetch failed` / `{}`) forwarded to the form; page `catch { loadFailed = true }` blocks discarded the cause with no log.
- **Rule**: Always read `{ data, error }` (or the discriminated result from `src/lib/auth/session.ts`) of every dependency call and branch on it; map codes through the area's `errors.ts` closed Polish set; log every non-user error with `logError(scope, error)` from `src/lib/log.ts`. Never forward a provider's message text to the user and never let a response claim success the dependency did not confirm.
- **Applies to**: all
