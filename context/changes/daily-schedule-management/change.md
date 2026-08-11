---
change_id: daily-schedule-management
title: Grafik dnia ośrodka - godziny pracy i konie pracujące
status: implementing
created: 2026-08-11
updated: 2026-08-11
archived_at: null
---

## Notes

Roadmap item **S-02** (`context/foundation/roadmap.md`), status `ready` od 2026-08-11. Backlog: GH [#4](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/issues/4).

Outcome wg roadmapy: ośrodek może ustawić zakres godzin pracy na dany dzień i wskazać konie pracujące tego dnia; z tego generują się dostępne sloty dla jeźdźców.

PRD refs: US-02, FR-003 (zakres godzin na dany dzień), FR-004 (konie pracujące w danym dniu). Prerequisites: F-01 i S-01 — oba zrobione. Parallel with: S-03 (zrobione).

### Rozstrzygnięta decyzja produktowa (Otwarte pytanie #2 PRD)

Zmiana grafiku kolidująca z aktywnym zapisem jest **odrzucana z czytelnym komunikatem**; zapisy nigdy nie są kasowane przez edycję grafiku. Reguła ma dwie połowy:

- **Konie** — działa od F-01: `on delete restrict` odrzuca wypisanie konia z dnia, w którym ma aktywny zapis (`23503`).
- **Godziny** — **NIE działa**. Trigger sprawdzający godzinę wisi na `bookings` i odpala się przy zapisie, nie przy edycji grafiku. `UPDATE schedule_days SET close_hour = 11` pod zapisem o 11:00 przechodzi dziś bez oporu i osierocą zapis.

Z tego wynika główna niespodzianka tego slice'a: **S-02 wymaga migracji** — trigger na `schedule_days` z własnym kodem błędu, żeby obie połowy reguły żyły w bazie obok reszty guardraili. Połowa reguły wygląda na działającą i łatwo uznać temat za domknięty.

Poza v1: odwoływanie cudzych zapisów przez ośrodek (FR-009 daje to prawo wyłącznie jeźdźcowi).

### Baseline

Godziny pracy to przedział półotwarty `[open_hour, close_hour)` — 10–16 znaczy sloty 10…15. Tabele `schedule_days` i `schedule_day_horses` istnieją od F-01 wraz z politykami zapisu dla właściciela stadniny; `/osrodek` jest chronione mapą tras z `src/lib/auth/roles.ts`, a konto ośrodka ma gwarantowaną stadninę dzięki wymuszeniu z S-01. Wzorce: `zod` w endpointach, formularze progresywne, Vitest na czystej logice, teksty po polsku.
