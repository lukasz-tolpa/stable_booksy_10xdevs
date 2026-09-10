# Follow-ups from the implementation review (2026-09-10)

Items accepted during triage of `reviews/impl-review.md` that are not part of this
change. Each is a candidate for its own `/10x-new`.

- **F7 — `?error=` carries free text on eight pages.** Astro/React escape it (no XSS,
  no open redirect), but any link can render an arbitrary Polish sentence in a
  `role="alert"` banner on `/`, `/auth/signin`, `/auth/signup` and the five protected
  pages — a phishing lure. Cross-cutting fix: pass a short key in `?error=` and look the
  sentence up server-side in the area's closed set (`src/lib/*/errors.ts`), which also
  makes the "closed Polish set" guarantee hold end-to-end. Touches every endpoint that
  redirects with `?error=` and every page that renders it; worth one change of its own.
- **F5 — PostgREST errors on the profile query are all "outage".** A permanent
  misconfiguration (RLS denying the own-profile read, `42501`; `PGRST3xx`) is shown as
  "Chwilowy problem" while the code goes to the log. Accepted for the MVP; revisit if the
  log shows `42501` on `auth:session` more than once.
