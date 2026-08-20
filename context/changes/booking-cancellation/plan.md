# S-06 — Odwołanie zapisu (booking-cancellation) Implementation Plan

## Overview

Jeździec dostaje stronę `/jezdziec/zapisy` („Moje zapisy"): listę aktywnych nadchodzących zapisów z przyciskiem „Odwołaj" przy każdym oraz sekcję historii (minione i odwołane, bez akcji). Odwołanie — jeden klik, PRG — zwalnia slot konia do ponownej rezerwacji. Domyka FR-009 i Secondary Success Criterion PRD; ostatni slice MVP.

## Current State Analysis

- **Fundament w całości od F-01, zero migracji.** Odwołanie to jeden UPDATE: check constraint `(status='cancelled') = (cancelled_at is not null)` wymusza oba pola w tej samej operacji (`supabase/migrations/20260810090100_schedule_and_bookings.sql:105`); częściowy indeks `where status='active'` zwalnia slot automatycznie. Polityka UPDATE na `bookings` pozwala jeźdźcowi wyłącznie na własnych wierszach (`:287`).
- **Guardraile już dowiedzione**: `rls_isolation.sql` asertuje, że jeździec nie odwoła cudzego zapisu (0 wierszy) i że odwołany zapis znika z `get_taken_slots` (asercja dodana przy S-04) — nowych skryptów SQL nie potrzeba.
- **Trigger godzin pracy nie odpali** — działa `ON UPDATE OF hour, schedule_day_id`, zmiana statusu go nie dotyka. Brak polityki DELETE jest celowy (historia zostaje).
- **Dane dla listy**: `bookings.schedule_day_id → schedule_days` i `schedule_days.stable_id → stables` to bezpośrednie FK — embedded select `schedule_days(day, stables(name))` dociąga dzień i nazwę ośrodka; nazwy koni bez FK wprost — składane z zapytania o `horses` po id (otwarte RLS), wzorzec S-04/S-05.
- **Próg czasowy istnieje**: `currentWarsawHour` + `todayIso`/`isPastDate` (S-04) definiują „slot się zaczął"; endpoint zapisu używa dokładnie `day === todayIso() && hour <= currentWarsawHour()`.
- **Wzorce kompletne**: kanon endpointu PRG (`src/pages/api/bookings/create.ts`), moduł `src/lib/bookings/` (queries/rows/errors/schema + testy), katalog `/jezdziec` jako miejsce odnośnika, stany puste, `formValue`, `firstErrorMessage`.
- **Lekcje z review S-04/S-05 obowiązują**: jawne filtry zamiast polegania na szerokim RLS (`rider_id` w zapytaniach), gałąź `loadFailed` przy braku klienta/profilu, komentarz nazywający warunki wstępne funkcji.

## Desired End State

Jeździec wchodzi w „Moje zapisy" z katalogu, widzi nadchodzące jazdy (data, godzina, ośrodek, koń) posortowane chronologicznie, odwołuje jedną kliknięciem i dostaje zielone potwierdzenie; zapis przenosi się do sekcji historii jako „odwołany", a slot natychmiast wraca do puli wolnych na stronie ośrodka. Slotu, który już się zaczął, odwołać się nie da.

Weryfikacja: `npm test`, `npm run lint`, `npm run build` zielone; ręcznie na seedzie pełny cykl odwołania + ponowny zapis na zwolniony slot.

### Key Discoveries:

- Embedded łańcuch `bookings → schedule_days → stables` działa przez bezpośrednie FK; RLS (`using (true)` na obu tabelach) wpuszcza jeźdźca.
- `cancelled_at` musi iść w tym samym UPDATE co `status` — dwa osobne UPDATE-y wywróciłyby się na check constraincie.
- UPDATE po `id` z RLS zwraca 0 zmodyfikowanych wierszy dla cudzego/nieistniejącego zapisu — endpoint rozpoznaje to po pustym wyniku `select().maybeSingle()` po update, nie po kodzie błędu.
- Guard progu czasowego musi żyć w aplikacji — RLS pozwala na UPDATE także wstecz.

## What We're NOT Doing

- **Odwoływanie zapisów przez ośrodek** — FR-009 daje to prawo wyłącznie jeźdźcowi (potwierdzone w PRD przy Otwartym pytaniu #2).
- **Polityka anulacji z wyprzedzeniem** (np. 24h) — nie ma jej w PRD.
- **Przycisk odwołania na stronie ośrodka** (`[id].astro`) — badge „Twój zapis" zostaje pasywny; akcja mieszka wyłącznie w „Moich zapisach".
- **Powiadomienia ośrodka o odwołaniu** — ośrodek zobaczy zmianę w liście S-05.
- **Migracje, zmiany RLS, nowe asercje SQL** (istniejące pokrywają guardraile), edycja/zmiana terminu zapisu, kasowanie wierszy.
- **Odwołane na liście ośrodka (S-05)** — lista zapisów dnia nadal pokazuje tylko aktywne.

## Implementation Approach

Rozszerzenie modułu `src/lib/bookings/` o odczyt i mutację po stronie jeźdźca: `getRiderBookings` zwraca własne zapisy (wszystkie statusy) z dniem i ośrodkiem przez embedded FK; czysta funkcja `splitRiderBookings` dzieli je na „nadchodzące aktywne" i „historię" (minione lub odwołane) względem progu `Europe/Warsaw` i sortuje; `cancelBooking` wykonuje jeden UPDATE `status`+`cancelled_at` z jawnym filtrem `rider_id` (lekcja S-04). Strona renderuje dwie sekcje; endpoint `POST /api/bookings/cancel` powtarza kanon: zod → pobranie własnego zapisu → guard progu przed mutacją → UPDATE → PRG na `/jezdziec/zapisy`.

## Critical Implementation Details

- **State sequencing**: Endpoint najpierw CZYTA zapis (własność + `day`/`hour` do progu), potem mutuje — guard progu wymaga danych slotu, których formularz nie niesie (i nie może nieść, bo formularzowi nie ufamy). Odwrotna kolejność (update z warunkami w `where`) nie odróżniłaby „nie twój zapis" od „slot już się zaczął" — dwa różne komunikaty.
- **Timing & lifecycle**: Próg „slot się zaczął" to dokładnie warunek z `api/bookings/create.ts:73` (`day === todayIso() && hour <= currentWarsawHour()` — plus `isPastDate(day)` dla dni minionych); obie strony reguły (zapis i odwołanie) muszą używać tej samej semantyki `<=`.

## Phase 1: Czysta logika i zapytania

### Overview

Rozszerzenie `src/lib/bookings/` o odczyt zapisów jeźdźca, podział na sekcje, mutację odwołania i schemę formularza; komplet testów.

### Changes Required:

#### 1. Zapytanie o zapisy jeźdźca

**File**: `src/lib/bookings/queries.ts`

**Intent**: Dać stronie „Moje zapisy" wszystkie zapisy jeźdźca (każdy status) z dniem i nazwą ośrodka jednym zapytaniem.

**Contract**: `getRiderBookings(client, riderId: string): Promise<RiderBooking[]>`, gdzie `RiderBooking = { id: number; horseId: number; hour: number; day: string; stableName: string; status: string }` — select `id, horse_id, hour, status, schedule_days(day, stables(name))` z jawnym `.eq("rider_id", riderId)` (lekcja S-04 — nie polegać na RLS). Mapowanie snake→camel na granicy; embedded teoretycznie nienullowe (FK not-null), ale zachować ochronę jak w `getDayBookings`. Nazwy koni NIE tutaj — dokłada je warstwa czysta z osobnego zapytania `getHorseNames(client, horseIds: number[]): Promise<Map<number, string>>` (jedno `in()` po `horses`, otwarte RLS).

#### 2. Podział i sortowanie

**File**: `src/lib/bookings/rider-list.ts` (+ `rider-list.test.ts`)

**Intent**: Jedyna logika slice'a — podział na „nadchodzące aktywne" (z akcją) i „historię" (minione lub odwołane) plus sortowanie i fallback nazwy konia.

**Contract**: `splitRiderBookings(bookings: RiderBooking[], horseNames: Map<number, string>, { today, currentHour }): { upcoming: RiderBookingRow[]; history: RiderBookingRow[] }`, gdzie `RiderBookingRow = { id, day, hour, horseName, stableName, status }`. Nadchodzący = `status === "active"` i slot się nie zaczął (dzień > dziś, albo dzień = dziś i `hour > currentHour`); reszta → historia. Sortowanie: nadchodzące rosnąco (data→godzina), historia malejąco (najnowsze na górze). `today`/`currentHour` wstrzykiwane parametrami (konwencja testów bez fake timers). Fallbacki nazwy konia jak w `rows.ts`. Testy: obie strony progu (w tym granica `hour === currentHour` → historia), odwołany przyszły → historia, sortowanie obu sekcji, pusta lista.

#### 3. Mutacja odwołania

**File**: `src/lib/bookings/queries.ts`

**Intent**: Jeden UPDATE przestawiający zapis na odwołany; oba pola naraz przez check constraint.

**Contract**: `cancelBooking(client, bookingId: number, riderId: string): Promise<boolean>` — `update({ status: "cancelled", cancelled_at: new Date().toISOString() })` z filtrami `id`, `rider_id`, `status = "active"`; `.select("id").maybeSingle()` — zwraca `false`, gdy nic nie zmieniono (cudzy/nieistniejący/już odwołany), `true` przy sukcesie. Błąd zapytania rzucany dalej.

#### 4. Schema formularza odwołania

**File**: `src/lib/bookings/schema.ts` (+ przypadki w `schema.test.ts`)

**Intent**: Walidacja jedynego pola POST.

**Contract**: `cancelSchema` — `{ bookingId: z.coerce.number().int().positive({ error: "Nieprawidłowy zapis" }) }`; eksport typu jak `BookingInput`.

### Success Criteria:

#### Automated Verification:

- `npm test` — nowe testy `rider-list` + rozszerzone `schema` przechodzą, opisy po polsku
- `npm run lint` zielony

---

## Phase 2: Strona i endpoint

### Overview

Strona `/jezdziec/zapisy` z dwiema sekcjami, endpoint odwołania kanonem PRG, odnośnik z katalogu.

### Changes Required:

#### 1. Strona „Moje zapisy"

**File**: `src/pages/jezdziec/zapisy.astro`

**Intent**: Widok FR-009 — nadchodzące jazdy z akcją odwołania, historia bez akcji; mobilnie czytelny, bez JavaScriptu.

**Contract**: Trasa pod `/jezdziec` (middleware pilnuje roli); destrukturyzacja `Astro.locals` + guard z gałęzią `else → loadFailed` (wzorzec po review S-05). Dane: `getRiderBookings(supabase, user.id)` → `getHorseNames` → `splitRiderBookings` z `{ today: todayIso(), currentHour: currentWarsawHour() }`. Sekcja „Nadchodzące": wiersze „data · godzina · ośrodek · koń" + formularz POST `/api/bookings/cancel` z ukrytym `bookingId` i przyciskiem „Odwołaj"; stan pusty „Nie masz nadchodzących zapisów" z odnośnikiem do katalogu. Sekcja „Minione i odwołane": te same wiersze bez akcji, odwołane oznaczone; sekcja renderowana tylko gdy niepusta. Baner `?sukces=1` (zielony) i `?error=` — wzorzec z `[id].astro`. Data wiersza formatowana krótko (np. `toLocaleDateString("pl-PL")` bez dnia tygodnia — lista wielodniowa, pełny format z `dayLabel` byłby za długi).

#### 2. Endpoint odwołania

**File**: `src/pages/api/bookings/cancel.ts`

**Intent**: Przyjąć POST, zweryfikować własność i próg czasu, wykonać UPDATE; odmowy jako redirect z polskim komunikatem.

**Contract**: Kanon `api/bookings/create.ts`: helper `backToMyBookings(context, outcome)` → redirect na `/jezdziec/zapisy` z `?error=` albo `?sukces=1`; `cancelSchema.safeParse` → `firstErrorMessage`; `createClient` null-guard; `auth.getUser()` → brak → `SIGN_IN_ROUTE`; odczyt zapisu przez `getRiderBookings`-owy filtr (własny, aktywny, po `bookingId`) — brak → „Nie znaleziono zapisu do odwołania."; guard progu: `isPastDate(day)` lub (`day === todayIso()` i `hour <= currentWarsawHour()`) → „Nie można odwołać jazdy, która już się zaczęła."; `cancelBooking` → `false` (wyścig: ktoś już odwołał / RLS) → komunikat „Nie znaleziono…"; sukces → `?sukces=1`. Wszystkie guardy przed mutacją.

#### 3. Odnośnik z katalogu

**File**: `src/pages/jezdziec/index.astro`

**Intent**: Jeździec musi mieć drogę do „Moich zapisów" — odnośnik nad katalogiem, w konwencji istniejących odnośników.

**Contract**: Odnośnik „Moje zapisy" → `/jezdziec/zapisy` w nagłówku katalogu; bez zmian pozostałej treści.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run lint`, `npm run build` — zielone

#### Manual Verification:

- Anna (`anna.kowalska@example.com` / `sekret123`): katalog → „Moje zapisy" → widzi nadchodzące zapisy chronologicznie → odwołuje jeden → zielony baner, zapis w sekcji historii jako odwołany
- Zwolnienie slotu: strona Pod Dębem pokazuje odwołany slot znów jako wolny; ponowny zapis na niego przechodzi
- Lista ośrodka (S-05) po odwołaniu nie pokazuje już tego zapisu
- Guard progu: zapis na minioną godzinę/dzień nie ma przycisku (jest w historii), a ręczny POST z jego id daje komunikat o rozpoczętej jeździe
- Stan pusty „Nie masz nadchodzących zapisów" + odnośnik do katalogu działa
- Czytelność mobilna (~390px)

---

## Testing Strategy

### Unit Tests:

- `rider-list.test.ts`: próg nadchodzące/historia (obie strony granicy, `hour === currentHour` → historia), odwołany przyszły → historia, sortowanie rosnące/malejące, fallback konia, pusta lista
- `schema.test.ts`: `cancelSchema` — koercja, odrzucenie złych id, polski komunikat

### Integration Tests:

- Bez nowych skryptów SQL — `rls_isolation.sql` już asertuje: jeździec nie odwoła cudzego (0 wierszy), własne odwołanie przechodzi, odwołany znika z zajętości `get_taken_slots`

### Manual Testing Steps:

1. `npm run dev` → pełny cykl Anny z kryteriów fazy 2 (odwołanie → historia → slot wolny → ponowny zapis)
2. Wyścig: dwa taby „Moich zapisów", odwołanie w obu — drugi dostaje „Nie znaleziono zapisu do odwołania."

## Performance Considerations

Dwa zapytania na render (zapisy z embedded, nazwy koni po `in()`) po indeksie `bookings_rider_id_idx` — bez znaczenia przy skali PRD.

## Migration Notes

Brak migracji — mutacja na istniejącym schemacie; rollback odwołania = ponowny zapis przez S-04 (slot wraca do puli).

## Addendum (post-implementacja, 2026-08-20)

Korekta faktu z Key Discoveries i kontraktów fazy 1: `bookings` **nie ma** bezpośredniego FK do `schedule_days` (tylko `rider_id → profiles` i złożony FK do `schedule_day_horses`). Embed idzie łańcuchem `schedule_day_horses(schedule_days(day, stables(name)), horses(name))` — zweryfikowane na runtime; dzięki temu `getHorseNames` okazało się zbędne, a `splitRiderBookings` przyjmuje dwa argumenty (bez mapy nazw koni). Po przeglądzie implementacji endpoint używa celowanego `getRiderBookingForCancel` zamiast pełnego `getRiderBookings`.

## References

- Roadmapa S-06: `context/foundation/roadmap.md:129`
- PRD FR-009 + Secondary Success: `context/foundation/prd.md`
- Check constraint i polityka UPDATE: `supabase/migrations/20260810090100_schedule_and_bookings.sql:105,287`
- Kanon endpointu: `src/pages/api/bookings/create.ts`
- Asercje odwołania w skrypcie izolacji: `supabase/tests/rls_isolation.sql` (blok S-04)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Czysta logika i zapytania

#### Automated

- [x] 1.1 `npm test` — nowe testy `rider-list` + rozszerzone `schema` przechodzą — 4000193
- [x] 1.2 `npm run lint` zielony — 4000193

### Phase 2: Strona i endpoint

#### Automated

- [x] 2.1 `npm test`, `npm run lint`, `npm run build` — zielone — e315cbd

#### Manual

- [x] 2.2 Cykl Anny: „Moje zapisy" → odwołanie → baner sukcesu → zapis w historii — e315cbd
- [x] 2.3 Zwolniony slot znów wolny na stronie ośrodka; ponowny zapis przechodzi — e315cbd
- [x] 2.4 Lista ośrodka (S-05) bez odwołanego zapisu — e315cbd
- [x] 2.5 Guard progu: rozpoczętej jazdy nie da się odwołać (UI + ręczny POST) — e315cbd
- [x] 2.6 Stan pusty z odnośnikiem do katalogu — e315cbd
- [x] 2.7 Czytelność mobilna (~390px) — e315cbd
