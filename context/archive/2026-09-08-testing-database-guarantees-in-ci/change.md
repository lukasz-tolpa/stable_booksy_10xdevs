---
change_id: testing-database-guarantees-in-ci
title: Database guarantees in CI (test-plan rollout Phase 1)
status: archived
created: 2026-09-08
updated: 2026-09-09
archived_at: 2026-09-09T08:40:18Z
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Database guarantees in CI". Risks covered: #1 double booking of one horse-hour under concurrent attempts, #2 schedule edit silently invalidating existing bookings, #4 authenticated user reaching another user's data by swapping an identifier. Test types planned: integration (database) run automatically in CI. Risk response intent: #1 - with N parallel attempts from separate connections exactly one booking succeeds, the rest get a readable refusal and the slot holds exactly one active booking; #2 - a colliding schedule edit is refused with a message and the booking stays untouched, a non-colliding edit succeeds; #4 - a request naming another user's resource is refused and data is unchanged even for an authenticated caller, a rider calling a stable-only endpoint gets a role refusal. After creating the folder, follow the downstream continuation rule.
