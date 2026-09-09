---
change_id: testing-rider-loop-in-the-browser
title: Test rollout Phase 2 - rider loop in the browser (e2e + slot unit tests)
status: implemented
created: 2026-09-09
updated: 2026-09-09
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Rider loop in the browser". Risks covered: #6 the whole rider loop (catalogue -> slots -> booking -> my bookings -> cancel) stops working in the browser after a change and nobody notices; #3 rider clicks "Zapisz" and gets a success page without a booking in the database, or an unreadable error (e.g. `{}`); #5 rider sees a slot that should not be offered (outside working hours, horse not assigned that day, already taken) or does not see a genuinely free one. Test types planned: e2e (Playwright, 1-2 scenarios) + unit (pure slot logic, table-driven from PRD examples). Risk response intent: #6 - a browser walks the rider loop end to end against seeded data and every step renders the expected state; a deliberate break in any step turns the test red; challenge "unit tests on src/lib cover the loop"; avoid sleepy waits, brittle CSS selectors, shared mutable data across runs, asserting only that the page loaded. #3 - after a successful booking the ride appears in "Moje zapisy" and in the stable's day list; after a refused booking the rider sees a Polish, specific message; no path returns success without a persisted row; challenge "HTTP 302 after POST means the booking

<!-- The intent above was cut off by the terminal at "HTTP 302 after POST means the booking". The #3 challenge and the #5 risk-response intent were not received; see test-plan.md §2/§3 for the full statement. -->
