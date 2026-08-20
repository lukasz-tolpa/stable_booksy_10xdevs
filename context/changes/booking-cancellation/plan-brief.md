# S-06 — Odwołanie zapisu — Plan Brief

> Pełny plan: `context/changes/booking-cancellation/plan.md`

## What & Why

Jeździec dostaje stronę „Moje zapisy" (`/jezdziec/zapisy`) z nadchodzącymi jazdami i przyciskiem „Odwołaj"; odwołanie zwalnia slot konia do ponownej rezerwacji. Domyka FR-009 (jedyne nice-to-have) i Secondary Success Criterion — to ostatni slice MVP.

## Starting Point

Fundament w całości od F-01: `status`+`cancelled_at` z check constraintem „oba naraz", częściowy indeks zwalniający slot automatycznie, polityka UPDATE tylko na własnych wierszach. Guardraile już dowiedzione w `rls_isolation.sql` (nie odwołasz cudzego; odwołany znika z zajętości). Widok „moje zapisy" był świadomie odkładany z S-04/S-05 właśnie do tego slice'a. Zero migracji.

## Desired End State

Jeździec widzi nadchodzące jazdy chronologicznie (data · godzina · ośrodek · koń), odwołuje jedną kliknięciem, dostaje potwierdzenie, a zapis przenosi się do sekcji „Minione i odwołane". Slot natychmiast wraca do puli wolnych na stronie ośrodka i znika z listy zapisów ośrodka (S-05). Rozpoczętej jazdy odwołać się nie da.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Miejsce akcji | Osobna strona `/jezdziec/zapisy` | Realizuje decyzję odziedziczoną z S-04/S-05; jeden przegląd bez szukania po ośrodkach; badge „Twój zapis" na stronie ośrodka zostaje pasywny |
| Granica czasu | Tylko sloty, które się nie zaczęły | Symetria z progiem zapisu S-04 (`hour <= currentWarsawHour`); historia nie zmienia się po fakcie; pilnuje aplikacja, bo RLS pozwala wstecz |
| Przepływ | Jeden klik, bez potwierdzenia | Spójne z S-04; operacja w pełni odwracalna — slot wraca do puli |
| Zakres listy | Nadchodzące aktywne + osobno historia | Akcje na górze; ślad odwołań widoczny (wiersz nigdy nie znika) |
| Mutacja | Jeden UPDATE `status`+`cancelled_at`, `false` przy 0 wierszy | Check constraint wymusza oba pola naraz; pusty wynik odróżnia wyścig/cudzy zapis od sukcesu |
| Weryfikacja | Vitest na czystej logice, bez nowych SQL | Asercje odwołania już istnieją w `rls_isolation.sql` — nowe byłyby duplikatem |

## Scope

**W zakresie:** `getRiderBookings` (embedded `schedule_days(day, stables(name))`, jawny filtr `rider_id`), `getHorseNames`, `splitRiderBookings` (próg Warsaw, sortowanie) z testami, `cancelBooking`, `cancelSchema`, strona `/jezdziec/zapisy` (dwie sekcje, stany puste, banery), `POST /api/bookings/cancel`, odnośnik z katalogu.

**Poza zakresem:** odwoływanie przez ośrodek (FR-009 daje prawo tylko jeźdźcowi), polityka anulacji z wyprzedzeniem (brak w PRD), przycisk odwołania na stronie ośrodka, powiadomienia, migracje/RLS/nowe SQL, edycja terminu, odwołane na liście ośrodka.

## Architecture / Approach

Rozszerzenie modułu `src/lib/bookings/`: odczyt (embedded FK przez `schedule_days`→`stables`, konie składane osobno — wzorzec S-04/S-05), czysta funkcja podziału nadchodzące/historia pod Vitest, mutacja jednym UPDATE. Endpoint kanonem PRG: czyta zapis PRZED mutacją (guard progu wymaga `day`/`hour`, którym formularz nie może być źródłem), rozróżnia „nie znaleziono" od „jazda już się zaczęła".

## Phases at a Glance

| Faza | Co dowozi | Główne ryzyko |
| --- | --- | --- |
| 1. Czysta logika i zapytania | `getRiderBookings`/`getHorseNames`/`splitRiderBookings`/`cancelBooking`/`cancelSchema` + testy | Granica progu (`hour === currentHour` → historia) — klasa błędów o jeden, ta sama co w S-04 |
| 2. Strona i endpoint | `/jezdziec/zapisy`, `POST /api/bookings/cancel`, odnośnik | Kolejność w endpoincie: odczyt przed mutacją, dwa rozróżnialne komunikaty odmowy |

**Prerequisites:** S-04 zaimplementowane (jest, zarchiwizowane), lokalny stack z seedem, Node 22.14.0.
**Estimated effort:** ~1 sesja — mutacja jednego pola na gotowym schemacie.

## Open Risks & Assumptions

- **Wyścig odwołania** (dwa taby): drugi UPDATE trafia w `status='active'` filtr → 0 wierszy → czytelny komunikat, nie błąd. Świadomie bez blokad.
- **`cancelled_at` z zegara aplikacji** (`new Date().toISOString()`), nie bazy — akceptowalne; pole jest informacyjne, nie bierze udziału w regułach.

## Success Criteria (Summary)

- Anna odwołuje zapis z „Moich zapisów": potwierdzenie, wpis w historii, slot znów wolny u ośrodka i możliwy ponowny zapis.
- Lista zapisów ośrodka (S-05) przestaje pokazywać odwołany zapis.
- Rozpoczętej jazdy nie da się odwołać ani z UI, ani ręcznym POST-em.
