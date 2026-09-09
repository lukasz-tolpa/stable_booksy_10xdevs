---
change_id: testing-quality-gates-and-agent-loop
title: Test rollout Phase 3 - quality gates and the per-edit agent loop
status: impl_reviewed
created: 2026-09-09
updated: 2026-09-09
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Quality gates and agent loop". Risks covered: cross-cutting (no single §2 risk; the phase locks the floor under all six). Test types planned: post-edit hook (agent loop), quality gates. Risk response intent: (1) lint + typecheck run at edit time inside the agent loop — a PostToolUse hook on Write|Edit that lints/formats the touched file and, only when the file is in a risk area (src/lib/bookings, src/lib/schedule, src/pages/api), runs the related Vitest tests with `vitest related --run`; feedback returns to the agent via exit code 2 + stdout; must stay fast (seconds), never the whole suite; (2) pre-commit stays on the existing Husky + lint-staged (do not migrate to Lefthook), pre-push adds the heavier checks (full `npm test`, and `astro check` if it is adopted); (3) every test layer above is a required CI gate: verify branch protection on main actually requires ci, db-tests and e2e, and flip the §5 post-edit row from recommended to its final state; challenge "a slow per-edit hook is fine" (it blocks every edit) and "the hook replaces CI" (it does not); avoid running the whole suite per edit, hooks that swallow exit codes, and gates that are documented but not enforced. Read context/foundation/test-plan.md §5 and §6.5 first. After creating the folder, follow the downstream continuation rule.
