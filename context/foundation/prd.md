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

**Jeździec (użytkownik).** Chce zapisać się na jazdę o konkretnej godzinie u wybranego instruktora, bez telefonowania; konia przydziela mu ośrodek. MVP obsługuje go w stopniu wystarczającym, by domknąć proces zapisu, ale projektujemy najpierw pod ośrodek.

## Success Criteria

### Primary

- Jeździec przechodzi pełną pętlę rezerwacji end-to-end: wybiera ośrodek i slot z wolnym miejscem (instruktor + godzina) z grafiku ustawionego przez ośrodek, i zapisuje się — bez przekroczenia limitu miejsc. Mierzalne: zapis kończy się sukcesem i pojawia się w grafiku ośrodka.

### Secondary

- Jeździec może samodzielnie odwołać swój zapis, zwalniając miejsce w slocie.
- Ośrodek może przydzielić konia do zapisu i odwołać dowolny zapis w swoim grafiku.

### Guardrails

- Liczba aktywnych zapisów w slocie nigdy nie przekracza jego limitu miejsc.
- Żadnego przydziału tego samego konia dwóm jeźdźcom w tej samej godzinie.
- Suma limitów miejsc w jednej godzinie nie przekracza liczby koni pracujących tego dnia.
- Brak zapisów poza zakresem godzin pracy ośrodka (np. poza 10–16) i do instruktorów niepracujących danego dnia.
- Konto ośrodka może modyfikować wyłącznie grafik i dane własnej stadniny.

## User Stories

### US-01: Jeździec zapisuje się na jazdę

- **Given** zalogowany jeździec, który wybrał ośrodek z listy
- **When** wybiera slot z wolnym miejscem (instruktor + godzina w zakresie pracy ośrodka)
- **Then** zapis zostaje utworzony i pojawia się w grafiku ośrodka, a w slocie ubywa jedno wolne miejsce

#### Acceptance Criteria

- Pokazywane są wyłącznie sloty w zakresie godzin pracy ośrodka, z limitem miejsc większym od zera; przy każdym widać instruktora i liczbę wolnych miejsc, bez tożsamości pozostałych zapisanych.
- Próba zapisu na slot bez wolnych miejsc jest odrzucona z czytelnym komunikatem.
- Próba drugiego aktywnego zapisu tego samego jeźdźca na tę samą godzinę w tym ośrodku jest odrzucona z czytelnym komunikatem.
- Jeździec widzi przy swoim zapisie przydzielonego konia, a przed przydziałem — informację, że koń zostanie przydzielony.
- Pusty grafik (brak slotów z miejscami na dany dzień) pokazuje stan pusty, nie listę 0 wyników.

### US-02: Ośrodek układa grafik na dzień

- **Given** zalogowane konto ośrodka
- **When** ustawia zakres godzin pracy na dany dzień, wskazuje konie i instruktorów pracujących tego dnia oraz ustawia limit miejsc każdego instruktora w każdej godzinie
- **Then** dla jeźdźców pojawiają się sloty (instruktor + godzina) z wolnymi miejscami w tym zakresie

#### Acceptance Criteria

- Zakres godzin, lista koni, lista instruktorów i limity miejsc dotyczą konkretnej daty.
- Limit miejsc równy zero oznacza, że instruktor w tej godzinie nie prowadzi jazdy.
- Grafik, w którym suma limitów miejsc w jednej godzinie przekracza liczbę koni pracujących tego dnia, jest odrzucany z czytelnym komunikatem.
- Zmiana grafiku kolidująca z aktywnymi zapisami jest odrzucana; system nie odwołuje zapisów sam (patrz Open Questions #2 i #4).

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
  > Zmienione 2026-11-11 (ADR 0002): konie pracujące danego dnia nie tworzą już slotów dla jeźdźca — wyznaczają górną granicę sumy limitów miejsc w godzinie i pulę do przydziału (FR-014).
- FR-005: Ośrodek może zobaczyć prostą listę zapisów (godzina–instruktor–jeździec–koń) na dany dzień. Priority: must-have
  > Socrates: Kontrargument: "potrzebny widok kalendarza/siatki". Rozstrzygnięcie: zawężone — w v1 wystarczy prosta lista na wybrany dzień, bez siatki godzina×koń.
  > Zmienione 2026-11-11 (ADR 0002): lista pokazuje także instruktora; koń może być jeszcze nieprzydzielony.
- FR-012: Ośrodek może dodać instruktora i go zdezaktywować; zdezaktywowany instruktor znika z układania grafiku, ale zostaje przy dawnych zapisach. Priority: must-have
  > Dodane 2026-11-11 (ADR 0002). Niezrealizowane. Instruktor nie ma własnego konta.
- FR-013: Ośrodek może wskazać, którzy instruktorzy pracują w danym dniu, i ustawić limit miejsc każdego z nich w każdej godzinie. Priority: must-have
  > Dodane 2026-11-11 (ADR 0002). Niezrealizowane. Suma limitów w jednej godzinie nie może przekroczyć liczby koni pracujących tego dnia.
- FR-014: Ośrodek może przydzielić konia do zapisu i zmienić ten przydział w dowolnym momencie, także po terminie jazdy. Priority: must-have
  > Dodane 2026-11-11 (ADR 0002). Niezrealizowane. Koń ma najwyżej jednego jeźdźca w danej godzinie; zapis może pozostać bez konia.
- FR-015: Ośrodek może odwołać dowolny aktywny zapis w swoim grafiku przed jego terminem; jeździec widzi, że zapis odwołał ośrodek. Priority: must-have
  > Dodane 2026-11-11 (ADR 0002). Niezrealizowane. Bez powiadomień — informacja jest widoczna na liście zapisów jeźdźca.
- FR-010: Ośrodek może zdefiniować na dany dzień dowolne zakresy slotów (własny początek i koniec każdego slotu) zamiast stałej siatki godzinowej. Priority: post-MVP (v2)
  > Dodane 2026-11-10, po domknięciu v1. Niezrealizowane. Zastępuje założenie „slot ma stałą długość 1 godziny" z §Business Logic — szczegóły do rozstrzygnięcia w Open Questions #3.
- FR-011: Ośrodek może zobaczyć statystyki własnej stadniny za dowolny okres: jazdy i godziny jazd na jeźdźca, jazdy jeźdźca na danym koniu, obciążenie koni, obłożenie grafiku i odwołania — w tabelach i na wykresach. Priority: post-MVP (v2)
  > Dodane 2026-11-10 po wywiadzie. Niezrealizowane. Słownictwo: `GLOSSARY.md`; reguła anonimizacji przy usunięciu konta: `docs/adr/0001-anonimizacja-zapisow-przy-usunieciu-konta.md`; spec w issue trackerze.

### Rezerwacja (Jeździec)

- FR-006: Jeździec może przeglądać i filtrować listę ośrodków. Priority: must-have
  > Socrates: Kontrargument: "filtr to przerost przy kilku ośrodkach". Rozstrzygnięcie: zostaje — filtr był wprost w pierwotnym MVP, oczekiwana funkcja.
- FR-007: Jeździec może zobaczyć sloty z wolnymi miejscami (godzina + instruktor + liczba wolnych miejsc) w wybranym ośrodku. Priority: must-have
  > Socrates: Kontrargument: "tylko godzina, konia dobiera ośrodek". Rozstrzygnięcie pierwotne: zostaje wybór konia.
  > Zmienione 2026-11-11 (ADR 0002): kontrargument wygrał — jeździec wybiera instruktora i godzinę, konia dobiera ośrodek. Niezrealizowane w nowym brzmieniu.
- FR-008: Jeździec może zapisać się na wolne miejsce w slocie wybranego instruktora o konkretnej godzinie; w jednym ośrodku ma najwyżej jeden aktywny zapis na daną godzinę. Priority: must-have
  > Socrates: Kontrargument: brak — to rdzeń produktu i całe kryterium sukcesu.
  > Zmienione 2026-11-11 (ADR 0002): zapis nie wskazuje konia. Niezrealizowane w nowym brzmieniu.
- FR-009: Jeździec może odwołać swój zapis przed jego terminem. Priority: nice-to-have
  > Socrates: Kontrargument: "odwołania ręcznie przez ośrodek". Rozstrzygnięcie: zostaje jako nice-to-have — to Secondary success, robimy jeśli starczy czasu, nie blokuje v1.
  > Zmienione 2026-11-11 (ADR 0002): prawo odwołania ma także ośrodek (FR-015); system zapisuje, kto odwołał.

## Non-Functional Requirements

- Przy jednoczesnych próbach zapisu na ten sam slot sukcesem kończy się najwyżej tyle zapisów, ile jest wolnych miejsc; pozostałe otrzymują czytelną odmowę (limit miejsc nie jest przekraczany niezależnie od współbieżności).
- Interfejs jest wygodny w obsłudze na ekranie telefonu (jeździec zapisuje się mobilnie).
- Interfejs użytkownika jest w języku polskim.

## Business Logic

Do zapisu dostępny jest tylko taki slot (instruktor, godzina), który mieści się w zakresie godzin pracy ośrodka tego dnia, dotyczy instruktora pracującego tego dnia i ma mniej aktywnych zapisów niż wynosi jego limit miejsc.

Wejścia reguły (jako dane podawane przez użytkowników): zakres godzin pracy ośrodka na dany dzień, lista koni i instruktorów pracujących tego dnia oraz limit miejsc każdego instruktora w każdej godzinie (ustawiane przez ośrodek), a także wybór instruktora i godziny (dokonywany przez jeźdźca). Wyjściem jest zbiór slotów z wolnymi miejscami prezentowany jeźdźcowi oraz przyjęcie albo odrzucenie próby zapisu. Jeździec napotyka regułę w momencie przeglądania ośrodka: widzi wyłącznie sloty zgodne z regułą, a próba zapisu na slot, w którym miejsca się skończyły, jest odrzucana. Jeździec ma w jednym ośrodku najwyżej jeden aktywny zapis na daną godzinę.

Suma limitów miejsc wszystkich instruktorów w jednej godzinie nie przekracza liczby koni pracujących tego dnia — reguła jest sprawdzana przy układaniu grafiku, więc każde wystawione miejsce ma pokrycie w koniu. Konia do zapisu przydziela ośrodek, w dowolnym momencie, także po terminie; koń ma najwyżej jednego jeźdźca w danej godzinie. Zapis bez konia, którego termin minął, jest jazdą, ale nie wchodzi do obciążenia żadnego konia.

Zapis może odwołać przed terminem jeździec albo ośrodek. Zmiana grafiku kolidująca z aktywnymi zapisami (zmniejszenie limitu poniżej liczby zapisów, wypisanie instruktora z dnia, skrócenie dnia) jest odrzucana, dopóki ośrodek sam nie odwoła kolidujących zapisów — system nie wybiera, kogo odwołać. Wypisanie konia z dnia jest odrzucane, gdy złamałoby regułę sumy limitów albo gdy koń jest w tym dniu przydzielony do zapisu.

Slot ma stałą długość 1 godziny. Nie obowiązuje dzienny limit godzin pracy pojedynczego konia (rozważany w v2, patrz Open Questions).

## Access Control

Wieloosobowy, uwierzytelnianie e-mail + hasło. Rejestracja z wyborem typu konta przy zakładaniu.

Dwie role:

- **Ośrodek (admin)** — administruje swoją stadniną: ustawia zakres godzin pracy ośrodka (np. 10–16), konie i instruktorów pracujących w danym dniu oraz limity miejsc; widzi zapisy, przydziela do nich konie i może je odwołać.
- **Jeździec (użytkownik)** — przegląda listę ośrodków z filtrem, zapisuje się na wolne miejsce u wybranego instruktora o konkretnej godzinie, może odwołać własny zapis.

Instruktor nie jest rolą ani kontem — to osoba dodawana i zarządzana przez ośrodek.

Niezalogowany użytkownik trafiający na zasób wymagający dostępu jest kierowany do logowania/rejestracji. Admin zarządza wyłącznie własnym ośrodkiem (brak globalnego super-admina w MVP).

## Non-Goals

- **Komentarze i analiza AI** — poza v1; zaplanowane na v2 (decyzja scope-down z fazy szacowania MVP: leżą poza pętlą rezerwacji, którą udowadnia MVP). Statystyki, pierwotnie w tym samym punkcie, weszły do zakresu 2026-11-10 jako FR-011.
- **Opinie / recenzje** trenerów, ośrodków i koni — nie budujemy w v1.
- **Ulubione oraz dedykowana / AI-proponowana lista koni dla jeźdźca** — poza zakresem; nie wprowadzamy personalizacji doboru koni.
- **Formularz zapytania do stadniny** — brak kanału kontaktowego/zapytań w v1.
- **Dzienny limit godzin pracy konia** — reguła alokacji w v1 nie pilnuje limitu (patrz Open Questions; kandydat na v2).
- **Wybór konia przez jeźdźca** — usunięty 2026-11-11 (ADR 0002); nie pozostaje jako tryb opcjonalny.
- **Konto instruktora** — instruktor nie loguje się i nie układa własnego grafiku.
- **Zapisanie jeźdźca przez ośrodek i przenoszenie zapisów między slotami** — poza zakresem; przeniesienie to odwołanie i ponowny zapis jeźdźca.
- **Statystyki na instruktora** — poza zakresem tej zmiany; osobne wymaganie.
- **Powiadomienia o odwołaniu zapisu przez ośrodek** — jeździec widzi odwołanie wyłącznie na liście swoich zapisów.

## Open Questions

1. **Dzienny limit godzin pracy konia** — czy v2 wprowadza ograniczenie maks. N godzin/dzień na konia? Owner: user. Poza zakresem v1.
2. ~~**Konflikt grafiku z istniejącymi zapisami** — co dzieje się z zapisami, gdy ośrodek zmieni godziny/konie po fakcie?~~ **ROZSTRZYGNIĘTE 2026-08-11.** Zmiana grafiku kolidująca z aktywnym zapisem jest **odrzucana z czytelnym komunikatem** — istniejące zapisy nigdy nie są kasowane ani unieważniane przez edycję grafiku. Dotyczy obu połówek:
   - **Konie** — wypisanie konia z dnia, w którym ma aktywny zapis, nie przechodzi. Egzekwowane już dziś przez `on delete restrict` z F-01 (kod `23503`). **Doprecyzowane 2026-09-08:** dotyczy także zapisów odwołanych — przydział konia do dnia, do którego odnosi się jakikolwiek zapis (aktywny lub odwołany), nie może zostać usunięty; historia zapisów zostaje przy koniu. Odwołanie zapisu zwalnia slot dla innych jeźdźców, ale nie zwalnia konia z dnia.
   - **Godziny** — zawężenie zakresu godzin poniżej istniejącego zapisu nie przechodzi. Wymaga triggera na `schedule_days`; dziś **nie jest pilnowane** i przechodzi po cichu, osierocając zapis. Do domknięcia w S-02. **Doprecyzowane 2026-09-08:** zawężenie godzin i zmiana daty pomijają zapisy odwołane — blokują tylko aktywne.

   Konsekwencja dla ośrodka: żeby skrócić dzień lub zmienić jego datę, musi najpierw doprowadzić do odwołania kolidujących aktywnych zapisów; konia, który ma w tym dniu jakikolwiek zapis (także odwołany), nie da się z tego dnia wypisać — pozostaje przydzielony. Odwoływanie cudzych zapisów przez ośrodek nie jest częścią v1 (FR-009 daje to prawo wyłącznie jeźdźcowi) — jeśli okaże się potrzebne, to osobne wymaganie.

   **Zastąpione 2026-11-11 przez pytanie #4** w części dotyczącej koni i odwoływania zapisów przez ośrodek; zasada „kolidująca zmiana grafiku jest odrzucana" pozostaje.

3. **Dowolne zakresy slotów (FR-010)** — do rozstrzygnięcia przed planowaniem. Owner: user. Poza zakresem v1.
   - Kto ustawia zakresy: przyjęto, że Ośrodek (per dzień, obok godzin pracy i koni) — do potwierdzenia.
   - Granulacja: dowolne minuty, czy krok (np. co 15 min)? Czy sloty mogą mieć różne długości w jednym dniu i przerwy między sobą?
   - Czy zakresy są wspólne dla wszystkich koni danego dnia, czy osobne per koń?
   - Co z istniejącymi zapisami przy zmianie zakresów — analogicznie do pytania #2 (odrzucenie kolidującej zmiany)?
   - Reguła braku podwójnej rezerwacji musi objąć nakładające się zakresy, a nie tylko identyczną godzinę.

4. **Odwrócenie modelu zapisu** — **ROZSTRZYGNIĘTE 2026-11-11** (`docs/adr/0002-limit-miejsc-instruktora-zamiast-wyboru-konia.md`; spec w issue trackerze). Niezrealizowane.
   - **Odwołanie przez ośrodek** — ośrodek może odwołać dowolny aktywny zapis przed terminem (FR-015). Zdanie z pytania #2, że odwoływanie cudzych zapisów nie jest częścią v1, przestaje obowiązywać.
   - **Limity i instruktorzy** — zmniejszenie limitu miejsc poniżej liczby aktywnych zapisów i wypisanie instruktora z dnia, w którym ma aktywne zapisy, są odrzucane; ośrodek najpierw sam odwołuje wybrane zapisy.
   - **Konie** — wypisanie konia z dnia jest odrzucane, gdy liczba koni spadłaby poniżej sumy limitów miejsc w którejś godzinie albo gdy koń jest w tym dniu przydzielony do zapisu. Zastępuje regułę z pytania #2 opartą na kluczu obcym zapisu do konia w dniu.
   - **Istniejące dane** — zapisy i grafiki dni sprzed zmiany są kasowane przy migracji (nie mają instruktora; w bazie są wyłącznie dane testowe). Konta, ośrodki i konie zostają.
   - **Statystyki** — obłożenie grafiku liczy się od sumy limitów miejsc; odwołania na jeźdźca obejmują tylko odwołania własne jeźdźca (definicje: `GLOSSARY.md`).
