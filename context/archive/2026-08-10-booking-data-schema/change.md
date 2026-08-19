---
change_id: booking-data-schema
title: Model danych rezerwacji z twardÄ… reguĹ‚Ä… braku dubla konia
status: archived
created: 2026-08-10
updated: 2026-08-19
archived_at: 2026-08-19T21:14:01Z
---

## Notes

Roadmap item **F-01** (`context/foundation/roadmap.md`), status `ready`, brak wymagaĹ„ wstÄ™pnych. Backlog: GH [#2](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/issues/2).

Outcome wg roadmapy: model danych domeny â€” oĹ›rodki, konie, grafik dnia (zakres godzin + konie pracujÄ…ce), zapisy â€” osadzony w bazie, wraz z twardÄ… reguĹ‚Ä… integralnoĹ›ci: jeden koĹ„ w jednym slocie ma najwyĹĽej jeden zapis, egzekwowanÄ… przez bazÄ™ niezaleĹĽnie od wspĂłĹ‚bieĹĽnoĹ›ci, oraz izolacjÄ… danych: konto oĹ›rodka modyfikuje wyĹ‚Ä…cznie dane wĹ‚asnej stadniny.

PRD refs: Â§Business Logic (reguĹ‚a alokacji slotĂłw, slot 1 h), Â§Non-Functional Requirements (tylko jeden zapis przy wspĂłĹ‚bieĹĽnych prĂłbach), Â§Guardrails, Â§Access Control.

Unlocks: S-01, S-02, S-04, S-05, S-06.

Ryzyko z roadmapy: przekombinowanie modelu slotĂłw â€” PRD ustala staĹ‚Ä… dĹ‚ugoĹ›Ä‡ 1 h i brak limitu godzin konia w v1, trzymaÄ‡ siÄ™ tego. Baseline: `supabase/config.toml` istnieje, ale brak schematu i katalogu migracji.
