---
change_id: stable-directory
title: Katalog oĹ›rodkĂłw z filtrowaniem dla jeĹşdĹşca
status: archived
created: 2026-08-11
updated: 2026-08-19
archived_at: 2026-08-19T21:15:45Z
---

## Notes

Roadmap item **S-03** (`context/foundation/roadmap.md`), status `ready`. Backlog: GH [#5](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/issues/5).

Outcome wg roadmapy: jeĹşdziec moĹĽe przeglÄ…daÄ‡ i filtrowaÄ‡ listÄ™ oĹ›rodkĂłw i wybraÄ‡ oĹ›rodek, do ktĂłrego chce siÄ™ zapisaÄ‡.

PRD refs: FR-006. Prerequisites: S-01 (zrobione). Parallel with: S-02 â€” ĹĽadna z gaĹ‚Ä™zi nie zaleĹĽy od drugiej.

Ryzyko z roadmapy: przeinwestowanie w filtrowanie â€” przy celu â€žszybkie dowiezienie" wystarczy filtr prosty, zgodny z literÄ… FR-006.

Baseline po S-01: przestrzeĹ„ `/jezdziec` istnieje i jest chroniona mapÄ… tras z `src/lib/auth/roles.ts`; `stables` ma politykÄ™ odczytu `using (true)` dla zalogowanych, wiÄ™c katalog nie wymaga zmian w RLS; kolumna `stables.city` powstaĹ‚a w F-01 wĹ‚aĹ›nie pod ten filtr.
