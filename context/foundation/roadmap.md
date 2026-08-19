---
project: "Stable Booksy"
version: 1
status: draft
created: 2026-08-06
updated: 2026-08-19
prd_version: 1
main_goal: speed
top_blocker: decisions
---

# Roadmap: Stable Booksy

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Stadniny prowadzą zapisy na jazdy i przydział koni ręcznie — w zeszycie lub Excelu — co jest czasochłonne i podatne na błędy (dubel konia, kolizje godzin). Przydział koni to nie zwykły kalendarz, lecz alokacja zasobu z ograniczeniami (zakres godzin pracy ośrodka, konie przydzielone do dnia), której generyczne narzędzia nie pilnują. MVP domyka pełną pętlę rezerwacji: ośrodek układa grafik dnia, jeździec wybiera wolny slot (godzina × koń) i zapisuje się bez kolizji.

## North star

**S-04: Jeździec widzi wolne sloty i rezerwuje jazdę** — najmniejszy przepływ end-to-end realizujący wprost główne kryterium sukcesu PRD („pełna pętla rezerwacji … bez kolizji"), umieszczony tak wcześnie, jak pozwalają jego wymagania wstępne, bo przy celu „szybkie dowiezienie" wszystko inne ma sens tylko, jeśli ta pętla działa.

> Gwiazda przewodnia (north star) oznacza tu: najmniejszy plasterek end-to-end, którego udane dowiezienie udowadnia centralną hipotezę produktu — dlatego stoi najwcześniej, jak się da, a pozostałe plasterki są sekwencjonowane pod jego odblokowanie. Definicja podana raz, tutaj.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                                    | Prerequisites    | PRD refs                       | Status   |
| ---- | ------------------------- | ----------------------------------------------------------------------- | ---------------- | ------------------------------ | -------- |
| F-01 | booking-data-schema       | (foundation) model danych rezerwacji z twardą regułą braku dubla konia  | —                | §Business Logic, §NFR, §Guardrails | done     |
| S-01 | role-aware-auth           | użytkownik zakłada konto jako Ośrodek albo Jeździec i loguje się        | F-01             | FR-001, FR-002                 | done     |
| S-02 | daily-schedule-management | ośrodek ustawia zakres godzin i konie pracujące danego dnia             | F-01, S-01       | US-02, FR-003, FR-004          | done     |
| S-03 | stable-directory          | jeździec przegląda i filtruje listę ośrodków                            | S-01             | FR-006                         | done     |
| S-04 | slot-booking-flow         | jeździec widzi wolne sloty (godzina × koń) i rezerwuje jazdę            | F-01, S-02, S-03 | US-01, FR-007, FR-008          | done     |
| S-05 | daily-bookings-list       | ośrodek widzi listę zapisów (godzina–koń–jeździec) na dany dzień        | S-02, S-04       | FR-005                         | proposed |
| S-06 | booking-cancellation      | jeździec odwołuje swój zapis, zwalniając slot konia                     | S-04             | FR-009                         | proposed |

## Baseline

What's already in place in the codebase as of `2026-08-06` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — scaffold startera działa (strony, komponenty, style; `src/pages/`, `src/components/`).
- **Backend / API:** partial — istnieją wyłącznie endpointy logowania/rejestracji (`src/pages/api/auth/`); zero endpointów domenowych.
- **Data:** absent — konfiguracja bazy istnieje (`supabase/config.toml` + link do projektu), ale brak jakiegokolwiek schematu i katalogu migracji.
- **Auth:** partial — logowanie e-mail+hasło działa end-to-end (formularze, endpointy, middleware chroniący trasy), ale brak pojęcia roli: rejestracja nie zbiera typu konta Ośrodek/Jeździec.
- **Deploy / infra:** present — CI na `main` (lint + build) i auto-deploy po merge'u; hardening domknięty.
- **Observability:** absent — brak dedykowanego logowania/śledzenia błędów; nic w PRD tego nie wymusza, więc świadomie pomijane przy celu „szybkie dowiezienie".

## Foundations

### F-01: Model danych rezerwacji z regułą integralności

- **Outcome:** (foundation) model danych domeny — ośrodki, konie, grafik dnia (zakres godzin + konie pracujące), zapisy — osadzony w bazie, wraz z twardą regułą integralności: jeden koń w jednym slocie ma najwyżej jeden zapis, egzekwowaną przez bazę niezależnie od współbieżności, oraz izolacją danych: konto ośrodka modyfikuje wyłącznie dane własnej stadniny.
- **Change ID:** booking-data-schema
- **PRD refs:** §Business Logic (reguła alokacji slotów, slot 1 h), §Non-Functional Requirements (tylko jeden zapis przy współbieżnych próbach), §Guardrails i §Access Control (izolacja danych ośrodka)
- **Unlocks:** S-01 (konto z rolą), S-02 (grafik dnia), S-04 (rezerwacja z gwarancją braku dubla — ścieżka weryfikacji NFR współbieżności), S-05, S-06
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** sekwencjonowany pierwszy, bo każdy plasterek konsumuje ten model, a guardrail współbieżności musi żyć w bazie, nie w kodzie aplikacji; główne ryzyko to przekombinowanie modelu slotów — PRD ustala stałą długość 1 h i brak limitu godzin konia w v1, trzymać się tego.
- **Status:** done

## Slices

### S-01: Konto z wyborem roli

- **Outcome:** użytkownik może zarejestrować konto jako Ośrodek albo Jeździec, zalogować się e-mailem i hasłem i trafić do widoku właściwego dla swojej roli.
- **Change ID:** role-aware-auth
- **PRD refs:** FR-001, FR-002, §Access Control
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** rozszerza istniejący, działający scaffold logowania o wybór roli — ryzykiem jest regresja obecnego przepływu; celowo przed plasterkami domenowymi, bo obie role są w ich warunkach wstępnych („zalogowany jeździec", „zalogowane konto ośrodka").
- **Status:** done

### S-02: Grafik dnia ośrodka

- **Outcome:** ośrodek może ustawić zakres godzin pracy na dany dzień i wskazać konie pracujące tego dnia; z tego generują się dostępne sloty dla jeźdźców.
- **Change ID:** daily-schedule-management
- **PRD refs:** US-02, FR-003, FR-004
- **Prerequisites:** F-01, S-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** — (rozstrzygnięte 2026-08-11)
- **Risk:** decyzja produktowa zapadła: kolidująca zmiana grafiku jest odrzucana z komunikatem, zapisy nigdy nie giną. Połowa reguły (konie) jest już w bazie od F-01; druga połowa (zawężanie godzin) wymaga triggera na `schedule_days` i dziś przechodzi po cichu — to jest główne ryzyko tego plasterka, bo wygląda na działające, a nie jest.
- **Status:** done

### S-03: Katalog ośrodków

- **Outcome:** jeździec może przeglądać i filtrować listę ośrodków i wybrać ośrodek, do którego chce się zapisać.
- **Change ID:** stable-directory
- **PRD refs:** FR-006
- **Prerequisites:** S-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** prosty plasterek, celowo równoległy do S-02 (żadna z gałęzi nie zależy od drugiej); ryzykiem jest przeinwestowanie w filtrowanie — przy celu „szybkie dowiezienie" wystarczy filtr prosty, zgodny z literą FR-006.
- **Status:** done

### S-04: Rezerwacja jazdy

- **Outcome:** jeździec widzi wyłącznie wolne sloty (godzina × koń) zgodne z regułą alokacji i może zapisać się na jazdę; zapis pojawia się po stronie ośrodka, a próba zapisu na zajęty slot jest odrzucana z czytelnym komunikatem.
- **Change ID:** slot-booking-flow
- **PRD refs:** US-01, FR-007, FR-008, §Non-Functional Requirements (współbieżność, obsługa mobilna)
- **Prerequisites:** F-01, S-02, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** gwiazda przewodnia — walidacja produktu; największe ryzyko techniczne całego MVP (odmowa przy współbieżnym zapisie musi być czytelna, pusty grafik musi mieć stan pusty), dlatego nic poza twardymi wymaganiami wstępnymi nie stoi przed nim w kolejce.
- **Status:** done

### S-05: Lista zapisów dnia

- **Outcome:** ośrodek widzi prostą listę zapisów (godzina–koń–jeździec) na wybrany dzień.
- **Change ID:** daily-bookings-list
- **PRD refs:** FR-005
- **Prerequisites:** S-02, S-04
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** mały plasterek konsumujący dane zapisów; ryzykiem jest pokusa siatki godzina×koń — PRD świadomie zawęża v1 do prostej listy na wybrany dzień.
- **Status:** proposed

### S-06: Odwołanie zapisu

- **Outcome:** jeździec może odwołać swój zapis, co zwalnia slot konia do ponownej rezerwacji.
- **Change ID:** booking-cancellation
- **PRD refs:** FR-009, §Success Criteria (Secondary)
- **Prerequisites:** S-04
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** jedyne wymaganie o priorytecie „miło mieć" — celowo ostatni, żeby nie zjadał czasu ścieżki wymagań koniecznych; PRD wprost: „robimy, jeśli starczy czasu, nie blokuje v1".
- **Status:** proposed

## Backlog Handoff

Zmigrowane do GitHub Issues 2026-08-07 (tracking: [#1](https://github.com/lukasz-tolpa/stable_booksy_10xdevs/issues/1), milestone `MVP v1`).

| Roadmap ID | Change ID                 | Suggested issue title                                     | Ready for `/10x-plan` | Notes                              |
| ---------- | ------------------------- | --------------------------------------------------------- | --------------------- | ---------------------------------- |
| F-01       | booking-data-schema       | Model danych rezerwacji + reguła braku dubla konia        | done                  | GH #2 — zaimplementowany, patrz `context/changes/booking-data-schema/` |
| S-01       | role-aware-auth           | Rejestracja i logowanie z wyborem roli Ośrodek/Jeździec   | done                  | GH #3 — zaimplementowany, patrz `context/changes/role-aware-auth/` |
| S-02       | daily-schedule-management | Grafik dnia: godziny pracy + konie pracujące              | done                  | GH #4 — zaimplementowany, patrz `context/changes/daily-schedule-management/` |
| S-03       | stable-directory          | Katalog ośrodków z filtrowaniem                           | done                  | GH #5 — zaimplementowany, patrz `context/changes/stable-directory/` |
| S-04       | slot-booking-flow         | Rezerwacja jazdy: wolne sloty godzina × koń               | yes                   | GH #6 — Run `/10x-plan slot-booking-flow` |
| S-05       | daily-bookings-list       | Lista zapisów dnia dla ośrodka                            | no                    | GH #7 — czeka na S-02, S-04        |
| S-06       | booking-cancellation      | Odwołanie zapisu przez jeźdźca                            | no                    | GH #8 — czeka na S-04              |

## Open Roadmap Questions

1. ~~**Konflikt grafiku z istniejącymi zapisami**~~ — **ROZSTRZYGNIĘTE 2026-08-11**: kolidująca zmiana grafiku jest odrzucana z komunikatem, zapisy nie są kasowane. Konie pilnuje `on delete restrict` z F-01; zawężanie godzin wymaga triggera na `schedule_days` do dołożenia w S-02. Szczegóły w PRD, Open Questions #2.
2. **Dzienny limit godzin pracy konia** — czy v2 wprowadza ograniczenie maks. N godzin/dzień na konia? — Owner: user. Block: żaden plasterek v1 (kandydat na v2; patrz Parked).

## Parked

- **Statystyki zajęć, komentarze i analiza AI** — Why parked: PRD §Non-Goals; poza pętlą rezerwacji, którą udowadnia MVP (plan: v2).
- **Opinie / recenzje trenerów, ośrodków i koni** — Why parked: PRD §Non-Goals; nie budujemy w v1.
- **Ulubione oraz dedykowana / AI-proponowana lista koni** — Why parked: PRD §Non-Goals; brak personalizacji doboru koni w v1.
- **Formularz zapytania do stadniny** — Why parked: PRD §Non-Goals; brak kanału kontaktowego w v1.
- **Dzienny limit godzin pracy konia** — Why parked: PRD §Non-Goals + Otwarte pytanie #1; reguła alokacji v1 świadomie nie pilnuje limitu.

## Done

(Empty on first generation — `/10x-archive` appends entries here and flips item Status to `done` when a matching change is archived.)

- **F-01: (foundation) model danych domeny — ośrodki, konie, grafik dnia (zakres godzin + konie pracujące), zapisy — osadzony w bazie, wraz z twardą regułą integralności: jeden koń w jednym slocie ma najwyżej jeden zapis, egzekwowaną przez bazę niezależnie od współbieżności, oraz izolacją danych: konto ośrodka modyfikuje wyłącznie dane własnej stadniny.** — Archived 2026-08-19 → `context/archive/2026-08-10-booking-data-schema/`. Lesson: —.
- **S-02: ośrodek może ustawić zakres godzin pracy na dany dzień i wskazać konie pracujące tego dnia; z tego generują się dostępne sloty dla jeźdźców.** — Archived 2026-08-19 → `context/archive/2026-08-11-daily-schedule-management/`. Lesson: —.
- **S-04: jeździec widzi wyłącznie wolne sloty (godzina × koń) zgodne z regułą alokacji i może zapisać się na jazdę; zapis pojawia się po stronie ośrodka, a próba zapisu na zajęty slot jest odrzucana z czytelnym komunikatem.** — Archived 2026-08-19 → `context/archive/2026-08-19-slot-booking-flow/`. Lesson: —.
