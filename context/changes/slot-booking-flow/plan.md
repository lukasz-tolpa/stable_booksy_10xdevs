# S-04 — Rezerwacja jazdy (slot-booking-flow) Implementation Plan

## Overview

Jeździec na stronie ośrodka `/jezdziec/osrodki/[id]` wybiera dzień (domyślnie jutro), widzi wyłącznie wolne sloty (godzina × koń) zgodne z regułą alokacji i zapisuje się na jazdę jednym kliknięciem. Zapis pojawia się po stronie ośrodka, a próba zapisu na slot zajęty w międzyczasie kończy się czytelną polską odmową. To gwiazda przewodnia MVP — domyka Primary Success Criterion PRD (pełna pętla rezerwacji end-to-end).

## Current State Analysis

- **Baza jest gotowa niemal w całości** (F-01 + S-02). Guardraile żyją w bazie i S-04 ich nie re-implementuje, tylko tłumaczy kody błędów:
  - dubel slotu → `23505` z częściowego indeksu `bookings_active_slot_key` (`supabase/migrations/20260810090100_schedule_and_bookings.sql:122`),
  - godzina poza `[open_hour, close_hour)` → `23514` z triggera `bookings_within_working_hours` (tamże `:135-169`; komentarz funkcji wprost przewiduje rozróżnienie dla S-04),
  - koń nieprzydzielony do dnia / dzień nie istnieje → `23503` ze złożonego FK `bookings_scheduled_horse_fkey` (`:107`) i z triggera (`:154`).
- **Jedyna luka: jeździec nie widzi zajętości.** Polityka SELECT na `bookings` (`20260810090100:263`) pokazuje jeźdźcowi wyłącznie jego własne wiersze — zajęte przez innych sloty są niewidoczne, więc wolnych slotów nie da się policzyć samym odczytem. `Functions: {}` w wygenerowanych typach potwierdza, że żadnego RPC jeszcze nie ma.
- **Polityka INSERT** `bookings_insert_own_as_rider` (`20260810090100:277`) wymaga `rider_id = auth.uid()` i roli `rider`; nie pilnuje dat przeszłych — to musi zrobić aplikacja.
- **Strona `/jezdziec/osrodki/[id]`** (`src/pages/jezdziec/osrodki/[id].astro`) to czysty punkt zaczepienia: waliduje `id` przez `parseStableId`, pobiera ośrodek przez `getStableById`, renderuje trzy stany (błąd ładowania / ośrodek / nie znaleziono) i zawiera komentarz-placeholder „Wolne sloty i zapis na jazdę dołoży S-04" (`:10-11`). Strona nie czyta dziś `Astro.locals` — id jeźdźca trzeba dopiero wpiąć (`Astro.locals.user`, wzorzec z `src/pages/osrodek/grafik.astro:13`).
- **Wzorzec endpointu POST jest ustalony** (`src/pages/api/schedule/save.ts` jako kanon): formData → zod `safeParse` → guard domenowy → `createClient` → `auth.getUser()` → encja właścicielska z sesji, nigdy z formularza → try/catch z mapowaniem kodów → redirect PRG z `?error=` albo czysty. Żadnych odpowiedzi JSON w aplikacji.
- **Gotowe do reużycia:** `getScheduleDay(client, stableId, day)` (`src/lib/schedule/queries.ts:37` — parametryzowane po stableId, otwarte RLS wpuszcza jeźdźca), `listStableHorses` (`src/lib/stables/queries.ts:78`), `parseScheduleDate`/`todayIso`/`defaultScheduleDate`/`isPastDate` ze strefą `Europe/Warsaw` (`src/lib/schedule/dates.ts`), wzorzec mapowania błędów (`src/lib/schedule/errors.ts:76`), `formValue` (`src/lib/form-data.ts`), `firstErrorMessage` (`src/lib/auth/schemas.ts:48`).
- **Seed daje scenariusze testowe od ręki:** jutro w Pod Dębem pracują Bella i Kasztan (10–16), Anna ma zapis na Bellę 11:00 (przypadek `23505`), Iskra nie pracuje (przypadek `23503`), godzina 9/16 to przypadek `23514`.
- **Lekcje z review S-02:** walidacja przed pierwszą mutacją (F1), rozróżnialne komunikaty per przyczyna (F2), strefa `Europe/Warsaw` zamiast strefy maszyny (F4), asercje skryptów SQL filtrowane po dacie (F3).

## Desired End State

Jeździec po zalogowaniu wchodzi na stronę ośrodka, wybiera dzień, widzi sekcje godzin z przyciskami dostępnych koni i zapisuje się jednym kliknięciem. Po sukcesie wraca na stronę z komunikatem, a jego slot jest oznaczony jako „Twój zapis". Próba zapisu na slot właśnie zajęty daje komunikat o zajętości i odświeżoną listę bez tego slotu. Dzień bez grafiku pokazuje stan pusty, nie listę zero wyników. Skrypt współbieżności nadal dowodzi: dokładnie jeden sukces na pięć równoległych prób.

Weryfikacja końcowa: pełna pętla na seedzie (Anna zapisuje się na Kasztana 12:00 w Pod Dębem; zapis widać w bazie po stronie ośrodka), `npm test`, `npm run lint`, `npm run build`, `rls_isolation.sql`, `concurrent_double_booking.sh` — wszystko zielone.

### Key Discoveries:

- Zajętość wymaga nowego mechanizmu odczytu — funkcja `security definer` zgodna z wzorcem `private.current_role()`/`private.current_stable_id()` z F-01 (`20260810090000:94-109`), tyle że w `public`, bo musi być wywoływalna przez PostgREST `.rpc()`.
- `bookings` nie ma kolumn `stable_id`/`day` — zajętość per (ośrodek, dzień) wymaga złączenia z `schedule_days` wewnątrz funkcji.
- `getScheduleDay` z S-02 przyjmuje `stableId` jako parametr i działa na otwartych politykach odczytu — jeździec może go wywołać bez zmian; zwraca też `horseIds` przez embedded `schedule_day_horses(horse_id)`.
- Endpoint nie może ufać `schedule_day_id` z formularza — rozwiązuje `(stableId, day)` → `schedule_day_id` po stronie serwera, analogicznie do zasady „encja właścicielska z sesji, nie z formularza" (`api/horses/create.ts:40-42`).
- Konie pokazujemy wg przydziału do dnia (kontrakt bazy — FK sprawdza przydział, nie flagę `active`); flaga `active` steruje wyłącznie widokiem stada ośrodka.

## What We're NOT Doing

- **Odwołanie zapisu** (FR-009, S-06) — status `cancelled` istnieje w schemacie, ale żadnego UI ani endpointu odwołania nie budujemy.
- **Lista zapisów dnia po stronie ośrodka** (FR-005, S-05).
- **Widok „moje zapisy" jeźdźca** — świadoma decyzja z planowania; wejdzie naturalnie z S-06. W S-04 własny zapis widać wyłącznie jako oznaczenie w liście slotów.
- **Krok potwierdzenia przed zapisem** — jeden klik; wyścig rozstrzyga baza.
- **Blokada dwóch zapisów tego samego jeźdźca o tej samej godzinie na różnych koniach** — reguły nie ma w PRD (potwierdzone przy F-01).
- **Dzienny limit godzin konia** (v2), chipy dostępności najbliższych dni, jakiekolwiek zmiany w katalogu S-03, zmiany istniejących polityk RLS, wpięcie skryptów SQL do CI.

## Implementation Approach

Zajętość slotów dostarcza jedna funkcja `security definer` w `public`, zwracająca wyłącznie pary (koń, godzina) aktywnych zapisów — zero tożsamości jeźdźców, więc guardrail izolacji z F-01 pozostaje nienaruszony. Cała logika wyliczania wolnych slotów (iloczyn godzin × koni, minus zajęte, minus minione godziny dzisiejszego dnia w strefie `Europe/Warsaw`) to czysta funkcja w nowym module `src/lib/bookings/` pod testami Vitest — strona `.astro` tylko renderuje wynik. Endpoint `POST /api/bookings/create` powtarza kanon z S-02: zod, guardy domenowe przed mutacją, `rider_id` z sesji, mapowanie `23505`/`23514`/`23503` na polskie komunikaty, redirect PRG. Formularz bez JavaScriptu: każdy przycisk konia to osobny submit z ukrytymi polami.

## Critical Implementation Details

- **Timing & lifecycle**: Filtr minionych godzin liczy „teraz" w strefie `Europe/Warsaw`, nie w strefie runtime (Cloudflare Workers = UTC) — dokładnie błąd F4 z review S-02. Bieżącą godzinę wstrzykujemy jako parametr z domyślną wartością (wzorzec `todayIso(now = new Date())`), żeby testy nie zależały od zegara.
- **State sequencing**: Endpoint waliduje kolejno: schema → data nieprzeszła → (dla dziś) godzina nieminiona → istnienie dnia grafiku → dopiero INSERT. Wszystkie guardy przed jedyną mutacją — INSERT jest pojedynczy i atomowy, więc problem F1 z S-02 (częściowy zapis) tu nie występuje, ale odwrócenie kolejności dałoby użytkownikowi surowe kody zamiast komunikatów o dacie.
- **Debug & observability**: Odmowę współbieżną rozpoznajemy wyłącznie po `code === "23505"`; komunikat bazy zawiera nazwę indeksu `bookings_active_slot_key` — nie parsować message, wystarczy kod (w odróżnieniu od `SB002`, gdzie z message wyciąga się licznik).

## Phase 1: Zajętość slotów w bazie

### Overview

Migracja z funkcją RPC zwracającą zajęte sloty ośrodka na dany dzień, regeneracja typów, dowód w `rls_isolation.sql`, że mechanizm nie wycieka tożsamości.

### Changes Required:

#### 1. Migracja: funkcja zajętości

**File**: `supabase/migrations/20260819090000_booking_slot_occupancy.sql`

**Intent**: Dać każdemu zalogowanemu odczyt zajętości slotów (koń × godzina) dowolnego ośrodka i dnia — bez ujawniania, kto zajął slot — żeby jeździec mógł zobaczyć wolne sloty mimo restrykcyjnej polityki SELECT na `bookings`.

**Contract**: `public.get_taken_slots(p_stable_id bigint, p_day date) returns table (horse_id bigint, hour smallint)` — `language sql`, `stable`, `security definer`, `set search_path = ''`; ciało łączy `public.bookings` z `public.schedule_days` po `schedule_day_id`, filtruje `stable_id`, `day` i `status = 'active'`. `revoke execute from public, anon; grant execute to authenticated`. Komentarz na funkcji wyjaśnia, czemu jest `security definer` i czemu nie zwraca `rider_id` (wzorzec komentarzy z F-01/S-02).

#### 2. Regeneracja typów

**File**: `src/db/database.types.ts`

**Intent**: `npm run db:types` po `db reset` — sekcja `Functions` przestaje być pusta i `.rpc("get_taken_slots", …)` jest w pełni typowane. Pliku nie edytować ręcznie.

**Contract**: `Database["public"]["Functions"]["get_taken_slots"]` z `Args: { p_stable_id: number; p_day: string }` i `Returns: { horse_id: number; hour: number }[]`.

#### 3. Dowód w skrypcie izolacji

**File**: `supabase/tests/rls_isolation.sql`

**Intent**: Rozszerzyć skrypt o asercje nowego mechanizmu: jeździec widzi zajętość cudzych slotów przez funkcję, ale nadal nie widzi cudzych wierszy `bookings`; `anon` nie może wywołać funkcji.

**Contract**: Nowy blok `begin … rollback` w konwencji skryptu (`set local role` + `request.jwt.claims`, asercje z `raise notice 'PASS/FAIL'`): (a) Anna wywołuje `get_taken_slots` dla Stajni Nad Rzeką na `current_date + 1` i dostaje dokładnie 1 wiersz (zapis Piotra), choć bezpośredni `select` z `bookings` dla tej stadniny daje 0 wierszy; (b) `set local role anon` → wywołanie funkcji kończy się błędem uprawnień. Zapytania filtrowane po dacie (lekcja F3 z review S-02).

### Success Criteria:

#### Automated Verification:

- Migracja przechodzi od zera: `npx supabase db reset` kończy się bez błędów, seed załadowany
- `npm run db:types` wykonane, `git diff src/db/database.types.ts` pokazuje funkcję `get_taken_slots`, `npm run lint` zielony
- `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -q < supabase/tests/rls_isolation.sql` — wszystkie asercje PASS, w tym nowe

#### Manual Verification:

- Przegląd migracji: funkcja ma `security definer` + `set search_path = ''` + revoke/grant — komplet, zgodnie z wzorcem F-01

---

## Phase 2: Czysta logika rezerwacji

### Overview

Nowy moduł `src/lib/bookings/` z całą logiką domenową pod testami Vitest: wyliczanie sekcji wolnych slotów, schema formularza, mapowanie błędów, zapytania.

### Changes Required:

#### 1. Wyliczanie wolnych slotów

**File**: `src/lib/bookings/slots.ts` (+ `slots.test.ts`)

**Intent**: Czysta funkcja składająca widok slotów z danych wejściowych — jedyne miejsce, gdzie żyje reguła alokacji po stronie odczytu.

**Contract**: `computeSlotSections(input): SlotSection[]`, gdzie input to `{ openHour, closeHour, horses: {id, name}[], takenSlots: {horseId, hour}[], myBookings: {horseId, hour}[], currentHour: number | null }` — `currentHour` niezerowe tylko dla dnia dzisiejszego; zwraca sekcje per godzina z `[open, close)`, z pominięciem godzin `<= currentHour`, a w każdej sekcji konie ze statusem `free` | `mine` (slot zajęty przez innych w ogóle nie jest emitowany). Godzina, w której nie ma ani jednego konia `free` ani `mine`, jest **pomijana w całości** — spójnie z PRD („pokazywane są wyłącznie wolne sloty") i krócej na telefonie; godzina z własnym zapisem pozostaje widoczna. Godziny formatowane „10:00" po stronie widoku, nie tutaj. Testy: przedział półotwarty, filtr minionych godzin (w tym `currentHour: null` dla dni przyszłych), oznaczenie `mine`, pomijanie godziny w całości zajętej przez innych, dzień bez koni.

#### 2. Schema formularza zapisu

**File**: `src/lib/bookings/schema.ts` (+ `schema.test.ts`)

**Intent**: Walidacja pól POST z polskimi komunikatami, lustrzana wobec ograniczeń bazy — wzorzec `scheduleDaySchema`.

**Contract**: `bookingSchema` na polach `{ stableId, day, horseId, hour }` (surowe stringi z formularza): `stableId`/`horseId` przez `z.coerce.number().int().positive()`, `day` przez walidację ISO (reużyć `parseScheduleDate`/`isValidIsoDate` w `.refine`), `hour` 0–23. Eksport typu wejścia jak `ScheduleDayInput`.

#### 3. Mapowanie błędów rezerwacji

**File**: `src/lib/bookings/errors.ts` (+ `errors.test.ts`)

**Intent**: Tłumaczenie kodów bazy na polskie komunikaty jeźdźca — odpowiednik `scheduleErrorMessage`, osobny moduł, bo odbiorcą jest jeździec, nie ośrodek.

**Contract**: `bookingErrorMessage(code: string | null): string` z przypadkami: `23505` → „Ten slot został właśnie zajęty. Wybierz inny termin lub konia."; `23514` → komunikat o godzinie poza zakresem pracy; `23503` → komunikat o nieaktualnym grafiku (koń nie pracuje / dzień usunięty); default → fallback. Bez parsowania `message` — sam kod wystarcza.

#### 4. Zapytania rezerwacji

**File**: `src/lib/bookings/queries.ts`

**Intent**: Cienka warstwa dostępu do danych dla strony i endpointu; klient zawsze pierwszym argumentem (konwencja repo).

**Contract**: `getTakenSlots(client, stableId, day)` — `.rpc("get_taken_slots", …)` + mapowanie snake→camel; `getMyBookings(client, scheduleDayId)` — select własnych aktywnych zapisów dnia (RLS i tak przytnie do własnych, filtr po `schedule_day_id` i `status`); `createBooking(client, { scheduleDayId, horseId, hour, riderId })` — pojedynczy INSERT, błąd rzucany z zachowanym `code`. Nazwy koni dnia: strona składa je z `getScheduleDay(...).horseIds` × `listStableHorses(...)` — bez nowego zapytania.

### Success Criteria:

#### Automated Verification:

- `npm test` — nowe testy `slots`/`schema`/`errors` przechodzą, opisy `it(...)` po polsku, wstrzykiwanie czasu parametrem (bez fake timers)
- `npm run lint` zielony

---

## Phase 3: Strona ośrodka i endpoint zapisu

### Overview

Rozbudowa `/jezdziec/osrodki/[id]` o wybór dnia, sekcje slotów i komunikaty; nowy `POST /api/bookings/create` domyka pętlę rezerwacji.

### Changes Required:

#### 1. Strona ośrodka z listą slotów

**File**: `src/pages/jezdziec/osrodki/[id].astro`

**Intent**: W miejscu placeholdera S-04 wyrenderować wybór dnia i wolne sloty; zapis jednym kliknięciem.

**Contract**: Parametr `?dzien=` przez `parseScheduleDate`, domyślnie `defaultScheduleDate()` (jutro); daty przeszłe traktowane jak niepoprawne → powrót do domyślnej. Formularz GET zmiany daty (`<input type="date">`, wzorzec z `grafik.astro`). Dane: `getScheduleDay` + `listStableHorses` + `getTakenSlots` + `getMyBookings` → `computeSlotSections` (dla dziś: bieżąca godzina w `Europe/Warsaw`). Render: sekcje godzin, w każdej przyciski koni — każdy przycisk to formularz POST na `/api/bookings/create` z ukrytymi polami `stableId`, `day`, `horseId`, `hour`; slot `mine` jako nieaktywne oznaczenie „Twój zapis". Stany puste rozróżnione: brak dnia grafiku („Ośrodek nie ułożył grafiku na ten dzień") vs dzień bez wolnych slotów. Komunikat błędu z `?error=` czytany wzorcem z `grafik.astro`; parametr `?sukces=` to **nowy** wzorzec (dotąd istnieje tylko kanał błędu — `api/schedule/save.ts` po sukcesie robi redirect bez komunikatu) — renderować zielony baner sukcesu analogiczny do istniejącego banera błędu. Id jeźdźca wzorcem chronionych stron: destrukturyzacja `Astro.locals` + guard `if (supabase && user)` (jak `grafik.astro:13,26` — `locals.user` jest typowany jako nullable, gołe `.id` zapali type-checked ESLint).

#### 2. Endpoint zapisu

**File**: `src/pages/api/bookings/create.ts`

**Intent**: Przyjąć POST, zwalidować, rozwiązać dzień grafiku po stronie serwera i wykonać INSERT; wszystkie odmowy jako redirect z polskim komunikatem.

**Contract**: Kanon `api/schedule/save.ts`: `prerender = false`; helper `backToStable(context, stableId, day, message?)` budujący redirect na `/jezdziec/osrodki/{id}?dzien=…{&error=…|&sukces=1}`; `bookingSchema.safeParse` → `firstErrorMessage`; guardy przed mutacją: `isPastDate(day)` → odmowa, dzień dzisiejszy z minioną godziną → odmowa (ta sama logika progu co w `computeSlotSections`); `auth.getUser()` → brak sesji → `SIGN_IN_ROUTE`; `getScheduleDay(client, stableId, day)` → brak dnia → odmowa „grafik nie istnieje"; `createBooking` z `riderId` z sesji (**nigdy z formularza** — wymusza to też RLS); catch → `bookingErrorMessage(code)`. Sukces → `&sukces=1`.

#### 3. Korekta dokumentacji

**File**: `AGENTS.md`

**Intent**: Sekcja „Database" wspomina teraz o `get_taken_slots` (jedyny RPC w projekcie) i o tym, że `23505`/`23514`/`23503` mają gotowe mapowanie w `src/lib/bookings/errors.ts`; przy okazji skorygować przedawnione „No test framework is configured" (Vitest działa od S-02).

**Contract**: Edycja dwóch akapitów, bez zmiany struktury pliku.

### Success Criteria:

#### Automated Verification:

- `npm test`, `npm run lint`, `npm run build` — zielone
- `bash supabase/tests/concurrent_double_booking.sh` — dokładnie jeden sukces na 5 równoległych prób (dowód NFR, bez zmian w skrypcie)
- `docker exec -i supabase_db_10x-astro-starter psql -U postgres -d postgres -q < supabase/tests/rls_isolation.sql` — wszystkie asercje PASS

#### Manual Verification:

- Pełna pętla na seedzie: Anna (`anna.kowalska@example.com` / `sekret123`) → katalog → Pod Dębem → jutro → widzi Bellę {10,12–15} i Kasztana {10–15}, slot Belli 11:00 oznaczony „Twój zapis" → zapisuje się na Kasztana 12:00 → sukces, slot znika z wolnych
- Odmowa zajętości: po zapisie Anny, Piotr próbuje ten sam slot (Kasztan 12:00) → komunikat o zajętości, lista odświeżona bez slotu
- Stan pusty: data bez grafiku (np. +3 dni) → komunikat o braku grafiku, nie pusta lista; zmiana daty formularzem działa z wyłączonym JavaScriptem
- Dziś z minionymi godzinami: (jeśli grafik na dziś istnieje) godziny `<=` bieżącej nie są pokazywane
- Konto ośrodka wchodzące na `/jezdziec/osrodki/[id]` jest przekierowane do `/osrodek` (middleware, bez zmian) — sanity check
- Mobile: strona czytelna i klikalna w widoku telefonu (DevTools, ~390px)

---

## Testing Strategy

### Unit Tests:

- `slots.test.ts`: przedział półotwarty `[open, close)`; filtr `currentHour` (dziś) vs `null` (przyszłość); statusy `free`/`mine`; zajęte przez innych niewidoczne; dzień bez koni → zero sekcji
- `schema.test.ts`: odrzucenie złych dat / godzin / id, polskie komunikaty
- `errors.test.ts`: mapowanie `23505`/`23514`/`23503`/nieznany kod

### Integration Tests:

- `rls_isolation.sql` (rozszerzony): funkcja zajętości widoczna dla jeźdźca, niedostępna dla `anon`, bez wycieku wierszy `bookings`
- `concurrent_double_booking.sh`: bez zmian — dowód NFR współbieżności na tej samej ścieżce INSERT, której używa endpoint

### Manual Testing Steps:

> Kolejność jest istotna: `concurrent_double_booking.sh` celuje dokładnie w slot Kasztan/12:00 i **czyści go przed i po biegu** (delete jako postgres, bez filtra) — odpalony po pętli ręcznej skasuje zapis Anny. Skrypt uruchamiać PRZED krokiem 1 (albo świadomie po wszystkim, akceptując wyczyszczenie slotu).

1. `bash supabase/tests/concurrent_double_booking.sh` (dowód NFR — przed testami ręcznymi)
2. `npx supabase db reset` → `npm run dev` → pełna pętla Anny (jak w kryteriach fazy 3)
3. Wyścig dwóch przeglądarek: Anna i Piotr na tym samym slocie, dwa szybkie kliknięcia — jeden sukces, jedna odmowa z komunikatem
4. Nawigacja datami: jutro → +3 dni (pusty stan) → powrót; odświeżenie strony zachowuje datę z adresu

## Performance Considerations

Strona wykonuje 4 zapytania (dzień, konie, zajętość, własne zapisy) — przy `qps: low` i `data_volume: small` z PRD bez znaczenia; wszystkie idą po istniejących indeksach (`schedule_days(stable_id, day)` unique, `bookings_schedule_day_id_hour_idx`). Funkcja RPC jest `stable`, więc planner może ją inline'ować.

## Migration Notes

Migracja czysto addytywna (jedna funkcja) — zero zmian w istniejących tabelach i politykach, `db push` na zdalny projekt bez ryzyka dla danych. Rollback = `drop function`.

## References

- Roadmapa S-04: `context/foundation/roadmap.md:105`
- PRD: US-01, FR-007, FR-008, NFR współbieżności: `context/foundation/prd.md`
- Schemat i guardraile: `supabase/migrations/20260810090100_schedule_and_bookings.sql`
- Kanon endpointu: `src/pages/api/schedule/save.ts`
- Lekcje z review S-02: `context/changes/daily-schedule-management/reviews/impl-review.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Zajętość slotów w bazie

#### Automated

- [x] 1.1 Migracja przechodzi od zera (`npx supabase db reset` + seed) — b69a30d
- [x] 1.2 Typy zregenerowane z funkcją `get_taken_slots`, `npm run lint` zielony — b69a30d
- [x] 1.3 `rls_isolation.sql` — wszystkie asercje PASS, w tym nowe dla RPC — b69a30d

#### Manual

- [x] 1.4 Przegląd migracji: `security definer` + `search_path=''` + revoke/grant komplet — b69a30d

### Phase 2: Czysta logika rezerwacji

#### Automated

- [x] 2.1 `npm test` — nowe testy `slots`/`schema`/`errors` przechodzą — 37e5322
- [x] 2.2 `npm run lint` zielony — 37e5322

### Phase 3: Strona ośrodka i endpoint zapisu

#### Automated

- [x] 3.1 `npm test`, `npm run lint`, `npm run build` zielone — 8079f71
- [x] 3.2 `concurrent_double_booking.sh` — dokładnie jeden sukces na 5 prób — 8079f71
- [x] 3.3 `rls_isolation.sql` — wszystkie asercje PASS — 8079f71

#### Manual

- [x] 3.4 Pełna pętla rezerwacji Anny na seedzie (sloty, „Twój zapis", zapis na Kasztana 12:00) — 8079f71
- [x] 3.5 Odmowa zajętości dla Piotra na tym samym slocie z odświeżoną listą — 8079f71
- [x] 3.6 Stany puste i nawigacja datami bez JavaScriptu — 8079f71
- [x] 3.7 Filtr minionych godzin dnia dzisiejszego — 8079f71
- [x] 3.8 Redirect konta ośrodka poza `/jezdziec` (sanity middleware) — 8079f71
- [x] 3.9 Czytelność mobilna (~390px) — 8079f71
