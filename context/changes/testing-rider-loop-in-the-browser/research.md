---
date: 2026-09-09T11:40:00+02:00
researcher: Claude (Fable 5.1) for tolpa.lukasz97@gmail.com
git_commit: f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc
branch: main
repository: lukasz-tolpa/stable_booksy_10xdevs
topic: "Test rollout Phase 2 — rider loop in the browser: oracle, selectors, endpoint truth, slot-rule gaps, e2e harness feasibility (risks #6, #3, #5)"
tags: [research, codebase, testing, e2e, playwright, bookings, slots, supabase, ci]
status: complete
last_updated: 2026-09-09
last_updated_by: Claude (Fable 5.1)
---

# Research: Phase 2 — Rider loop in the browser (risks #6, #3, #5)

**Date**: 2026-09-09T11:40:00+02:00
**Researcher**: Claude (Fable 5.1)
**Git Commit**: f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc (== origin/main)
**Branch**: main
**Repository**: lukasz-tolpa/stable_booksy_10xdevs

Permalink base: `https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/`
(every `path:line` below resolves to `<base>path#Lline`).

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` ("Rider loop in the
browser", risks #6, #3, #5) so `/10x-plan` can write an e2e (Playwright, 1–2
scenarios) + unit (pure slot logic, table-driven from PRD) plan. Per test-plan
§2 "Context `/10x-research` must ground":

- **#6** — seeded accounts and data available to a browser, how sessions are
  established for tests, stable selectors (roles/labels) the pages expose,
  data isolation between runs.
- **#3** — entry point of the booking endpoint, how database errors are
  translated to user messages, what the success redirect carries, what
  happens on unexpected errors (including provider unreachable).
- **#5** — where slot availability is computed, whether once server-side, how
  "taken" is sourced (RLS hides other riders' bookings), boundary at `close`.

Oracle rule for everything below: PRD Business Logic / Guardrails / US-01, never
the current implementation (test-plan §1).

## Summary

1. **The loop is fully server-rendered, no client JS on the rider pages.**
   Every mutation is a plain `<form method="post">` → API route → **302** with
   the outcome in the query string (`?sukces=1` or `?error=<Polish text>`).
   `page.waitForURL()` is the correct wait; there is nothing to `waitForResponse`.
   Sign-in is a React island but still submits natively
   ([SignInForm.tsx:43](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/components/auth/SignInForm.tsx#L43)).
2. **There is no "Zapisz" button.** Each free slot is a form whose submit
   button's accessible name is the **horse name only**; the hour is a sibling
   `<p>` in the same `<li>`
   ([[id].astro:186-208](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/jezdziec/osrodki/%5Bid%5D.astro#L186)).
   A taken slot is not rendered at all; an own booking renders as a `<span>`
   "`<horse> — Twój zapis`" (em dash U+2014). Selectors must scope by the hour
   `listitem` first. No `data-testid`, no `aria-label` (except the password
   toggle), no `<main>`; headings and labels are enough — see the selector map.
3. **Redirect is not persistence, confirmed at code level.** `create.ts`
   inserts with no `.select()` and redirects `?sukces=1` purely because the
   insert did not throw
   ([create.ts:99-105](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/api/bookings/create.ts#L99),
   [queries.ts:209-220](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/bookings/queries.ts#L209)).
   The success banner is rendered from the query param alone (`GET …?sukces=1`
   shows it with no row). **Persistence is proven only by** the "Twój zapis"
   badge (page re-reads `getMyBookings` every render), the row on
   `/jezdziec/zapisy`, and the stable's `/osrodek/zapisy`. Tests must assert
   those, never the banner or the 302.
4. **Error translation is a closed Polish table with a generic fallback.**
   `23505/23514/23503` → three specific messages; everything else (`42501`
   RLS, `""` from a PostgREST network failure, `undefined`) → "Nie udało się
   zapisać na jazdę. Spróbuj ponownie."
   ([errors.ts:11-31](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/bookings/errors.ts#L11)).
   The booking endpoint **cannot** emit `{}` today. The only place raw provider
   text still reaches a user is sign-in
   ([signin.ts:30-32](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/api/auth/signin.ts#L30):
   `error.message`, English). **The 2026-09-07 `{}` incident has no trace in
   git** (no commits between 2026-08-20 and 2026-09-08); it lives only in the
   interview. Best repo-grounded hypothesis: an `Error` instance serialised by
   `JSON.stringify` (non-enumerable `message`) — most plausibly through the
   sign-in pass-through or a page rendering an object. Unconfirmed.
5. **Slot rule is computed once, server-side, in a pure function** —
   `computeSlotSections` ([slots.ts:56-84](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/bookings/slots.ts#L56)),
   half-open `[open, close)` at line 61, matching the DB trigger. **But two of
   the three PRD clauses live outside it**: "horse assigned that day" is a
   filter in the page frontmatter
   ([[id].astro:49-54](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/jezdziec/osrodki/%5Bid%5D.astro#L49)),
   and "not already taken (active)" is the `status = 'active'` predicate of the
   `security definer` RPC `get_taken_slots`
   ([20260819090000:13-26](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/supabase/migrations/20260819090000_booking_slot_occupancy.sql#L13)).
   The existing 9 unit cases in `slots.test.ts` are PRD-derived literals (no
   mirror); the gaps are listed in §C.
6. **E2E in CI needs the auth stack, which Phase 1's `db-tests` job does not
   start.** `supabase db start` = Postgres only (no GoTrue → no login). An
   `e2e` job needs `supabase start -x <everything but kong,gotrue,postgrest>`
   (+1–2 min over the measured 2m24s), then `astro build` + `astro preview`
   (both run on workerd via the Cloudflare Vite plugin) and Chromium install.
   Estimated 4–6 min per PR, parallel to `ci`/`db-tests`. Locally: Docker is
   currently down, Playwright is not installed, `.dev.vars` **overrides**
   `webServer.env` (adapter does `Object.assign(process.env, parsed)`).

Three oracle gaps need a decision before assertions are written (see Open
Questions): retired-but-assigned horse, "Spróbuj ponownie" for permanent
refusals (`42501`), and missing `hour` field coercing to `0`.

## Detailed Findings

### A. Risk #6 — the rider loop as the browser sees it

Cross-cutting facts:

- Middleware guards prefixes `/osrodek` (role `stable`), `/jezdziec` (role
  `rider`), `/dashboard` (any)
  ([middleware.ts:36-82](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/middleware.ts#L36),
  table in [roles.ts:39-43](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/auth/roles.ts#L39)).
  Logged out → `302 /auth/signin` (no message). Wrong role → own home
  (`/jezdziec` or `/osrodek`). `/api/*` is **not** guarded; endpoints call
  `getUser()` themselves. Stable account without a `stables` row →
  `/osrodek/nowa-stadnina`.
- Session: `@supabase/ssr` cookie `sb-<host-label>-auth-token` (local
  `sb-127-auth-token`), base64 JSON, chunked above ~3 KB, httpOnly — captured
  by Playwright `storageState`
  ([supabase.ts:6-27](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/supabase.ts#L6)).
- Layout: `<html lang="pl">`, no `<main>`/`<header>`; the only `<nav>`
  elements are unlabeled day switchers. Page `<title>` set per page.
- Hours render as `${hour}:00` unpadded ("9:00", "11:00") — use
  `getByText('11:00', { exact: true })`, since "1:00" is a substring of "11:00".
- Dates are ISO `YYYY-MM-DD` in Europe/Warsaw
  ([dates.ts:24-35,63-65](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/schedule/dates.ts#L24));
  long labels `pl-PL` "czwartek, 10 września 2026".

Step-by-step contract:

| Step | URL | Key facts | Source |
| --- | --- | --- | --- |
| Sign-in | `/auth/signin` | `<h1>` "Zaloguj się"; labels "Adres e-mail", "Hasło"; submit "Zaloguj się"; native POST to `/api/auth/signin`; success → rider `/jezdziec`, stable `/osrodek`; error → `?error=<raw provider text>` rendered as `<p>` (no role). Pending text "Logowanie..." never appears with a string `action` — do not wait on it. | [signin.astro:11-16](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/auth/signin.astro#L11), [SignInForm.tsx:43-84](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/components/auth/SignInForm.tsx#L43), [signin.ts:43](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/api/auth/signin.ts#L43) |
| Catalogue | `/jezdziec` | `<h1>` "Ośrodki"; link "Moje zapisy"; GET filter `name=q`, sr-only label "Szukaj ośrodka", button "Szukaj", link "Wyczyść"; substring match on name OR city; each card is one `<a>` whose accessible name is `name + city + description` (use substring match, not `exact`), containing `<h2>{name}</h2>`; empty states "Żaden ośrodek nie pasuje do wpisanej frazy." / "Nie ma jeszcze żadnych ośrodków." | [index.astro:42-92](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/jezdziec/index.astro#L42), [StableCard.astro:16-26](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/components/stables/StableCard.astro#L16), [StableFilter.astro:18-46](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/components/stables/StableFilter.astro#L18) |
| Stable detail | `/jezdziec/osrodki/[id]?dzien=YYYY-MM-DD` | Default day = **tomorrow** (past/invalid `dzien` replaced); `<h1>{stable.name}`; day form: label "Wybierz dzień:", `input#dzien type=date min=today`, button "Pokaż"; nav links "Poprzedni" (a `<span>` when previous day is past) / "Następny"; `<h2>` "Wolne sloty"; three distinct states: "Ośrodek nie ułożył grafiku na ten dzień." / "Brak wolnych slotów tego dnia." / list; success banner "Zapisano na jazdę. Twój slot jest oznaczony poniżej."; error `<p>{error}</p>` verbatim. | [[id].astro:18-24,117-126,153-214](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/jezdziec/osrodki/%5Bid%5D.astro#L117) |
| Book | `POST /api/bookings/create` | hidden `stableId, day, horseId, hour`; button text = horse name; → `…?dzien=<day>&sukces=1` or `&error=<text>`; logged out → `/auth/signin`. | [create.ts:14-39,105](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/api/bookings/create.ts#L14) |
| Moje zapisy | `/jezdziec/zapisy` | `<h1>` "Moje zapisy"; `<h2>` "Nadchodzące"; row spans: "10 września, 11:00", horse, stable; per-row form `POST /api/bookings/cancel` hidden `bookingId`, button "Odwołaj"; `<h2>` "Minione i odwołane" only when history non-empty, cancelled rows carry `<span>` "odwołany"; empty "Nie masz nadchodzących zapisów."; success "Zapis został odwołany. Slot wrócił do puli wolnych." | [zapisy.astro:56-137](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/jezdziec/zapisy.astro#L56), [rider-list.ts:54-63](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/bookings/rider-list.ts#L54) |
| Stable day list | `/osrodek/zapisy?dzien=` | Role `stable`; **default day = today** (not tomorrow) — navigate with `?dzien=` or "Następny"; no date input; `<h1>` "Zapisy dnia"; row spans hour, horse, **rider `full_name`** (fallback "(bez nazwiska)" — signup collects no name); only `status='active'`; empty "Brak zapisów tego dnia." / "Ten dzień nie ma ułożonego grafiku." | [osrodek/zapisy.astro:19,61-119](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/osrodek/zapisy.astro#L19), [rows.ts:18-31](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/bookings/rows.ts#L18) |
| Sign-out | Topbar | form `POST /api/auth/signout`, button "Wyloguj się" → `/`; logged-out marker "Nie jesteś zalogowany". | [Topbar.astro:19-46](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/components/Topbar.astro#L19) |

Selector map (Playwright, accessibility-first; none of these needs a test id):

| Step | Element | Locator | Ambiguity |
| --- | --- | --- | --- |
| Sign-in | email / password | `getByLabel('Adres e-mail')` / `getByLabel('Hasło', { exact: true })` | `exact` avoids the "Pokaż hasło" toggle |
| Sign-in | submit | `getByRole('button', { name: 'Zaloguj się' })` → `waitForURL('/jezdziec')` | none |
| Catalogue | stable card | `getByRole('link', { name: stableName })` (no `exact`) | name includes city+description |
| Detail | day | `getByLabel('Wybierz dzień')` + `fill('YYYY-MM-DD')` + `getByRole('button', { name: 'Pokaż' })` — or navigate `?dzien=` directly | none |
| Detail | hour section | `getByRole('listitem').filter({ has: page.getByText('12:00', { exact: true }) })` | must be `exact` |
| Detail | book | `<hour li>.getByRole('button', { name: horseName, exact: true })` | HIGH without scoping — same horse in every hour |
| Detail | proof of booking | `<hour li>.getByText(`${horseName} — Twój zapis`)` + `waitForURL(/sukces=1/)` | em dash U+2014 |
| Detail | refusal | `getByText('Ten slot został właśnie zajęty. Wybierz inny termin lub konia.')` | none |
| Moje zapisy | row | `getByRole('listitem').filter({ hasText: stableName }).filter({ hasText: horseName })` | scope by both |
| Moje zapisy | cancel | `<row>.getByRole('button', { name: 'Odwołaj' })` → `waitForURL(/sukces=1/)` | one per row |
| Moje zapisy | after cancel | `getByRole('heading', { name: 'Minione i odwołane' })`; `<row>.getByText('odwołany', { exact: true })` | section appears only then |
| Stable list | row | `getByRole('listitem').filter({ has: getByText('12:00', { exact: true }) }).filter({ hasText: horseName })` | rider shown by `full_name`, never email |

Elements with no accessible name (do not target): the day-switcher `<nav>`s,
the `<p>` success/error flashes (no `role=status/alert` — use `getByText`),
the Topbar `<div>`, the `<ul>` lists.

Seeded accounts usable by a browser
([seed.sql:18-58,90-152](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/supabase/seed.sql#L18)):
real GoTrue users (bcrypt `sekret123`, `email_confirmed_at = now()`, token
columns blanked, `auth.identities` rows present, profiles by trigger with
`full_name` set):

| uuid | email | role | full_name |
| --- | --- | --- | --- |
| 1111… | osrodek.debem@example.com | stable (Stadnina Pod Debem, Krakow) | Marek Debowski |
| 2222… | osrodek.rzeka@example.com | stable (Stajnia Nad Rzeka, Wieliczka) | Ewa Rzecka |
| 3333… | anna.kowalska@example.com | rider | Anna Kowalska |
| 4444… | piotr.nowak@example.com | rider | Piotr Nowak |

Horses: Bella, Kasztan, Iskra (Pod Debem); Grom, Luna (Nad Rzeka), all
`active = true`. Schedule days: both stables on `current_date + 1` — Pod Debem
10–16 with Bella + Kasztan (Iskra **not** assigned), Nad Rzeka 9–14 with Grom
only. Seed bookings: Anna → Bella@11 (Pod Debem), Piotr → Grom@10 (Nad Rzeka).
No cancelled booking in seed. Identity ids are not fixed (resolve by name).
**Kasztan@12 at Pod Debem is the guaranteed-free in-range slot — but
`concurrent_double_booking.sh` deletes and re-inserts exactly that slot as
`postgres`, so `npm run test:db` and e2e must never share a database
concurrently.**

Local auth: `enable_confirmations = false`
([config.toml:209](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/supabase/config.toml#L209)),
signup enabled, min password 6 → a fresh rider per run can be created through
`/auth/signup` without a mailbox (profile via `handle_new_user()` trigger from
`raw_user_meta_data.role`; no `full_name`, so the stable list shows
"(bez nazwiska)").

### B. Risk #3 — booking endpoint: 302 vs persistence, error translation

Control flow of `POST /api/bookings/create`
([create.ts](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/api/bookings/create.ts)):

1. `request.formData()` (line 49, outside try — a non-form body is an Astro 500).
2. Lenient parse of `stableId`/`day` only to build the redirect target (50–51).
3. `bookingSchema.safeParse` — zod 4, `stableId`/`horseId` coerce int > 0,
   `day` valid ISO, `hour` coerce int 0..23; first issue's Polish text
   ([schema.ts:10-15](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/bookings/schema.ts#L10)).
   **If `stableId` is invalid the message is dropped** and the user lands on
   `/jezdziec` silently (`backToStable`, lines 22–24).
4. Endpoint-only date guards (66–75): past day → "Nie można zapisać się na
   miniony dzień."; today and `hour <= currentWarsawHour()` → "Ta godzina już
   minęła. Wybierz późniejszy slot." (not in PRD — S-04 decision).
5. `getUser()`; `!user` → `302 /auth/signin` **with no message** (82–88).
   **No role check in code** — the role gate is RLS
   `bookings_insert_own_as_rider` (`rider_id = auth.uid() AND
   private.current_role() = 'rider'`,
   [20260810090100:277-284](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/supabase/migrations/20260810090100_schedule_and_bookings.sql#L277)).
6. `getScheduleDay` → `null` → "Ośrodek nie ułożył grafiku na ten dzień." (94–97).
7. `createBooking` — `insert({schedule_day_id, horse_id, hour, rider_id})`, **no
   `.select()`**, `if (error) throw error`, returns `void`; `rider_id` always
   from the session (queries.ts:209-220).
8. `catch` → `bookingErrorMessage(errorCode(error))`; `errorCode` returns
   `error.code` only when it is a string (41–46; duplicated verbatim in
   `schedule/save.ts:28-32`).
9. Success → `302 …?dzien=<day>&sukces=1` (105). Every redirect is Astro's
   default 302.

Failure classes and what the rider sees:

| Class | Source of the error | Rider sees |
| --- | --- | --- |
| zod | schema.ts | "Nieprawidłowy ośrodek" / "Nieprawidłowa data" / "Nieprawidłowy koń" / "Nieprawidłowa godzina" |
| `23505` | partial unique index `bookings_active_slot_key` (20260810090100:122-124) | "Ten slot został właśnie zajęty. Wybierz inny termin lub konia." |
| `23514` | trigger `enforce_booking_within_working_hours` (20260810090100:157-159) | "Wybrana godzina jest poza zakresem pracy ośrodka w tym dniu." |
| `23503` | composite FK `bookings_scheduled_horse_fkey` (20260810090100:107-110) or missing day | "Grafik ośrodka zmienił się w międzyczasie — … Odśwież stronę i wybierz inny slot." |
| `42501` (stable account, or `rider_id ≠ uid`) | RLS policy | FALLBACK "Nie udało się zapisać na jazdę. Spróbuj ponownie." — "try again" for a permanent refusal |
| PostgREST unreachable | postgrest-js catches `fetch failed` and returns `{ error: { code: "" }, status: 0 }` — does not throw | FALLBACK |
| GoTrue unreachable at `getUser` | `AuthRetryableFetchError` → `{ user: null }` | `302 /auth/signin`, no message — looks logged out |
| unhandled throw (`formData`) | — | Astro 500 |

No `console.error` anywhere in `src/` — swallowed errors leave no server log.

Message convention (project-wide): the **final Polish text** travels in
`?error=<text>` (`URLSearchParams` in create/cancel/save; `encodeURIComponent`
in signin/toggle-active/middleware); success is the flag `?sukces=1` and the
page owns the sentence. Pages render `{error}` verbatim, no code decoding, no
allow-list ([[id].astro:122-126](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/jezdziec/osrodki/%5Bid%5D.astro#L122),
[zapisy.astro:68-72](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/jezdziec/zapisy.astro#L68)).
Consequences: e2e asserts Polish text (stable substring), both banners are
spoofable by URL, and `getByRole('alert')` does not work (only the config
`Banner.astro` has `role="alert"`).

Cancel endpoint
([cancel.ts](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/api/bookings/cancel.ts)):
`cancelSchema` (`bookingId` int > 0, "Nieprawidłowy zapis") → `getUser` →
`getRiderBookingForCancel` with explicit `.eq("rider_id", user.id)` +
`.maybeSingle()` (missing / foreign / already cancelled → "Nie znaleziono
zapisu do odwołania.") → past guard "Nie można odwołać jazdy, która już się
zaczęła." → **soft delete** `update({status:'cancelled', cancelled_at})`
filtered by id + rider + `status='active'` with `.select('id').maybeSingle()`
(read-back pattern; `null` → not found) → `302 /jezdziec/zapisy?sukces=1`.
This is the read-back pattern `create.ts` lacks (also in `toggle-active.ts:47-57`).

Existing unit coverage:

- `errors.test.ts` (5 tests): `23505` contains "zajęty" + "Wybierz inny"; three
  codes → three distinct messages; `23514` "poza zakresem pracy"; `23503`
  "Odśwież"; `"42P01"` and `undefined` → exact FALLBACK.
  **Gaps**: `""` (network shape); `42501` as an explicit oracle decision;
  non-string / `{}` inputs go through `errorCode`, which is unexported,
  duplicated, and untested; no "contains no English / provider text" assertion.
- `schema.test.ts` (7 tests): coercion, invalid/`"jutro"` date, hour `24`/`-1`/
  `12.5`, `stableId "0"`, `horseId "abc"`, cancel schema.
  **Gap with a real consequence**: `formValue` returns `""` for a missing field
  ([form-data.ts:8-11](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/form-data.ts#L8))
  and `z.coerce.number("")` is `0`, so a **missing `hour` passes validation as
  hour 0** and fails only at the DB with `23514` ("poza zakresem pracy" for a
  form defect). Missing `stableId`/`horseId` → 0 → rejected (untested).

Regressions a Phase 2 test would catch:

- dropping `if (error) throw` in `createBooking`, a `catch {}` around line 99,
  or `backToStable` setting `sukces` on the error branch → banner with no row;
- losing `dzien` on the success redirect → badge rendered for the wrong day;
- `errorCode` reading `message` or a non-string `code` → `23505` degrades to
  FALLBACK; message swap between codes; English creeping in;
- `rider_id` taken from the form instead of the session → `42501` on the happy
  path;
- the page's re-read (`getMyBookings` → `mine`) regressing so the badge
  disappears while the banner still shows.

### C. Risk #5 — the slot rule against the PRD oracle

PRD oracle ([prd.md §Business Logic](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/context/foundation/prd.md#L104)):
a (horse, hour) pair is offered iff hour ∈ `[open, close)`, the horse is
assigned to that day, and no active booking exists for the pair. Slot = 1 h, no
per-horse daily cap in v1. Cancellation frees the slot. Empty schedule → an
empty state, not a list of 0.

Where each clause lives:

| PRD clause | Application | Database |
| --- | --- | --- |
| hour ∈ `[open, close)` | `slots.ts:61` `hour < closeHour` | trigger `enforce_booking_within_working_hours` (`23514`), guard trigger `schedule_days_protect_bookings` (`SB002`) |
| horse assigned that day | page filter `[id].astro:49-54` over `scheduleDay.horseIds` — **not** in the pure function | composite FK to `schedule_day_horses` (`23503`) |
| no active booking | RPC `get_taken_slots` `status = 'active'` (20260819090000:25) + `getMyBookings` `status='active'` (queries.ts:35) — **not** in the pure function | partial unique index `where status = 'active'` |
| cancelled frees slot | same predicates; `cancelBooking` flips status | same |
| empty state | two distinct states `[id].astro:175-184` | — |

`computeSlotSections(input)` ([slots.ts:36-84](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/lib/bookings/slots.ts#L36)):
input `{ openHour, closeHour, horses[], takenSlots[], myBookings[], currentHour | null }`
→ `[{ hour, horses: [{ id, name, status: 'free' | 'mine' }] }]`. Pure, no clock
(`currentWarsawHour(now)` is injected). Semantics: hours ascending; horses in
input order (page passes `active desc, name asc`); `close` excluded; taken
and not mine → dropped silently; mine → `status 'mine'` (checked before taken);
hour with no free/mine horse → section omitted; today `hour <= currentHour` →
skipped (current hour counts as started — an S-04 extension, **not in the
PRD**); duplicate taken entries collapsed by a `Set`; horse `active` flag
**not consulted**. Computed once in SSR frontmatter
([[id].astro:56-63](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/src/pages/jezdziec/osrodki/%5Bid%5D.astro#L56));
no client recomputation; the DB re-enforces on POST.

How a rider sees others' occupancy despite RLS: policy
`bookings_select_own_or_my_stable` shows a rider only own rows, so a plain
SELECT would report every foreign slot as free. `get_taken_slots` is
`security definer` with `search_path = ''`, projects only `(horse_id, hour)`
of active bookings for `(stable, day)`, granted to `authenticated` only
([20260819090000:13-32](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/supabase/migrations/20260819090000_booking_slot_occupancy.sql#L13)).

Existing `slots.test.ts` (9 slot cases + 3 `currentWarsawHour`; all expected
values are PRD-derived literals, **no mirror**): half-open range 10–12 →
`[10, 11]`; free order preserved; taken-by-others omitted; own → `mine`;
fully-taken hour dropped; own-only hour kept; today `currentHour 13` (10–16) →
`[14, 15]`; `null` → `[10..15]`; no horses → `[]`; after hours → `[]`.

PRD cases **not yet covered** (unit gaps, table-driven candidates):

1. Explicit negative at the boundary: 10–16 offers 15 and **not** 16, and not 9
   (the PRD example; today inferred only from equality).
2. `open == close` → `[]` (DB forbids it; function should still be total).
3. Width-1 range 10–11 → exactly `[10]`.
4. Full-set example from the seed: 10–16, Bella + Kasztan, (Bella, 11) taken →
   exactly 11 slots (see worked example) — no test asserts a complete output set.
5. Taken pair for a horse not in `horses` → ignored, no phantom horse.
6. `myBookings` pair absent from `takenSlots` (inconsistent input) → decide.
7. Duplicate taken entries → idempotent.
8. **Horse not assigned that day** — the filter is in the page, so
   `computeSlotSections` cannot prove it. Options for the plan: extract the
   filter into a pure function (`src/lib/bookings/`) and test it, or prove it in
   e2e via Iskra (assigned to nothing tomorrow) — the seed already stages it.
9. **Cancelled booking frees the slot** — no `status` reaches the function;
   provable only through the RPC (Phase 1 SQL layer) or e2e (book → cancel →
   button reappears).
10. **Retired-but-assigned horse** — PRD silent; see Open Questions.

Worked example (PRD rule + seed, stable Pod Debem, tomorrow, viewer Piotr):
hours {10..15}, horses {Bella, Kasztan}, active bookings {(Bella, 11)} →
11 free slots: 10 Bella+Kasztan; 11 Kasztan only; 12–15 Bella+Kasztan. Must not
appear: 9, 16, any Iskra slot, (Bella, 11) as a button. As Anna the same page
shows "Bella — Twój zapis" inside hour 11. Nad Rzeka: hours {9..13}, Grom
only, (Grom, 10) taken → Grom @ 9, 11, 12, 13; Luna never appears.

Seed drift hazard: `current_date + 1` is evaluated at seed time in the
Postgres session zone (UTC); the rider page defaults to Warsaw tomorrow. A
seed loaded yesterday puts the only schedule on **today**, so the default page
shows "Ośrodek nie ułożył grafiku…" and `currentHour` filtering kicks in; near
midnight (22:00–24:00 UTC in summer) Postgres and Warsaw dates differ. For a
deterministic run: `supabase db reset` once before the suite, and compute the
target date in the test the same way the app does (`addDays(todayIso(), 1)`
in Europe/Warsaw) and navigate with `?dzien=` explicitly.

### D. E2E harness — what the project can run, locally and in CI

Serving the app:

- `npm run dev` = `astro dev`, `npm run preview` = `astro preview`; adapter
  `@astrojs/cloudflare` 13.5.0, `output: "server"`
  ([astro.config.mjs:12-22](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/astro.config.mjs#L12)).
  **Both run on workerd** via `@cloudflare/vite-plugin` 1.36.3 (Astro Cloudflare
  integration docs, fetched 2026-09-09). Both are plain HTTP servers Playwright's
  `webServer` can wait on; `wrangler dev` not needed. Astro's testing guide
  (fetched 2026-09-09) recommends `astro build` + `npm run preview`,
  `url: http://localhost:4321/`, `timeout: 120_000`,
  `reuseExistingServer: !process.env.CI` — preview serves `dist/` and avoids
  the cold Vite compile eating into the timeout.
- Env: only `SUPABASE_URL` and `SUPABASE_KEY` (optional server secrets via
  `astro:env/server`; missing → every page degrades to "Supabase nie jest
  skonfigurowany", not a crash). **Gotcha**: the adapter reads `.dev.vars` in
  `astro:config:setup` and `Object.assign(process.env, parsed)` — `.dev.vars`
  **overrides** `webServer.env`. Locally `.dev.vars` must already point at the
  local stack; in CI there is no `.dev.vars`, so job `env:` works.
- `config.toml` `site_url = http://127.0.0.1:3000` is irrelevant for password
  sign-in (no redirects/magic links).

Auth stack: `supabase db start` = **Postgres only** (CLI reference, fetched
2026-09-09; confirmed by test-plan §6.5). The Phase 1 `db-tests` job therefore
**cannot** serve a browser login. An `e2e` job needs
`npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`
(keeps kong, gotrue, postgrest), then `npx supabase status -o env` for
`API_URL`/`ANON_KEY`. Fresh `supabase start` runs migrations + seed, so CI is
always seed-fresh.

Current CI ([ci.yml](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/.github/workflows/ci.yml)):
push + PR to `main`; `ci` (lint, `npm test`, build with cloud secrets, ~1m20s);
`db-tests` (`timeout-minutes: 15`, postgres-version pin copied to
`supabase/.temp/`, `db start`, `npm run test:db` with `BARRIER_SECONDS=1`,
`docker logs` on failure; last run 2m24s); `deploy` `needs: [ci, db-tests]`,
main-push only, rebuilds itself (~59s). Nothing reusable across jobs: `ci`
builds against cloud secrets, so an `e2e` job must `astro build` against the
local stack itself (~30s). Estimated e2e job: 4–6 min (Postgres + 3 images +
Chromium `--with-deps` + build + seconds of tests), parallel to the others,
so ~2–3 min longer to `deploy`. If it is a required gate, add it to
`deploy.needs`.

Tooling interactions:

- Vitest `include: ["src/**/*.test.ts"]`, node env
  ([vitest.config.ts:14-16](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/vitest.config.ts#L14))
  — an `e2e/**/*.spec.ts` folder is not picked up. Existing tests sit beside
  their module (`src/lib/<area>/<module>.test.ts`).
- tsconfig `include: ["**/*"]` + ESLint `projectService: true` under
  `strictTypeChecked` + React/compiler rules on all `**/*.{ts,tsx}`
  ([eslint.config.js:16-38](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/blob/f34504b2e1ce7d40c8353eeb61c0d27bcf7270bc/eslint.config.js#L16))
  → an `e2e/` folder gets type-linted with React rules; expect
  `no-floating-promises` on un-awaited `expect` and hook rules. Needs an
  `e2e/**` + `playwright.config.ts` override block, and `playwright-report/`,
  `test-results/`, `playwright/.auth/` in `.gitignore` (ESLint imports it).
  `lint-staged` runs `eslint --fix` on `*.ts` at commit, so spec files are
  linted on commit too. No `.prettierignore` exists. `astro check` is not wired
  anywhere.
- Windows: `npm run` resolves `bash` to WSL's launcher (only distro:
  `docker-desktop`), hence `run_all.mjs`; keep `test:e2e` a pure `playwright
  test` invocation and `webServer.command` an `npm`/`npx` command with no POSIX
  syntax. Local Node v24.16 vs `.nvmrc` 22.14 — Playwright 1.63 (latest per
  release notes, fetched 2026-09-09) supports both.
- Machine state at research time: Docker Desktop **not running**, no Supabase
  containers, `@playwright/test` **not installed**, no host `psql` (runner uses
  `docker exec`).

Seed freshness guard: `run_all.sh:48-53` refuses when no `schedule_days` row
has `day = current_date + 1`. The same staleness breaks e2e (see §C). One
`db reset` before the whole suite; a reset per file is a full drop + migrate
+ seed (tens of seconds) and would also destroy a parallel worker's session.

Data isolation options, ranked for this project:

1. **Fresh rider per run/worker via `/auth/signup`** (recommended). Confirm-free
   locally, profile by trigger, no collision with Anna/Piotr, matches
   Playwright's "one account per worker" guidance (auth docs, fetched
   2026-09-09). Bookings still collide only on the slot, so with 1–2 scenarios
   run `workers: 1` (or give each worker a distinct horse-hour). Leaves orphan
   users until the next reset — acceptable, the seed guard forces a daily reset
   anyway. Trade-off: stable list shows "(bez nazwiska)" for that rider.
2. **`db reset` before the run + seeded Anna via `storageState`, tests cancel
   their own bookings.** Simplest, but Anna's Bella@11 and the "Twój zapis"
   chip are shared state; a crashed test leaves an active booking that turns
   the next run red until reset.
3. **Direct DB read/cleanup** (PostgREST with the service key from
   `supabase status -o env`, or `pg` against `127.0.0.1:54322`) — reserve for
   the risk #3 proof "no path returns success without a persisted row", where
   reading `bookings` **is** the oracle; avoid psql (Windows/docker detection).

Recommended minimal shape (for the plan to refine): `playwright.config.ts`
(`testDir: "e2e"`, `baseURL` 4321, `webServer: npm run preview`, `workers: 1`,
`retries: CI ? 1 : 0`, `trace: "on-first-retry"`, projects `setup` → `chromium`
with `storageState: playwright/.auth/rider.json`); `e2e/auth.setup.ts` (signs
up `e2e-rider-<parallelIndex>-<ts>@example.com`, waits for `/jezdziec`, saves
state); `e2e/rider-loop.spec.ts` (catalogue → `?dzien=<tomorrow>` → click
button named by horse in the 12:00 listitem → `sukces=1` + "Twój zapis" badge →
`/jezdziec/zapisy` row → "Odwołaj" → success + button reappears on the stable
page; plus one refusal path, e.g. Piotr on Bella@11 → "Ten slot został właśnie
zajęty…" and no row in his list); scripts `test:e2e` and a local variant that
resets + builds first; `.gitignore` + ESLint override; CI job `e2e` as
described. AGENTS.md "Hard rules" and test-plan §4/§5/§6.3/§6.4/§6.5 need the
matching update (stale-docs lesson from Phase 1).

Cost × signal on the open §5 decision ("CI on PR or local gate"): required PR
gate costs +4–6 min wall-clock in parallel (~2–3 min longer to deploy), four
Docker images per cold run, one new flake surface (workerd preview + GoTrue
readiness + Chromium). Signal: it is the **only** layer that proves SSR pages,
redirects, session cookies and Polish refusal text together — risks #6/#3 are
unreachable by Vitest or `db-tests`. Recommendation for the plan: required CI
gate on PR with `retries: 1` and a 20-minute timeout; downgrade to "local gate
+ push-to-main job" only if the auth stack proves flaky or routinely exceeds
~8 minutes.

## Code References

- `src/pages/jezdziec/osrodki/[id].astro:18-24` — `dzien`/`sukces`/`error` params, default tomorrow
- `src/pages/jezdziec/osrodki/[id].astro:49-63` — assignment filter + `computeSlotSections` call (SSR only)
- `src/pages/jezdziec/osrodki/[id].astro:117-126` — success/error banners (query-param driven, verbatim)
- `src/pages/jezdziec/osrodki/[id].astro:153-214` — day form, three slot states, per-horse booking forms
- `src/pages/jezdziec/zapisy.astro:56-137` — "Moje zapisy" rows, cancel form, history section
- `src/pages/osrodek/zapisy.astro:19,61-119` — stable day list (default today, `full_name`)
- `src/pages/api/bookings/create.ts:14-39` — `backToStable` PRG helper (message dropped when `stableId` invalid)
- `src/pages/api/bookings/create.ts:41-46` — `errorCode` (string-only)
- `src/pages/api/bookings/create.ts:66-105` — guards, `getUser`, insert, catch, success 302
- `src/pages/api/bookings/cancel.ts:29-74` — cancel flow with read-back
- `src/pages/api/auth/signin.ts:30-32,43` — raw `error.message` pass-through; role home redirect
- `src/lib/bookings/queries.ts:12-20` — `getTakenSlots` RPC wrapper
- `src/lib/bookings/queries.ts:29-42` — `getMyBookings` (explicit rider filter, active only)
- `src/lib/bookings/queries.ts:209-220` — `createBooking` insert without `.select()`
- `src/lib/bookings/errors.ts:11-31` — code → Polish message table + FALLBACK
- `src/lib/bookings/slots.ts:36-84` — `computeSlotSections` and semantics
- `src/lib/bookings/slots.test.ts:19-110` — existing 12 cases (PRD literals)
- `src/lib/bookings/schema.ts:10-15` — zod booking schema
- `src/lib/form-data.ts:8-11` — `formValue` returns `""` for missing fields
- `src/lib/schedule/dates.ts:24-35,63-65` — Warsaw ISO date helpers, default schedule date
- `src/middleware.ts:36-82` — route guards and role redirects
- `src/lib/supabase.ts:6-27` — SSR client and cookie handling
- `src/components/auth/SignInForm.tsx:43-84` — native form, labels, button text
- `src/components/stables/StableCard.astro:16-26` — whole card is one link
- `supabase/migrations/20260810090100_schedule_and_bookings.sql:94-124,135-171,263-310` — bookings table, partial index, hours trigger, RLS policies
- `supabase/migrations/20260819090000_booking_slot_occupancy.sql:13-32` — `get_taken_slots` RPC
- `supabase/seed.sql:18-58,90-152` — personas, stables, horses, days, bookings
- `supabase/config.toml:10,29,209` — API/DB ports, confirmations off
- `supabase/tests/run_all.sh:28-53` — readiness + seed-freshness guard
- `supabase/tests/concurrent_double_booking.sh:44-50,73-76` — deletes Kasztan@12 (collision with e2e)
- `.github/workflows/ci.yml:10-73` — `ci`, `db-tests`, `deploy` jobs
- `astro.config.mjs:12-22` — Cloudflare adapter, env schema
- `vitest.config.ts:14-16` — unit include glob
- `eslint.config.js:12-66` — type-aware config, gitignore import

## Architecture Insights

- **PRG everywhere, JSON nowhere.** Since S-04 the app has a single response
  shape for mutations: 302 with `?error=<Polish text>` or `?sukces=1`. This
  makes e2e waits trivial (`waitForURL`) and makes the banner a weak oracle —
  the strong oracles are re-read views.
- **Guardrails live in the database; the app only translates.** Slot rule
  clauses 2 and 3 are enforced by FK/index/trigger; the pure function only
  owns clause 1 plus presentation (mine/taken/past). A unit table "from PRD
  examples" therefore covers clause 1 completely and clauses 2–3 only if the
  page filter is extracted or the test moves to e2e/SQL.
- **Read-back is the project's anti-"silent success" pattern** (cancel,
  toggle-active) and `create.ts` is the one mutation without it. Whether to
  add `.select('id').single()` to `createBooking` is a product/plan decision;
  the test must be written so it fails without a persisted row either way.
- **RLS + security-definer RPC is the occupancy contract.** Any test that
  seeds a foreign rider's booking and expects the slot to disappear is testing
  that RPC, not the page.
- **Explicit filter, never broad RLS** is the most-repeated review lesson
  (S-04 F1, S-05, S-06) — relevant when the plan writes DB reads for oracles.
- **Server-side Warsaw time** is an explicit decision (Workers run UTC); tests
  computing "tomorrow" must use the same helper or reimplement it identically.

## Historical Context (from prior changes)

- `context/archive/2026-08-19-slot-booking-flow/plan.md:16,46,163` — PRG canon
  ("Żadnych odpowiedzi JSON"), no-JavaScript forms (one submit per horse),
  `?sukces=` introduced as a new pattern in S-04.
- `context/archive/2026-08-19-slot-booking-flow/plan.md:13,33,68` — RPC
  rationale (rider cannot see others' rows), `active` flag deliberately not
  consulted for slots, RPC contract (security definer, `(horse_id, hour)` only).
- `context/archive/2026-08-19-slot-booking-flow/plan.md:18,191,204` — seeded
  oracle cases (Bella@11 = `23505`, Iskra = `23503`, hours 9/16 = `23514`),
  manual loop books Kasztan@12, planned slot test list.
- `context/archive/2026-08-19-slot-booking-flow/reviews/plan-review.md` F4, F5 —
  fully-taken hour dropped; `concurrent_double_booking.sh` wipes the manual
  e2e slot (ordering fix, not isolation).
- `context/archive/2026-08-19-slot-booking-flow/reviews/impl-review.md` F1, F3 —
  explicit `rider_id` filter; `loadFailed` branch so a misconfigured env shows
  "Nie udało się wczytać ośrodka." instead of "not found".
- `context/archive/2026-08-20-booking-cancellation/plan.md:15` — soft delete,
  explicit ownership filter.
- `context/archive/2026-08-10-role-aware-auth/plan.md:322,466` — client and
  server validation messages must be identical strings (good for text
  selectors).
- `context/archive/2026-09-08-testing-database-guarantees-in-ci/plan-brief.md:28,46`,
  `plan.md:56`, `research.md:89,189-191,203,241` — HTTP layer explicitly
  deferred to Phase 2 ("Wymaga serwera Astro + GoTrue w CI"), `db start` has no
  GoTrue, the `-x` exclusion list, `status -o env`, "+1–2 min with auth stack",
  "a redirect without `error=` is the app's only success signal", scenarios
  provable only via HTTP (rider calling a stable endpoint, stable cancelling)
  parked for Phase 2 §6.4.
- `context/archive/2026-09-08-testing-database-guarantees-in-ci/reviews/impl-review.md`
  F1, F2, F4, F5 — refuse non-localhost DB, Windows bash shim, job timeout,
  cold-runner barrier flake.
- `context/changes/deployment/deployment-plan.md:9,97,100` — Astro CSRF
  `checkOrigin` → 403 without `Origin`; endpoints take FormData not JSON
  (matters only for raw `request.post` assertions); KV `SESSION` binding.
- `context/foundation/test-plan.md:121,190-196,203-213` — the open gate
  decision, §6.3/§6.4 placeholders, §6.5 Phase 1 lessons.
- Absent: `context/foundation/lessons.md` and `docs/reference/contract-surfaces.md`
  (noticed in two prior reviews); §6.5 is the de-facto lessons register.

## Related Research

- `context/archive/2026-09-08-testing-database-guarantees-in-ci/research.md`
  — Phase 1 grounding (DB guarantees, CI stack, GoTrue absence).
- `context/archive/2026-08-19-slot-booking-flow/research.md` — original slot
  rule and RLS occupancy analysis.

## Open Questions

Oracle decisions the plan must settle (stop-and-ask, do not guess):

1. **Retired horse still assigned to the day** (`horses.active = false`,
   reachable via the schedule form keeping a selected retired horse). PRD says
   "koń przydzielony do pracy tego dnia" and nothing about retirement; code
   offers it (S-04 decision). Test-plan §2 lists "horse deactivated" as a
   boundary. Assert "offered" (current), "not offered", or leave untested?
2. **Fallback message for permanent refusals.** `42501` (a stable account
   POSTing a booking, or a forged `rider_id`) and `""` (PostgREST unreachable)
   both read "Nie udało się zapisać na jazdę. Spróbuj ponownie." PRD demands a
   "czytelny komunikat" for refusals but does not say "try again" is wrong.
   Pin the current text, or require a distinct message for role refusal?
3. **Missing `hour` field coerces to 0** and surfaces as "poza zakresem pracy"
   (`23514`) instead of "Nieprawidłowa godzina". PRD silent. Is a validation
   error the expected behaviour (then the schema/`formValue` contract changes)?
4. **Should `createBooking` adopt the read-back pattern** (`.select('id')`)? Not
   required for the test to be meaningful, but it changes what regression the
   e2e catches versus what a unit on the endpoint could catch.
5. **`{}` incident root cause** is unconfirmed. The plan should include a
   sabotage step that makes a `TypeError` reach the rider (e.g. wrong
   `SUPABASE_URL`) and asserts the Polish fallback, plus decide whether the
   sign-in pass-through of English `error.message` is in scope (test-plan §7
   excludes Supabase Auth *configuration*, not our rendering of its errors).
6. **Gate placement** (§5): required PR gate vs local — recommendation above,
   but it is the user's call given runner budget.

Investigation not needed for the plan but noted: the empty-state sentence
"Brak wolnych slotów tego dnia. Wszystkie terminy są zajęte albo już minęły."
also covers "zero horses assigned" — PRD-compliant (an empty state), slightly
misleading wording.
