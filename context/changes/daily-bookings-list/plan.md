# S-05 — Lista zapisów dnia (daily-bookings-list) Implementation Plan

## Overview

Konto ośrodka dostaje nową, czysto odczytową stronę `/osrodek/zapisy`: płaską listę aktywnych zapisów (godzina · koń · jeździec) na wybrany dzień. Domyka FR-005 — ostatni brakujący element widoczności po stronie ośrodka: zapisy z S-04 trafiają do bazy, ale ośrodek nie ma dziś żadnego ekranu, który by je pokazywał.

## Current State Analysis

- **Zero pracy w bazie.** Polityka SELECT `bookings_select_own_or_my_stable` (F-01) daje ośrodkowi odczyt zapisów jego dni grafiku, a polityka na `profiles` przez `private.is_rider_of_my_stable` pozwala zobaczyć nazwisko jeźdźca mającego zapis w jego stadninie — F-01 zaprojektowało to wprost pod FR-005 i dowodzi tego asercja „osrodek A widzi profil swojego jezdzca" w `supabase/tests/rls_isolation.sql:51-55`. Bez migracji, bez RPC, bez zmian RLS.
- **`bookings.rider_id` → `profiles(id)` to bezpośredni FK** (`20260810090100_schedule_and_bookings.sql:99`), więc nazwisko jeźdźca dociąga embedded select PostgREST (`profiles(full_name)`). `bookings` NIE ma FK wprost do `horses` (tylko złożony FK do `schedule_day_horses`), więc nazwy koni składamy z `listStableHorses` — dokładnie jak strona jeźdźca w S-04 (`src/pages/jezdziec/osrodki/[id].astro:51-54`).
- **Moduł `src/lib/bookings/` istnieje od S-04** (queries, testy Vitest z polskimi opisami); `getMyBookings` filtruje jawnie po `rider_id` — lekcja z impl-review S-04: nie polegać na RLS tam, gdzie polityka jest szersza niż intencja funkcji.
- **Wzorce stron ośrodka gotowe**: wybór dnia `?dzien=` + nawigacja Poprzedni/Następny (`src/pages/osrodek/grafik.astro:14-16,71-87`), `getOwnedStableId` (`src/lib/stables/queries.ts:61`), destrukturyzacja `Astro.locals` + guard, `dayLabel` przez `toLocaleDateString("pl-PL")`, stany puste z wyjaśnieniem.
- **Pulpit `/osrodek`** ma odnośniki do stada i grafiku — dojdzie trzeci, do zapisów.
- **Seed daje scenariusz testowy**: Anna ma zapis (Bella, 11:00) w Pod Dębem na jutro; po ręcznym teście S-04 mogą istnieć kolejne.

## Desired End State

Ośrodek po zalogowaniu wchodzi w „Zapisy" z pulpitu, widzi listę dzisiejszych zapisów (domyślnie), może przełączyć dzień — także wstecz (historia) — i czyta wiersze „10:00 · Bella · Anna Kowalska" posortowane po godzinie, potem koniu. Dzień bez ułożonego grafiku i dzień bez zapisów mają osobne, wyjaśniające stany puste.

Weryfikacja: `npm test`, `npm run lint`, `npm run build` zielone; ręcznie na seedzie konto `osrodek.debem@example.com` widzi zapis Anny na jutro, a konto `osrodek.rzeka@example.com` — tylko swój (Piotra), nie widzi cudzych.

### Key Discoveries:

- Embedded select `bookings → profiles(full_name)` działa przez bezpośredni FK; RLS na `profiles` przycina do jeźdźców własnej stadniny, więc dla własnych zapisów nazwisko zawsze się rozwiąże (jeździec z zapisem w stadninie spełnia `is_rider_of_my_stable`).
- `profiles.full_name` jest nullable — wiersz listy potrzebuje fallbacku (np. „(bez nazwiska)"), bo rejestracja nie wymusza imienia.
- Filtr `eq("status", "active")` jest jawny — spójnie z `getMyBookings` i decyzją z planowania (tylko aktywne).
- Dni przeszłe są dozwolone bez żadnego guardu — strona jest czysto odczytowa, nie ma tu akcji, które ograniczenie grafiku („dziś i w przód") chroniło.

## What We're NOT Doing

- **Siatka godzina×koń** — roadmapa wprost ostrzega przed tą pokusą; PRD zawęża v1 do prostej listy.
- **Odwołane zapisy na liście** — pokazujemy wyłącznie aktywne; rozszerzenie ewentualnie po S-06.
- **Akcje na liście** (odwoływanie cudzych zapisów przez ośrodek — FR-009 daje to prawo tylko jeźdźcowi; edycja; kontakt z jeźdźcem).
- **Migracje, zmiany RLS, nowe RPC** — istniejące polityki wystarczają.
- **Widoki zbiorcze** (tydzień, zakres dat, statystyki) i eksport.
- **Zmiany w grafiku, katalogu i stronie jeźdźca.**

## Implementation Approach

Jedno zapytanie + jedna czysta funkcja + jedna strona. `getDayBookings(client, stableId, day)` znajduje dzień grafiku (reużyte `getScheduleDay`) i pobiera jego aktywne zapisy z embedded nazwiskiem jeźdźca; czysta funkcja `composeBookingRows` skleja to z nazwami koni (`listStableHorses`), sortuje po godzinie, potem nazwie konia, i wstawia fallbacki — pod testami Vitest, bo to jedyna logika tego slice'a. Strona `/osrodek/zapisy` powtarza szkielet `grafik.astro` (wybór dnia, nawigacja, karta, stany puste) w wariancie tylko-do-odczytu; bez ograniczenia dat przeszłych. Pulpit `/osrodek` dostaje odnośnik.

## Phase 1: Zapytanie i czysta logika

### Overview

Rozszerzenie modułu `src/lib/bookings/` o odczyt zapisów dnia z perspektywy ośrodka i czystą funkcję składającą wiersze listy; komplet testów.

### Changes Required:

#### 1. Zapytanie o zapisy dnia

**File**: `src/lib/bookings/queries.ts`

**Intent**: Dać stronie ośrodka aktywne zapisy jego dnia grafiku wraz z nazwiskiem jeźdźca — jednym zapytaniem, bez ujawniania niczego ponad to, co RLS i tak wpuszcza.

**Contract**: `getDayBookings(client, scheduleDayId: number): Promise<DayBooking[]>`, gdzie `DayBooking = { horseId: number; hour: number; riderName: string | null }` — select `horse_id, hour, profiles(full_name)` z filtrami `eq("schedule_day_id", scheduleDayId)` i `eq("status", "active")`; mapowanie snake→camel na granicy zapytania (embedded `profiles` może być `null` przy niewidocznym profilu — mapować na `null`, fallback robi warstwa czysta). Klient pierwszym argumentem, błąd rzucany dalej — konwencje modułu.

#### 2. Składanie wierszy listy

**File**: `src/lib/bookings/rows.ts` (+ `rows.test.ts`)

**Intent**: Jedyna logika slice'a — połączenie zapisów z nazwami koni, sortowanie i fallbacki — jako czysta funkcja pod testami, żeby strona `.astro` tylko renderowała.

**Contract**: `composeBookingRows(bookings: DayBooking[], horses: { id: number; name: string }[]): BookingRow[]`, gdzie `BookingRow = { hour: number; horseName: string; riderName: string }` — sortowanie: godzina rosnąco, potem nazwa konia (`localeCompare` z locale `pl`); fallbacki: koń spoza listy (teoretycznie niemożliwe, ale FK idzie przez `schedule_day_horses`, nie wprost) → `"(koń #<id>)"`, `riderName: null` → `"(bez nazwiska)"`. Formatowanie „10:00" po stronie widoku. Testy: sortowanie (w tym stabilne w ramach godziny po koniu), oba fallbacki, pusta lista → pusta lista.

### Success Criteria:

#### Automated Verification:

- `npm test` — nowe testy `rows` przechodzą, opisy `it(...)` po polsku
- `npm run lint` zielony

---

## Phase 2: Strona i nawigacja

### Overview

Strona `/osrodek/zapisy` w szkielecie `grafik.astro` (wariant tylko-do-odczytu) + odnośnik z pulpitu ośrodka.

### Changes Required:

#### 1. Strona listy zapisów

**File**: `src/pages/osrodek/zapisy.astro`

**Intent**: Widok FR-005 — lista zapisów wybranego dnia; czysto odczytowy, mobilnie czytelny, bez JavaScriptu.

**Contract**: Trasa pod `/osrodek` (middleware pilnuje roli, wzorzec destrukturyzacja `Astro.locals` + guard `if (supabase && profile)`). Parametr `?dzien=` przez `parseScheduleDate`, domyślnie **`todayIso()`** (nie jutro — odczyt różni się od układania); dni przeszłe dozwolone, bez trybu read-only (cała strona jest odczytem). Nawigacja Poprzedni/Następny (`addDays`, bez blokady wstecz) + `dayLabel` jak w `grafik.astro`. Dane: `getOwnedStableId` → `getScheduleDay` → (`getDayBookings` + `listStableHorses` równolegle) → `composeBookingRows`. Render: płaskie wiersze „`{hour}:00` · `{horseName}` · `{riderName}`". Stany: `loadFailed`; brak dnia grafiku → „Ten dzień nie ma ułożonego grafiku" (z odnośnikiem do `/osrodek/grafik?dzien=…`); grafik bez zapisów → „Brak zapisów tego dnia".

#### 2. Odnośnik z pulpitu

**File**: `src/pages/osrodek/index.astro`

**Intent**: Ośrodek musi mieć drogę do nowego ekranu — trzeci kafelek/odnośnik obok stada i grafiku, w istniejącym wzorcu pulpitu.

**Contract**: Odnośnik do `/osrodek/zapisy` w tej samej konwencji co istniejące odnośniki pulpitu; bez zmian pozostałej treści.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run lint`, `npm run build` — zielone

#### Manual Verification:

- Konto `osrodek.debem@example.com` (`sekret123`): pulpit → „Zapisy" → domyślnie dziś (stan pusty z sensownym komunikatem) → przełączenie na jutro → widoczny wiersz „11:00 · Bella · Anna Kowalska" (+ ewentualne zapisy z testów S-04)
- Konto `osrodek.rzeka@example.com`: jutro widzi wyłącznie „10:00 · Grom · Piotr Nowak" — zapisów Pod Dębem nie widać (izolacja)
- Dzień przeszły daje się wybrać i pokazuje historię (albo stan pusty) bez błędu
- Dzień bez grafiku vs grafik bez zapisów — dwa różne komunikaty; odnośnik do grafiku działa
- Strona czytelna na ~390px

---

## Testing Strategy

### Unit Tests:

- `rows.test.ts`: sortowanie godzina→koń (locale pl), fallback nazwiska, fallback konia, pusta lista

### Integration Tests:

- Brak nowych skryptów SQL — izolację odczytu ośrodka dowodzi już `rls_isolation.sql` (asercje bookings i profiles z F-01); slice nie zmienia schematu ani polityk

### Manual Testing Steps:

1. `npx supabase db reset` → `npm run dev` → ścieżka z kryteriów fazy 2 na obu kontach ośrodków
2. Zapis nowej rezerwacji jako Anna (S-04) → odświeżenie listy ośrodka → nowy wiersz widoczny

## Performance Considerations

Dwa–trzy zapytania na render (dzień, zapisy z profilem, konie) po istniejących indeksach (`schedule_days` unique `(stable_id, day)`, `bookings_schedule_day_id_hour_idx`) — przy `qps: low` bez znaczenia.

## Migration Notes

Brak migracji — slice czysto odczytowy na istniejącym schemacie i politykach.

## References

- Roadmapa S-05: `context/foundation/roadmap.md:117`
- PRD FR-005: `context/foundation/prd.md:83`
- Polityki SELECT bookings/profiles: `supabase/migrations/20260810090100_schedule_and_bookings.sql:263,320`
- Wzorzec strony dnia: `src/pages/osrodek/grafik.astro`
- Wzorzec składania nazw koni: `src/pages/jezdziec/osrodki/[id].astro:51-54` (S-04)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Zapytanie i czysta logika

#### Automated

- [x] 1.1 `npm test` — nowe testy `rows` przechodzą, opisy `it(...)` po polsku — 0f7c71d
- [x] 1.2 `npm run lint` zielony — 0f7c71d

### Phase 2: Strona i nawigacja

#### Automated

- [x] 2.1 `npm test`, `npm run lint`, `npm run build` — zielone

#### Manual

- [x] 2.2 Pod Dębem: pulpit → Zapisy → dziś (pusty) → jutro: „11:00 · Bella · Anna Kowalska"
- [x] 2.3 Nad Rzeką: jutro wyłącznie „10:00 · Grom · Piotr Nowak" (izolacja)
- [x] 2.4 Dzień przeszły wybieralny, bez błędu
- [x] 2.5 Dwa różne stany puste + działający odnośnik do grafiku
- [x] 2.6 Czytelność mobilna (~390px)
