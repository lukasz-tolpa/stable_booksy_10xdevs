---
change_id: booking-data-schema
title: Model danych rezerwacji z twardą regułą braku dubla konia
status: implemented
created: 2026-08-10
updated: 2026-08-10
archived_at: null
---

## Notes

Roadmap item **F-01** (`context/foundation/roadmap.md`), status `ready`, brak wymagań wstępnych. Backlog: GH [#2](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/issues/2).

Outcome wg roadmapy: model danych domeny — ośrodki, konie, grafik dnia (zakres godzin + konie pracujące), zapisy — osadzony w bazie, wraz z twardą regułą integralności: jeden koń w jednym slocie ma najwyżej jeden zapis, egzekwowaną przez bazę niezależnie od współbieżności, oraz izolacją danych: konto ośrodka modyfikuje wyłącznie dane własnej stadniny.

PRD refs: §Business Logic (reguła alokacji slotów, slot 1 h), §Non-Functional Requirements (tylko jeden zapis przy współbieżnych próbach), §Guardrails, §Access Control.

Unlocks: S-01, S-02, S-04, S-05, S-06.

Ryzyko z roadmapy: przekombinowanie modelu slotów — PRD ustala stałą długość 1 h i brak limitu godzin konia w v1, trzymać się tego. Baseline: `supabase/config.toml` istnieje, ale brak schematu i katalogu migracji.
