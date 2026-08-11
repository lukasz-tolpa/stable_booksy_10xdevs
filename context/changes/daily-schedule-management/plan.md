# S-02 — Grafik dnia ośrodka — Implementation Plan

## Overview

Ośrodek dostaje trzy rzeczy, których dziś nie ma: guardrail w bazie chroniący istniejące zapisy przed zmianą grafiku, stado koni do wyboru i ekran układania konkretnego dnia (zakres godzin + konie pracujące). Z tego S-04 wyliczy wolne sloty.

Slice domyka też rozstrzygnięcie Otwartego pytania #2 PRD — decyzja zapadła 2026-08-11, ale jej połowa dotycząca godzin **nie jest dziś egzekwowana przez nic**.

## Current State Analysis

- **Aplikacja nie dotyka tabeli `horses`.** Poza aliasami typów w `src/types.ts:18` i `:24` nic jej nie czyta ani nie zapisuje. FR-004 każe wskazywać konie pracujące danego dnia, ale stado, z którego miałby wybierać ośrodek, nie ma jak powstać. To ta sama klasa luki, którą S-01 zamknął dla stadniny.
- **Trigger chroniący zapisy nie istnieje.** Na `schedule_days` wisi wyłącznie `schedule_days_set_updated_at`. Sprawdzone na żywo: `UPDATE schedule_days SET close_hour = 11` pod aktywnym zapisem o 11:00 przechodzi i zostawia zapis poza zakresem pracy.
- **Zmiana daty dnia przenosi zapisy po cichu.** `UPDATE schedule_days SET day = day + 7` przechodzi bez oporu — jeździec zapisany na wtorek budzi się zapisany na wtorek za tydzień.
- **Usunięcie całego dnia z zapisami jest już zablokowane.** Kaskada `schedule_days` → `schedule_day_horses` uderza w `ON DELETE RESTRICT` z `bookings_scheduled_horse_fkey`. Ten przypadek mamy z F-01 za darmo.
- **`horses.active` istnieje i jest nieużywana** — kolumna z F-01 czeka na znaczenie.
- **`/osrodek` to szkielet** (`src/pages/osrodek/index.astro`): nazwa stadniny i nic więcej. Konto ośrodka ma gwarantowaną stadninę dzięki wymuszeniu z S-01, więc `private.current_stable_id()` nigdy nie będzie tu `NULL`.
- **Polityki zapisu czekają gotowe.** `schedule_days` i `schedule_day_horses` mają komplet czterech polityk z warunkiem `stable_id = (select private.current_stable_id())`, `horses` też. Slice nie potrzebuje żadnej zmiany w RLS.
- **Wzorce ustalone przez trzy poprzednie slice'y**: `zod` w endpointach z polskimi komunikatami, formularze progresywne (GET do filtrowania, POST do zapisu), logika w `src/lib/<obszar>/` z testami Vitest, strony `.astro` tylko renderują, guardraile bazy dowodzone skryptem w `supabase/tests/`.

## Desired End State

1. Zawężenie zakresu godzin poniżej istniejącego aktywnego zapisu **nie przechodzi** — ani z aplikacji, ani z panelu Supabase, ani z `psql`.
2. Zmiana daty dnia mającego aktywne zapisy **nie przechodzi**.
3. Ośrodek może dodać konia do stada, zobaczyć listę swoich koni i wycofać konia ze służby, nie tracąc historii.
4. Ośrodek wybiera datę, ustawia zakres godzin i zaznacza konie pracujące — w jednym formularzu, z podpowiedzią z ostatnio ułożonego dnia.
5. Kolizja z zapisami kończy się komunikatem mówiącym, **co** blokuje i **ilu** zapisów dotyczy, a nie surowym błędem bazy.
6. `npm test`, `npm run lint`, `npm run build` przechodzą; skrypty w `supabase/tests/` przechodzą.

### Key Discoveries:

- **Decyzja produktowa ma trzy przypadki, nie jeden.** Odpięcie konia od dnia jest chronione (`23503` z F-01), usunięcie dnia jest chronione (kaskada → `RESTRICT`), a zawężenie godzin i zmiana daty **nie są**. Slice łata dwa ostatnie.
- **Trigger potrzebuje własnego kodu błędu.** W obiegu są już `23505` (dubel konia w slocie) i `23514` (godzina poza zakresem, z triggera na `bookings`). Konflikt grafiku musi być odróżnialny od obu, bo prowadzi do innego komunikatu i innej czynności ośrodka.
- **Kolejność operacji przy zapisie jest krytyczna** — patrz „Critical Implementation Details".
- **Konwencja przedziału półotwartego** `[open_hour, close_hour)` z F-01: 10–16 znaczy sloty 10…15. Formularz i komunikaty muszą ją odzwierciedlać, bo S-04 na niej policzy wolne sloty.
- **Konto ośrodka zawsze ma stadninę** (wymuszenie z S-01, `src/middleware.ts`), więc żaden z tych ekranów nie musi obsługiwać przypadku „brak stadniny".

## What We're NOT Doing

- **Bez listy zapisów dnia** (godzina–koń–jeździec) — to FR-005, czyli S-05. Komunikat konfliktu podaje liczbę kolidujących zapisów, ale nie ich treść.
- **Bez odwoływania zapisów przez ośrodek** — PRD rozstrzyga wprost: FR-009 daje to prawo wyłącznie jeźdźcowi.
- **Bez wolnych slotów i rezerwacji** — to S-04; ten slice dostarcza wyłącznie dane wejściowe reguły alokacji.
- **Bez kopiowania grafiku na wiele dni naraz** ani szablonów tygodniowych — podpowiedź z ostatniego dnia załatwia powtarzalność bez nowego pojęcia w modelu.
- **Bez edycji danych konia po dodaniu** (zmiana imienia, notatki) — poza wycofaniem flagą.
- **Bez usuwania konia ze stada** — `RESTRICT` od zapisów i tak by to zablokował dla każdego konia, który kiedykolwiek pracował.
- **Bez układania grafiku na przeszłe daty** — przeszłe dni tylko do odczytu.
- **Bez zmian w RLS i w istniejących tabelach** — migracja dokłada wyłącznie funkcję i trigger.

## Implementation Approach

Kolejność faz jest wymuszona zależnościami, nie wygodą. Trigger idzie pierwszy, bo dopóki go nie ma, każdy nowy ekran edycji grafiku może zdążyć osierocić zapisy — a to jest dokładnie ta klasa błędu, którą decyzja produktowa miała wyeliminować. Stado idzie drugie, bo grafik nie ma z czego wybierać bez koni. Grafik zamyka slice.

Guardrail żyje w bazie, spójnie z F-01: aplikacja go nie powiela, tylko **tłumaczy** kod błędu na komunikat po polsku. Dzięki temu reguła obowiązuje niezależnie od tego, którędy dane wchodzą.

## Critical Implementation Details

**Kolejność operacji przy zapisie grafiku.** Podmiana zestawu koni to usunięcia i wstawienia. Usunięcia mogą się nie udać (`23503`, gdy koń ma zapis w tym dniu), wstawienia praktycznie nie. Wykonaj **najpierw usunięcia, potem wstawienia** — przy odwrotnej kolejności nieudane usunięcie zostawia dzień z dołożonymi końmi i nieusuniętymi starymi, czyli w stanie, którego ośrodek nie zamawiał. Przy właściwej kolejności nieudane usunięcie kończy operację, zanim cokolwiek się zmieni.

**Zakres wyzwalania triggera.** Trigger musi reagować na `UPDATE OF open_hour, close_hour, day`, a nie na każdy `UPDATE` — inaczej odpali się przy dotknięciu `updated_at` przez istniejący `schedule_days_set_updated_at` i będzie wykonywał zapytanie o zapisy przy każdej zmianie czegokolwiek.

**Rozszerzanie godzin musi przechodzić.** Reguła blokuje wyłącznie zmiany, po których istniejący aktywny zapis wypadłby poza `[open_hour, close_hour)`. Rozciągnięcie dnia z 10–16 na 8–20 nie koliduje z niczym i ma się udać — łatwo o trigger, który blokuje każdą zmianę godzin przy jakichkolwiek zapisach.

## Phase 1: Migracja — trigger chroniący zapisy

### Overview

Guardrail wchodzi do bazy, zanim powstanie interfejs, który mógłby go naruszyć. Po tej fazie decyzja z Otwartego pytania #2 jest egzekwowana w całości, niezależnie od tego, którędy ktoś próbuje zmienić grafik.

### Changes Required:

#### 1. Migracja z triggerem

**File**: `supabase/migrations/<timestamp>_protect_bookings_on_schedule_change.sql`

**Intent**: Odrzucać zmiany `schedule_days`, po których istniejący aktywny zapis wypadłby poza zakres godzin albo trafiłby na inną datę. Domyka połowę decyzji produktowej, której dziś nie pilnuje nic.

**Contract**: Funkcja `public.enforce_schedule_change_keeps_bookings()` + trigger `before update of open_hour, close_hour, day on public.schedule_days`. Dwa rozróżnialne przypadki:

- **Godziny** — odrzuć, gdy istnieje aktywny zapis z `hour < NEW.open_hour` lub `hour >= NEW.close_hour`. Rozszerzenie zakresu przechodzi.
- **Data** — odrzuć każdą zmianę `day`, gdy dzień ma choć jeden aktywny zapis.

Oba przypadki podnoszą wyjątek z **własnym kodem błędu**, różnym od `23505` i `23514` używanych już w projekcie (np. `SB001`), a komunikat zawiera liczbę kolidujących zapisów — warstwa aplikacji ma z czego zbudować treść dla użytkownika. Funkcja `security definer` z `set search_path = ''`, jak pozostałe z F-01.

#### 2. Dowód guardraila

**File**: `supabase/tests/schedule_change_guardrails.sql`

**Intent**: Przybić wszystkie cztery przypadki reguły „zapisy nie giną ani nie wędrują" — dwa nowe i dwa odziedziczone po F-01 — żeby regresja w którymkolwiek wyszła od razu.

**Contract**: Skrypt w konwencji `supabase/tests/rls_isolation.sql` (transakcja + `rollback`, asercje przez `raise exception`, komunikaty PASS/FAIL). Przypadki: zawężenie godzin pod zapisem odrzucone; **rozszerzenie godzin przechodzi**; zmiana daty dnia z zapisami odrzucona; zmiana daty dnia BEZ zapisów przechodzi; odpięcie konia z zapisem odrzucone (`23503`); usunięcie całego dnia z zapisami odrzucone.

#### 3. Typy bazy

**File**: `src/db/database.types.ts`

**Intent**: Odświeżyć wygenerowane typy po migracji.

**Contract**: `npm run db:types` — plik generowany, nie edytowany ręcznie.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` stosuje wszystkie migracje bez błędów
- `supabase/tests/schedule_change_guardrails.sql` przechodzi bez wyjątku
- `supabase/tests/rls_isolation.sql` nadal przechodzi (brak regresji w politykach)
- `npm test` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Brak — faza nie dostarcza niczego widocznego dla użytkownika

**Implementation Note**: Faza bez weryfikacji ręcznej — po przejściu automatycznej przejdź od razu do rytuału commita.

---

## Phase 2: Stado — lista koni i dodawanie

### Overview

Ośrodek dostaje stado, z którego grafik będzie wybierał. Bez tej fazy FR-004 nie ma jak zadziałać.

### Changes Required:

#### 1. Walidacja konia

**File**: `src/lib/stables/schemas.ts`

**Intent**: Schemat `zod` dla formularza dodania konia, z komunikatami po polsku, spójny ze wzorcem z `src/lib/auth/schemas.ts`.

**Contract**: Imię po przycięciu białych znaków niepuste (odpowiednik `horses_name_not_blank` z F-01), notatka opcjonalna. Wyprowadzony typ wejścia.

#### 2. Zapytania o konie

**File**: `src/lib/stables/queries.ts`

**Intent**: Dołożyć odczyt stada obok istniejących funkcji katalogu z S-03 — jedno miejsce, które wie, jak pobrać konie stadniny.

**Contract**: Funkcja zwracająca konie zalogowanego ośrodka posortowane po imieniu, z rozróżnieniem aktywnych i wycofanych. Filtr po stadninie nie jest potrzebny w zapytaniu — polityka odczytu `horses` jest otwarta dla zalogowanych, więc **musi** być jawny warunek po `stable_id`, inaczej ośrodek zobaczy cudze konie (ta sama pułapka co w `/osrodek/index.astro` z S-01).

#### 3. Ekran stada

**File**: `src/pages/osrodek/konie.astro`, `src/components/stables/HorseForm.tsx`

**Intent**: Lista koni stadniny z formularzem dodania i możliwością wycofania konia ze służby.

**Contract**: Strona pod chronionym prefiksem `/osrodek`. Lista rozdziela konie aktywne od wycofanych; przy pustym stadzie stan pusty tłumaczący, że bez koni nie da się ułożyć grafiku. Formularz progresywny (`<form method="POST">`), walidacja klienta powtarzająca komunikaty schematu słowo w słowo. Wycofanie i przywrócenie jako osobne formularze POST, bez JavaScriptu.

#### 4. Endpointy stada

**File**: `src/pages/api/horses/create.ts`, `src/pages/api/horses/toggle-active.ts`

**Intent**: Przyjąć dodanie konia i przełączenie flagi `active`, w imieniu zalogowanego ośrodka.

**Contract**: Zapis klientem z sesją użytkownika — polityki `horses_insert_own_stable` i `horses_update_own_stable` wymagają `stable_id = private.current_stable_id()`, więc baza odrzuci każdą inną drogę. `stable_id` brany z `private.current_stable_id()` przez odczyt stadniny właściciela, nie z formularza. Po sukcesie powrót na `/osrodek/konie`.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi (z testami schematu konia)
- `npm run lint` przechodzi
- `npm run build` przechodzi
- Dodanie konia tworzy wiersz w `horses` z `stable_id` zalogowanego ośrodka
- Koń z pustym imieniem jest odrzucony przez walidację i nie tworzy wiersza
- Konto ośrodka nie widzi na liście koni innej stadniny

#### Manual Verification:

- Wycofany koń jest wyraźnie odróżniony na liście i da się go przywrócić
- Pusta lista tłumaczy, po co dodać konia
- Dodanie konia działa przy wyłączonym JavaScripcie

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie ręcznego sprawdzenia.

---

## Phase 3: Grafik dnia

### Overview

Sedno slice'a: ośrodek wybiera datę, ustawia zakres godzin i zaznacza konie pracujące. Tu też ląduje tłumaczenie kodów błędu z fazy 1 na komunikaty.

### Changes Required:

#### 1. Walidacja i logika dnia

**File**: `src/lib/schedule/schema.ts`, `src/lib/schedule/dates.ts`

**Intent**: Schemat formularza grafiku oraz czysta logika dat: parsowanie parametru `dzien`, odrzucanie dat przeszłych, wartość domyślna.

**Contract**: Schemat waliduje datę, `open_hour` i `close_hour` (zakres 0–24, `close_hour > open_hour`, odpowiednik ograniczeń z F-01) oraz listę identyfikatorów koni. Funkcja parsująca datę przyjmuje `RRRR-MM-DD`, odrzuca format niepoprawny i daty wcześniejsze niż dziś, zwracając `null`; osobna funkcja podaje datę domyślną (jutro). Porównanie z „dziś" liczone w strefie lokalnej, nie w UTC — inaczej po 22:00 czasu polskiego dzisiejsza data wypadnie jako wczorajsza.

#### 2. Zapytania grafiku

**File**: `src/lib/schedule/queries.ts`

**Intent**: Odczyt dnia wraz z przypisanymi końmi, odczyt ostatnio ułożonego dnia (do podpowiedzi) oraz zapis całego dnia.

**Contract**: Trzy funkcje — pobranie dnia po (stadnina, data) z listą `horse_id`; pobranie ostatniego dnia stadniny wraz z jego godzinami i końmi; zapis dnia. Zapis: wstaw albo zaktualizuj `schedule_days` (klucz `unique (stable_id, day)`), następnie **usuń odpięte konie, dopiero potem wstaw dopięte** — patrz „Critical Implementation Details". Błędy bazy propagowane wyjątkiem, tłumaczone w endpoincie.

#### 3. Tłumaczenie błędów bazy

**File**: `src/lib/schedule/errors.ts`

**Intent**: Zamienić kody błędu na komunikaty po polsku mówiące, co blokuje zmianę. To jedyne miejsce, w którym aplikacja interpretuje guardraile bazy.

**Contract**: Mapowanie trzech kodów na komunikaty: własny kod z fazy 1 (konflikt godzin albo daty — treść bierze liczbę zapisów z komunikatu bazy), `23503` (odpięcie konia mającego zapis w tym dniu), oraz wariant domyślny dla nierozpoznanego błędu. Funkcja czysta, pokryta testami.

#### 4. Ekran grafiku

**File**: `src/pages/osrodek/grafik.astro`, `src/components/schedule/ScheduleDayForm.tsx`

**Intent**: Ekran wyboru daty i edycji dnia — zakres godzin plus zaznaczenie koni pracujących, w jednym formularzu.

**Contract**: Data w parametrze `dzien` (formularz GET, wzorzec z filtru S-03), domyślnie jutro; nawigacja o dzień w tył i w przód. Dzień przeszły renderuje się tylko do odczytu. Nowy dzień dostaje pola wstępnie wypełnione wartościami ostatnio ułożonego dnia; gdy stadnina nie ułożyła jeszcze żadnego, pola są puste. Nagłówek nazywa konwencję wprost („10–16 oznacza jazdy od 10:00 do 15:00"). Wybór koni to natywne pola wyboru z listy aktywnych koni stadniny; wycofane konie już przypisane do dnia pozostają widoczne i zaznaczone. Przy pustym stadzie zamiast formularza odnośnik do `/osrodek/konie`.

#### 5. Endpoint zapisu

**File**: `src/pages/api/schedule/save.ts`

**Intent**: Przyjąć formularz, zwalidować i zapisać dzień, a błąd guardraila zamienić na komunikat.

**Contract**: Walidacja schematem z punktu 1; odrzucenie daty przeszłej po stronie serwera, nie tylko w UI. Po sukcesie powrót na `/osrodek/grafik?dzien=…` z potwierdzeniem; po błędzie — powrót na tę samą datę z komunikatem z punktu 3 w parametrze `error`.

#### 6. Nawigacja z panelu ośrodka

**File**: `src/pages/osrodek/index.astro`

**Intent**: Podpiąć oba nowe ekrany do panelu, żeby dało się do nich trafić.

**Contract**: Odnośniki do `/osrodek/grafik` i `/osrodek/konie` obok nazwy stadniny. Bez przebudowy panelu.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi (z testami dat i tłumaczenia błędów)
- `npm run lint` przechodzi
- `npm run build` przechodzi
- Zapis nowego dnia tworzy wiersz w `schedule_days` i komplet wierszy w `schedule_day_horses`
- Ponowny zapis tego samego dnia ze zmienionym zestawem koni podmienia przypisania, nie duplikuje ich
- Próba zawężenia godzin pod istniejącym zapisem kończy się komunikatem, a dane w bazie pozostają bez zmian
- Próba odpięcia konia mającego zapis w tym dniu kończy się komunikatem, innym niż komunikat o godzinach
- Data przeszła jest odrzucana przez endpoint, nawet gdy ominie się UI
- `supabase/tests/schedule_change_guardrails.sql` nadal przechodzi

#### Manual Verification:

- Ułożenie dnia od zera działa: wybór daty, godziny, zaznaczenie koni, zapis
- Nowy dzień ma podpowiedziane godziny i konie z ostatnio ułożonego dnia
- Rozszerzenie zakresu godzin przy istniejących zapisach przechodzi bez przeszkód
- Dzień przeszły jest widoczny, ale nie da się go edytować
- Ośrodek bez koni widzi odnośnik do dodania konia zamiast pustego formularza
- Formularz działa przy wyłączonym JavaScripcie

**Implementation Note**: To ostatnia faza — po niej zmiana jest gotowa do przeglądu.

---

## Testing Strategy

### Unit Tests:

Vitest, na czystej logice:

- **Daty**: poprawny `RRRR-MM-DD` przechodzi; format niepoprawny odpada; data wczorajsza odpada; dzisiejsza przechodzi; wartość domyślna to jutro; porównanie liczone lokalnie, nie w UTC.
- **Schemat grafiku**: `close_hour > open_hour`; wartości spoza 0–24 odpadają; pusta lista koni jest dozwolona (dzień bez koni to legalny stan).
- **Schemat konia**: imię z samych spacji odpada.
- **Tłumaczenie błędów**: każdy z trzech kodów daje inny komunikat; nierozpoznany kod daje wariant domyślny.

### Integration Tests:

`supabase/tests/schedule_change_guardrails.sql` — sześć asercji pokrywających całą regułę „zapisy nie giną ani nie wędrują", w tym dwa przypadki odziedziczone po F-01. Uruchamiany ręcznie przeciw lokalnej bazie; nie pobiegnie w CI, bo workflow nie stawia bazy.

`supabase/tests/rls_isolation.sql` z F-01 jako test regresji — slice dokłada zapisy do dwóch kolejnych tabel domenowych.

### Manual Testing Steps:

1. `npx supabase start`, `npx supabase db reset`, `npm run dev`.
2. Zalogować się jako `osrodek.debem@example.com` (hasło `sekret123`).
3. `/osrodek/konie` — dodać konia, wycofać go, przywrócić.
4. `/osrodek/grafik` — ułożyć jutrzejszy dzień: godziny i konie; zapisać.
5. Przejść na kolejny dzień — sprawdzić, czy pola są podpowiedziane z poprzedniego.
6. Wrócić na dzień z zapisem z seeda (Bella, 11:00) i spróbować zawęzić godziny do 10–11 — oczekiwany komunikat, brak zmian w bazie.
7. Na tym samym dniu rozszerzyć godziny do 8–20 — ma przejść.
8. Spróbować odpiąć Bellę od tego dnia — oczekiwany inny komunikat.
9. Wejść na `/osrodek/grafik?dzien=` z datą wczorajszą — oczekiwany tryb tylko do odczytu.
10. Wyłączyć JavaScript i powtórzyć krok 4.

## Performance Considerations

Ekran grafiku wykonuje trzy zapytania (dzień z końmi, stado, ostatnio ułożony dzień) — wszystkie trafiają w indeksy z F-01 (`schedule_days(stable_id, day)` unikalny, `horses(stable_id)`, `schedule_day_horses` po kluczu głównym). Trigger dokłada jedno zapytanie o zapisy przy każdej zmianie godzin lub daty, ograniczone do jednego dnia jednej stadniny; nie odpala się przy zmianie innych kolumn. Przy `data_volume: small` i `qps: low` z PRD żadne z tego nie jest odczuwalne.

## Migration Notes

Migracja dokłada wyłącznie funkcję i trigger — nie rusza tabel, kolumn ani polityk, więc istniejące dane pozostają nietknięte. Uwaga: po jej zastosowaniu **dane, które dziś są niespójne, zostaną zamrożone** — jeśli w bazie istnieje już zapis poza zakresem godzin swojego dnia (możliwy do wprowadzenia przed tą migracją), trigger nie pozwoli tego dnia poprawić bez wcześniejszego odwołania zapisu. W lokalnej bazie i na produkcji takich danych nie ma, bo grafiku nie dało się dotąd edytować z aplikacji.

Wycofanie: `drop trigger` + `drop function` w nowej migracji. Reszta slice'a to kod, więc cofnięcie commitów wystarczy.

## References

- Roadmapa S-02: `context/foundation/roadmap.md:81-92`
- Wymagania: `context/foundation/prd.md` — US-02, FR-003, FR-004, §Open Questions #2 (rozstrzygnięte 2026-08-11)
- Model danych i guardraile: `supabase/migrations/20260810090100_schedule_and_bookings.sql`
- Wzorzec dowodu guardraila: `supabase/tests/rls_isolation.sql`
- Wzorce aplikacji: `context/changes/role-aware-auth/plan.md`, `context/changes/stable-directory/plan.md`, `src/lib/auth/`, `src/lib/stables/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migracja — trigger chroniący zapisy

#### Automated

- [x] 1.1 `npx supabase db reset` stosuje wszystkie migracje bez błędów — 08e9962
- [x] 1.2 `supabase/tests/schedule_change_guardrails.sql` przechodzi bez wyjątku — 08e9962
- [x] 1.3 `supabase/tests/rls_isolation.sql` nadal przechodzi — 08e9962
- [x] 1.4 `npm test` przechodzi — 08e9962
- [x] 1.5 `npm run lint` przechodzi — 08e9962
- [x] 1.6 `npm run build` przechodzi — 08e9962

### Phase 2: Stado — lista koni i dodawanie

#### Automated

- [x] 2.1 `npm test` przechodzi
- [x] 2.2 `npm run lint` przechodzi
- [x] 2.3 `npm run build` przechodzi
- [x] 2.4 Dodanie konia tworzy wiersz w `horses` z `stable_id` zalogowanego ośrodka
- [x] 2.5 Koń z pustym imieniem jest odrzucony i nie tworzy wiersza
- [x] 2.6 Konto ośrodka nie widzi na liście koni innej stadniny

#### Manual

- [x] 2.7 Wycofany koń jest odróżniony na liście i da się go przywrócić
- [x] 2.8 Pusta lista tłumaczy, po co dodać konia
- [x] 2.9 Dodanie konia działa przy wyłączonym JavaScripcie

### Phase 3: Grafik dnia

#### Automated

- [ ] 3.1 `npm test` przechodzi
- [ ] 3.2 `npm run lint` przechodzi
- [ ] 3.3 `npm run build` przechodzi
- [ ] 3.4 Zapis nowego dnia tworzy wiersz w `schedule_days` i wiersze w `schedule_day_horses`
- [ ] 3.5 Ponowny zapis podmienia przypisania koni, nie duplikuje ich
- [ ] 3.6 Zawężenie godzin pod istniejącym zapisem kończy się komunikatem, dane bez zmian
- [ ] 3.7 Odpięcie konia z zapisem daje komunikat inny niż konflikt godzin
- [ ] 3.8 Data przeszła jest odrzucana przez endpoint
- [ ] 3.9 `supabase/tests/schedule_change_guardrails.sql` nadal przechodzi

#### Manual

- [ ] 3.10 Ułożenie dnia od zera działa end-to-end
- [ ] 3.11 Nowy dzień ma podpowiedziane godziny i konie z ostatniego dnia
- [ ] 3.12 Rozszerzenie godzin przy istniejących zapisach przechodzi
- [ ] 3.13 Dzień przeszły jest tylko do odczytu
- [ ] 3.14 Ośrodek bez koni widzi odnośnik do dodania konia
- [ ] 3.15 Formularz działa przy wyłączonym JavaScripcie
