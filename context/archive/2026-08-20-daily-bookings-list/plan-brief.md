# S-05 — Lista zapisów dnia — Plan Brief

> Pełny plan: `context/changes/daily-bookings-list/plan.md`

## What & Why

Ośrodek dostaje nową, czysto odczytową stronę `/osrodek/zapisy`: płaską listę aktywnych zapisów (godzina · koń · jeździec) na wybrany dzień. Domyka FR-005 — zapisy z S-04 trafiają do bazy, ale ośrodek nie ma dziś żadnego ekranu, który by je pokazywał.

## Starting Point

Cała infrastruktura istnieje: RLS z F-01 wpuszcza ośrodek do zapisów jego dni i profili jego jeźdźców (dowiedzione skryptem), moduł `src/lib/bookings/` z konwencjami testów jest z S-04, a szkielet strony dnia (wybór `?dzien=`, nawigacja, stany puste) z `grafik.astro`. Zero migracji, zero zmian RLS, zero endpointów POST.

## Desired End State

Ośrodek wchodzi w „Zapisy" z pulpitu, widzi domyślnie dzisiejszy dzień i wiersze „10:00 · Bella · Anna Kowalska" posortowane po godzinie i koniu; może przełączyć dzień, także wstecz (historia). Dzień bez grafiku i grafik bez zapisów mają osobne komunikaty.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Miejsce | Osobna strona `/osrodek/zapisy` | Grafik to edycja, zapisy to odczyt; strona będzie naturalnym miejscem przyszłych akcji |
| Domyślny dzień | Dziś (nie jutro jak grafik) | Operacyjne pytanie ośrodka to „kto dziś jeździ" — odczyt różni się od układania |
| Statusy | Tylko aktywne | FR-005 to prosta lista; odwołania nie istnieją do S-06 |
| Dni przeszłe | Dozwolone bez ograniczeń | Strona czysto odczytowa — ograniczenie grafiku chroniło edycję historii, tu edycji nie ma |
| Forma | Płaska lista sortowana godzina→koń | Dosłownie FR-005; roadmapa wprost ostrzega przed siatką godzina×koń |
| Nazwisko jeźdźca | Embedded `profiles(full_name)` | Bezpośredni FK `rider_id→profiles`; RLS z F-01 zaprojektowane pod ten odczyt |
| Nazwy koni | Składanie z `listStableHorses` | `bookings` nie ma FK wprost do `horses` — wzorzec z S-04 |

## Scope

**W zakresie:** `getDayBookings` (zapytanie z embedded profilem), `composeBookingRows` (czysta logika: sortowanie, fallbacki) z testami, strona `/osrodek/zapisy`, odnośnik z pulpitu `/osrodek`.

**Poza zakresem:** siatka godzina×koń, odwołane zapisy na liście, jakiekolwiek akcje na liście (odwoływanie przez ośrodek — FR-009 daje to tylko jeźdźcowi), migracje/RLS/RPC, widoki zbiorcze i eksport, zmiany w grafiku i stronie jeźdźca.

## Architecture / Approach

Jedno zapytanie + jedna czysta funkcja + jedna strona. `getScheduleDay` (S-02) znajduje dzień, `getDayBookings` pobiera aktywne zapisy z nazwiskiem jeźdźca, `composeBookingRows` skleja z nazwami koni, sortuje i wstawia fallbacki („(bez nazwiska)", bo `full_name` jest nullable) — pod Vitest. Strona powtarza szkielet `grafik.astro` w wariancie tylko-do-odczytu.

## Phases at a Glance

| Faza | Co dowozi | Główne ryzyko |
| --- | --- | --- |
| 1. Zapytanie i czysta logika | `getDayBookings` + `composeBookingRows` + testy | Embedded `profiles` bywa `null` — fallback musi być w logice, nie w widoku |
| 2. Strona i nawigacja | `/osrodek/zapisy` + odnośnik z pulpitu | Pokusa dokładania funkcji ponad „prostą listę" z FR-005 |

**Prerequisites:** S-02 i S-04 zaimplementowane (są, zarchiwizowane), lokalny stack z seedem, Node 22.14.0.
**Estimated effort:** ~1 sesja — najmniejszy slice roadmapy, czysto odczytowy.

## Open Risks & Assumptions

- **Założenie: jeździec z aktywnym zapisem zawsze spełnia `is_rider_of_my_stable`** — więc nazwisko przy własnych zapisach zawsze się rozwiąże; fallback „(bez nazwiska)" pokrywa `full_name = null`, nie brak dostępu.
- **Lista i grafik mają różne domyślne dni** (dziś vs jutro) — świadoma decyzja; przejście między ekranami nie przenosi wybranej daty.

## Success Criteria (Summary)

- Ośrodek widzi zapisy swojego dnia w formacie godzina · koń · jeździec, z poprawnym sortowaniem.
- Izolacja: ośrodek A nie widzi zapisów ośrodka B (potwierdzone ręcznie na dwóch kontach seeda).
- Dwa rozróżnione stany puste; historia dostępna bez błędów.
