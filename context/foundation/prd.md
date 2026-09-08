---
project: "Stable Booksy"
version: 1
status: draft
created: 2026-06-23
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# Stable Booksy — PRD

## Vision & Problem Statement

Stadniny koni prowadzą zapisy na jazdy i przydzielanie koni do godzin ręcznie — w zeszycie lub Excelu. Osoba układająca grafik (właściciel/instruktor) musi ręcznie pilnować, który koń jest wolny o danej godzinie, czy nie przekroczono jego dziennego limitu pracy i czy nie ma kolizji zapisów. Jest to czasochłonne i podatne na błędy (dubel konia, kolizje godzin).

Insight: przydział koni to nie zwykły kalendarz, lecz alokacja zasobu z ograniczeniami (limit godzin pracy konia w danym dniu, zakres godzin pracy ośrodka), której generyczne narzędzia (Booksy, Calendly, Kalendarz Google) nie pilnują. Małe, nietechniczne stadniny nie mają dziś dedykowanego, taniego narzędzia — koordynacja jeźdźca z ośrodkiem odbywa się telefonicznie/Messengerem, bez wspólnego, aktualnego grafiku. Dane z zajęć (frekwencja, komentarze) nigdzie nie trafiają, więc właściciel nie ma z nich wglądu.

## User & Persona

**Primary persona — Administrator ośrodka (właściciel / instruktor stadniny).**
Prowadzi małą stadninę, dziś układa grafik ręcznie. Moment sięgnięcia po produkt: planowanie dnia/tygodnia — które konie pracują, w jakich godzinach, i przyjmowanie zapisów bez kolizji. Niezbyt techniczny; potrzebuje prostoty.

### Secondary persona
**Jeździec (użytkownik).** Chce zapisać się na jazdę o konkretnej godzinie na wybranym koniu, bez telefonowania. MVP obsługuje go w stopniu wystarczającym, by domknąć proces zapisu, ale projektujemy najpierw pod ośrodek.

## Success Criteria

### Primary
- Jeździec przechodzi pełną pętlę rezerwacji end-to-end: wybiera ośrodek, wolną godzinę i konia z grafiku ustawionego przez ośrodek, i zapisuje się — bez kolizji. Mierzalne: zapis kończy się sukcesem i pojawia się w grafiku ośrodka.

### Secondary
- Jeździec może samodzielnie odwołać swój zapis, zwalniając slot konia.

### Guardrails
- Żadnej podwójnej rezerwacji tego samego konia w tym samym slocie czasowym.
- Brak zapisów poza zakresem godzin pracy ośrodka (np. poza 10–16) i na konie nieprzydzielone do danego dnia.
- Konto ośrodka może modyfikować wyłącznie grafik i dane własnej stadniny.

## User Stories

### US-01: Jeździec zapisuje się na jazdę

- **Given** zalogowany jeździec, który wybrał ośrodek z listy
- **When** wybiera wolny slot (godzina w zakresie pracy ośrodka) i konia pracującego tego dnia
- **Then** zapis zostaje utworzony i pojawia się w grafiku ośrodka, a slot konia jest zajęty

#### Acceptance Criteria
- Pokazywane są wyłącznie sloty w zakresie godzin pracy ośrodka i konie przydzielone do danego dnia.
- Próba zapisu na zajęty slot konia jest odrzucona z czytelnym komunikatem.
- Pusty grafik (brak koni/godzin na dany dzień) pokazuje stan pusty, nie listę 0 wyników.

### US-02: Ośrodek układa grafik na dzień

- **Given** zalogowane konto ośrodka
- **When** ustawia zakres godzin pracy na dany dzień i wskazuje konie pracujące tego dnia
- **Then** dla jeźdźców generują się dostępne sloty (godzina + koń) w tym zakresie

#### Acceptance Criteria
- Zakres godzin i lista koni dotyczą konkretnej daty.
- Zmiana grafiku nie usuwa istniejących zapisów bez ostrzeżenia (poza zakresem v1: obsługa konfliktu — patrz Open Questions).

## Functional Requirements

### Konta i dostęp
- FR-001: Użytkownik może zarejestrować konto jako Ośrodek albo Jeździec. Priority: must-have
  > Socrates: Kontrargument: "każdy = jeździec, ośrodek to akcja 'dodaj stadninę'". Rozstrzygnięcie: zostaje — dwie role mają różne ekrany od pierwszej chwili, wybór roli przy rejestracji jest uzasadniony.
- FR-002: Użytkownik może zalogować się e-mailem i hasłem. Priority: must-have
  > Socrates: Kontrargument: "zapis bez konta przez link". Rozstrzygnięcie: zostaje — bez tożsamości jeźdźca nie ma odwołania zapisu (FR-009) ani historii; konto wymagane dla obu ról, spójnie z modelem dostępu.

### Zarządzanie grafikiem (Ośrodek)
- FR-003: Ośrodek może ustawić zakres godzin pracy na dany dzień. Priority: must-have
  > Socrates: Kontrargument: "stałe godziny ośrodka wystarczą". Rozstrzygnięcie: zostaje — godziny realnie różnią się dzień do dnia (weekend, pogoda); elastyczność per dzień to rdzeń wartości.
- FR-004: Ośrodek może wskazać, które konie pracują w danym dniu. Priority: must-have
  > Socrates: Kontrargument: "stała lista koni ośrodka". Rozstrzygnięcie: zostaje — konie mają dni wolne/rotację; to właśnie reguła alokacji odróżniająca produkt od zwykłego kalendarza.
- FR-005: Ośrodek może zobaczyć prostą listę zapisów (godzina–koń–jeździec) na dany dzień. Priority: must-have
  > Socrates: Kontrargument: "potrzebny widok kalendarza/siatki". Rozstrzygnięcie: zawężone — w v1 wystarczy prosta lista na wybrany dzień, bez siatki godzina×koń.

### Rezerwacja (Jeździec)
- FR-006: Jeździec może przeglądać i filtrować listę ośrodków. Priority: must-have
  > Socrates: Kontrargument: "filtr to przerost przy kilku ośrodkach". Rozstrzygnięcie: zostaje — filtr był wprost w pierwotnym MVP, oczekiwana funkcja.
- FR-007: Jeździec może zobaczyć wolne sloty (godzina + dostępny koń) w wybranym ośrodku. Priority: must-have
  > Socrates: Kontrargument: "tylko godzina, konia dobiera ośrodek". Rozstrzygnięcie: zostaje — wybór konia to kluczowy insight produktu, bez niego to zwykła rezerwacja godziny.
- FR-008: Jeździec może zapisać się na jazdę na konkretną godzinę z wybranym koniem. Priority: must-have
  > Socrates: Kontrargument: brak — to rdzeń produktu i całe kryterium sukcesu.
- FR-009: Jeździec może odwołać swój zapis. Priority: nice-to-have
  > Socrates: Kontrargument: "odwołania ręcznie przez ośrodek". Rozstrzygnięcie: zostaje jako nice-to-have — to Secondary success, robimy jeśli starczy czasu, nie blokuje v1.

## Non-Functional Requirements

- Przy jednoczesnych próbach zapisu na ten sam slot konia tylko jeden zapis kończy się sukcesem; pozostałe otrzymują czytelną odmowę (brak podwójnej rezerwacji niezależnie od współbieżności).
- Interfejs jest wygodny w obsłudze na ekranie telefonu (jeździec zapisuje się mobilnie).
- Interfejs użytkownika jest w języku polskim.

## Business Logic

Do rezerwacji dostępna jest tylko taka para (koń, godzina), która mieści się w zakresie godzin pracy ośrodka tego dnia, dotyczy konia przydzielonego do pracy tego dnia i nie jest już zajęta innym zapisem.

Wejścia reguły (jako dane podawane przez użytkowników): zakres godzin pracy ośrodka na dany dzień i lista koni pracujących tego dnia (ustawiane przez ośrodek), oraz wybór godziny i konia (dokonywany przez jeźdźca). Wyjściem jest zbiór wolnych slotów (godzina × koń) prezentowany jeźdźcowi oraz przyjęcie albo odrzucenie próby zapisu. Jeździec napotyka regułę w momencie przeglądania ośrodka: widzi wyłącznie sloty zgodne z regułą, a próba zapisu na slot, który stał się zajęty, jest odrzucana.

Slot ma stałą długość 1 godziny. W v1 nie obowiązuje dzienny limit godzin pracy pojedynczego konia — koń jest dostępny we wszystkich wolnych slotach dnia, w którym został przydzielony (limit godzin konia → rozważany w v2, patrz Open Questions).

## Access Control

Wieloosobowy, uwierzytelnianie e-mail + hasło. Rejestracja z wyborem typu konta przy zakładaniu.

Dwie role:
- **Ośrodek (admin)** — administruje swoją stadniną: ustawia konie pracujące w danym dniu, zakres godzin pracy ośrodka (np. 10–16), przyjmuje/widzi zapisy.
- **Jeździec (użytkownik)** — przegląda listę ośrodków z filtrem, zapisuje się na jazdę o konkretnej godzinie na wybranym koniu.

Niezalogowany użytkownik trafiający na zasób wymagający dostępu jest kierowany do logowania/rejestracji. Admin zarządza wyłącznie własnym ośrodkiem (brak globalnego super-admina w MVP).

## Non-Goals

- **Statystyki zajęć, komentarze i analiza AI** — poza v1; zaplanowane na v2 (decyzja scope-down z fazy szacowania MVP: leżą poza pętlą rezerwacji, którą udowadnia MVP).
- **Opinie / recenzje** trenerów, ośrodków i koni — nie budujemy w v1.
- **Ulubione oraz dedykowana / AI-proponowana lista koni dla jeźdźca** — poza zakresem; nie wprowadzamy personalizacji doboru koni.
- **Formularz zapytania do stadniny** — brak kanału kontaktowego/zapytań w v1.
- **Dzienny limit godzin pracy konia** — reguła alokacji w v1 nie pilnuje limitu (patrz Open Questions; kandydat na v2).

## Open Questions

1. **Dzienny limit godzin pracy konia** — czy v2 wprowadza ograniczenie maks. N godzin/dzień na konia? Owner: user. Poza zakresem v1.
2. ~~**Konflikt grafiku z istniejącymi zapisami** — co dzieje się z zapisami, gdy ośrodek zmieni godziny/konie po fakcie?~~ **ROZSTRZYGNIĘTE 2026-08-11.** Zmiana grafiku kolidująca z aktywnym zapisem jest **odrzucana z czytelnym komunikatem** — istniejące zapisy nigdy nie są kasowane ani unieważniane przez edycję grafiku. Dotyczy obu połówek:
   - **Konie** — wypisanie konia z dnia, w którym ma aktywny zapis, nie przechodzi. Egzekwowane już dziś przez `on delete restrict` z F-01 (kod `23503`). **Doprecyzowane 2026-09-08:** dotyczy także zapisów odwołanych — przydział konia do dnia, do którego odnosi się jakikolwiek zapis (aktywny lub odwołany), nie może zostać usunięty; historia zapisów zostaje przy koniu. Odwołanie zapisu zwalnia slot dla innych jeźdźców, ale nie zwalnia konia z dnia.
   - **Godziny** — zawężenie zakresu godzin poniżej istniejącego zapisu nie przechodzi. Wymaga triggera na `schedule_days`; dziś **nie jest pilnowane** i przechodzi po cichu, osierocając zapis. Do domknięcia w S-02. **Doprecyzowane 2026-09-08:** zawężenie godzin i zmiana daty pomijają zapisy odwołane — blokują tylko aktywne.

   Konsekwencja dla ośrodka: żeby skrócić dzień lub zmienić jego datę, musi najpierw doprowadzić do odwołania kolidujących aktywnych zapisów; konia, który ma w tym dniu jakikolwiek zapis (także odwołany), nie da się z tego dnia wypisać — pozostaje przydzielony. Odwoływanie cudzych zapisów przez ośrodek nie jest częścią v1 (FR-009 daje to prawo wyłącznie jeźdźcowi) — jeśli okaże się potrzebne, to osobne wymaganie.
