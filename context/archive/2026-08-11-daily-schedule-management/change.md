---
change_id: daily-schedule-management
title: Grafik dnia oĹ›rodka - godziny pracy i konie pracujÄ…ce
status: archived
created: 2026-08-11
updated: 2026-08-19
archived_at: 2026-08-19T21:00:53Z
---

## Notes

Roadmap item **S-02** (`context/foundation/roadmap.md`), status `ready` od 2026-08-11. Backlog: GH [#4](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/issues/4).

Outcome wg roadmapy: oĹ›rodek moĹĽe ustawiÄ‡ zakres godzin pracy na dany dzieĹ„ i wskazaÄ‡ konie pracujÄ…ce tego dnia; z tego generujÄ… siÄ™ dostÄ™pne sloty dla jeĹşdĹşcĂłw.

PRD refs: US-02, FR-003 (zakres godzin na dany dzieĹ„), FR-004 (konie pracujÄ…ce w danym dniu). Prerequisites: F-01 i S-01 â€” oba zrobione. Parallel with: S-03 (zrobione).

### RozstrzygniÄ™ta decyzja produktowa (Otwarte pytanie #2 PRD)

Zmiana grafiku kolidujÄ…ca z aktywnym zapisem jest **odrzucana z czytelnym komunikatem**; zapisy nigdy nie sÄ… kasowane przez edycjÄ™ grafiku. ReguĹ‚a ma dwie poĹ‚owy:

- **Konie** â€” dziaĹ‚a od F-01: `on delete restrict` odrzuca wypisanie konia z dnia, w ktĂłrym ma aktywny zapis (`23503`).
- **Godziny** â€” **NIE dziaĹ‚a**. Trigger sprawdzajÄ…cy godzinÄ™ wisi na `bookings` i odpala siÄ™ przy zapisie, nie przy edycji grafiku. `UPDATE schedule_days SET close_hour = 11` pod zapisem o 11:00 przechodzi dziĹ› bez oporu i osierocÄ… zapis.

Z tego wynika gĹ‚Ăłwna niespodzianka tego slice'a: **S-02 wymaga migracji** â€” trigger na `schedule_days` z wĹ‚asnym kodem bĹ‚Ä™du, ĹĽeby obie poĹ‚owy reguĹ‚y ĹĽyĹ‚y w bazie obok reszty guardraili. PoĹ‚owa reguĹ‚y wyglÄ…da na dziaĹ‚ajÄ…cÄ… i Ĺ‚atwo uznaÄ‡ temat za domkniÄ™ty.

Poza v1: odwoĹ‚ywanie cudzych zapisĂłw przez oĹ›rodek (FR-009 daje to prawo wyĹ‚Ä…cznie jeĹşdĹşcowi).

### Baseline

Godziny pracy to przedziaĹ‚ pĂłĹ‚otwarty `[open_hour, close_hour)` â€” 10â€“16 znaczy sloty 10â€¦15. Tabele `schedule_days` i `schedule_day_horses` istniejÄ… od F-01 wraz z politykami zapisu dla wĹ‚aĹ›ciciela stadniny; `/osrodek` jest chronione mapÄ… tras z `src/lib/auth/roles.ts`, a konto oĹ›rodka ma gwarantowanÄ… stadninÄ™ dziÄ™ki wymuszeniu z S-01. Wzorce: `zod` w endpointach, formularze progresywne, Vitest na czystej logice, teksty po polsku.
