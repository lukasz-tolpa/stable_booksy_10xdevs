---
change_id: stable-directory
title: Katalog ośrodków z filtrowaniem dla jeźdźca
status: implementing
created: 2026-08-11
updated: 2026-08-11
archived_at: null
---

## Notes

Roadmap item **S-03** (`context/foundation/roadmap.md`), status `ready`. Backlog: GH [#5](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/issues/5).

Outcome wg roadmapy: jeździec może przeglądać i filtrować listę ośrodków i wybrać ośrodek, do którego chce się zapisać.

PRD refs: FR-006. Prerequisites: S-01 (zrobione). Parallel with: S-02 — żadna z gałęzi nie zależy od drugiej.

Ryzyko z roadmapy: przeinwestowanie w filtrowanie — przy celu „szybkie dowiezienie" wystarczy filtr prosty, zgodny z literą FR-006.

Baseline po S-01: przestrzeń `/jezdziec` istnieje i jest chroniona mapą tras z `src/lib/auth/roles.ts`; `stables` ma politykę odczytu `using (true)` dla zalogowanych, więc katalog nie wymaga zmian w RLS; kolumna `stables.city` powstała w F-01 właśnie pod ten filtr.
