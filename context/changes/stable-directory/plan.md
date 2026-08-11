# S-03 — Katalog ośrodków z filtrowaniem — Implementation Plan

## Overview

`/jezdziec` przestaje być pustym szkieletem i staje się katalogiem ośrodków: lista kart z nazwą, miejscowością i skróconym opisem, nad nią jedno pole filtrujące po nazwie i miejscowości. Każdy ośrodek dostaje własną stronę, na której S-04 dołoży wolne sloty i zapis na jazdę.

Zero zmian w bazie. F-01 dodało `stables.city` dokładnie pod ten filtr, a polityka `stables_select_authenticated` (`using (true)`) już wpuszcza każdego zalogowanego — katalog jest jedynym slice'em, który nie musi niczego negocjować z RLS.

## Current State Analysis

- **`/jezdziec` to szkielet.** `src/pages/jezdziec/index.astro` renderuje nagłówek i powitanie; komentarz w pliku mówi wprost, że katalog dołoży S-03. Trasa jest już chroniona mapą z `src/lib/auth/roles.ts` — jeździec ma tu wstęp, ośrodek jest przekierowywany do siebie.
- **Tabela jest gotowa.** `stables` ma `id`, `owner_id`, `name`, `city`, `description`, `created_at`. Trzy z nich są widoczne dla użytkownika. Odczyt otwarty dla roli `authenticated`, więc katalog nie wymaga żadnej zmiany w politykach.
- **Brak indeksu na `city` i `name`.** Filtr będzie skanował tabelę. Przy `data_volume: small` z PRD to bez znaczenia — indeks pod `ilike` i tak wymagałby rozszerzenia `pg_trgm`, czyli migracji.
- **Produkcja ma zero ośrodków.** Schemat jest wypchnięty, ale `seed.sql` jest wyłącznie lokalny. Stan „nie ma jeszcze żadnych ośrodków" to nie przypadek brzegowy, tylko domyślny widok każdego nowego jeźdźca na wdrożonej wersji.
- **Wzorce ustalone przez S-01.** Formularze są progresywne (`<form method="POST">` albo GET, React tylko do wygody), wejście walidowane `zod` (`src/lib/auth/schemas.ts`), czysta logika pokryta Vitestem i wpięta do CI, wszystkie teksty po polsku.
- **Z shadcn/ui jest tylko `button`.** Karty i pole tekstowe powstają jako zwykłe elementy w stylu reszty aplikacji — `FormField` z `src/components/auth/` jest zbudowany pod stan Reacta, więc do prostego pola GET się nie nadaje.

## Desired End State

1. Jeździec po zalogowaniu widzi listę ośrodków zamiast pustego powitania.
2. Wpisanie frazy i zatwierdzenie zawęża listę po nazwie **lub** miejscowości; fraza zostaje w adresie, więc odświeżenie i udostępnienie linku działa, a całość działa bez JavaScriptu.
3. Pusta lista mówi, **dlaczego** jest pusta: inaczej gdy w systemie nie ma ani jednego ośrodka, inaczej gdy filtr nic nie znalazł (z możliwością wyczyszczenia).
4. Kliknięcie karty prowadzi na `/jezdziec/osrodki/[id]` z danymi ośrodka; nieistniejące lub niepoprawne `id` daje czytelne „nie znaleziono", nie błąd.
5. `npm test`, `npm run lint` i `npm run build` przechodzą.

### Key Discoveries:

- **Outcome S-03 z roadmapy ma dwa człony**: „przegląda i filtruje listę ośrodków" **oraz** „wybiera ośrodek, do którego chce się zapisać". Drugi człon jest powodem, dla którego powstaje strona ośrodka — bez niej slice realizuje tylko połowę swojego opisu.
- **`ilike` nie ignoruje diakrytyków.** Kto wpisze „krakow", nie znajdzie „Kraków". Naprawa wymaga rozszerzenia `unaccent` i indeksu wyrażeniowego, czyli migracji — świadomie poza tym slice'em (patrz „What We're NOT Doing").
- **Fraza użytkownika trafia do wzorca `LIKE`**, więc `%` i `_` mają w niej znaczenie składniowe. Bez ekranowania wpisanie `%` wyświetla wszystko, a `_` dopasowuje dowolny znak.
- **Klucze `stables` to `bigint`.** Segment trasy `[id]` musi zostać zwalidowany jako dodatnia liczba całkowita, zanim trafi do zapytania.
- **Polityka odczytu jest otwarta**, więc zapytanie nie potrzebuje filtra po właścicielu — inaczej niż w `/osrodek`, gdzie brak `eq("owner_id", …)` pokazałby cudze stadniny.

## What We're NOT Doing

- **Żadnej migracji ani zmiany w RLS** — tabela i polityki z F-01 wystarczają.
- **Bez obsługi braku polskich znaków w filtrze** — „krakow" nie znajdzie „Kraków". Ścieżka naprawy jest znana (rozszerzenie `unaccent` + indeks wyrażeniowy na `unaccent(name)` i `unaccent(city)`), ale to migracja, a ten slice bazy nie rusza.
- **Bez slotów, grafiku i zapisu na jazdę** — strona ośrodka powstaje jako miejsce, do którego S-04 to dołoży.
- **Bez liczby koni i informacji o dostępności na karcie** — liczba koni myli (dziesięć koni bez grafiku wygląda lepiej, niż jest), a sygnał dostępności to logika S-04.
- **Bez sortowania wybieranego przez użytkownika** — lista idzie alfabetycznie po nazwie i tyle.
- **Bez stronicowania** — przy `data_volume: small` z PRD nie ma czego stronicować; gdyby lista urosła, to osobna zmiana.
- **Bez filtrowania po opisie** — opis bywa długi i wprowadzałby przypadkowe trafienia; FR-006 mówi o wyborze ośrodka, nie o wyszukiwarce pełnotekstowej.
- **Bez zmian w `Topbar`** — nawigacja z S-01 jest wystarczająca.

## Implementation Approach

Filtr jest formularzem GET: wartość ląduje w adresie, serwer zwraca gotową listę. To ten sam wzorzec progresywny, który mają formularze auth — działa bez JavaScriptu, adres da się odświeżyć i wysłać, a rosnąca liczba ośrodków niczego nie psuje. Cała logika przygotowania frazy (przycięcie, odrzucenie pustej, ekranowanie znaków wzorca) siedzi w jednym module pokrytym testami, żeby nie rozlać się po stronie `.astro`.

Podział na dwie fazy odpowiada dwóm członom outcome'u: faza 1 dowozi „przegląda i filtruje", faza 2 — „wybiera ośrodek". Każda kończy się czymś, co widać na ekranie.

## Critical Implementation Details

**Ekranowanie frazy przed `ilike`.** W `LIKE`/`ILIKE` znaki `%` i `_` są operatorami wzorca, a `\` je ekranuje. Fraza od użytkownika musi przejść przez zamianę `\` → `\\`, `%` → `\%`, `_` → `\_` **w tej kolejności** — odwrotna kolejność podwoiłaby ukośniki dodane w krokach późniejszych. Dopiero tak przygotowany tekst wolno wstawić do wzorca `%fraza%`.

**Filtr po dwóch kolumnach naraz.** Warunek „nazwa **lub** miejscowość" w kliencie Supabase wyraża się jednym wywołaniem `or()` z listą warunków rozdzieloną przecinkiem — nie dwoma osobnymi wywołaniami `ilike`, bo te złożyłyby się w koniunkcję i fraza musiałaby pasować do obu pól jednocześnie.

## Phase 1: Katalog z filtrem

### Overview

`/jezdziec` staje się listą ośrodków z polem filtrującym. Po tej fazie jeździec widzi to, po co przyszedł, a pusta lista tłumaczy się sama.

### Changes Required:

#### 1. Przygotowanie frazy wyszukiwania

**File**: `src/lib/stables/search.ts`

**Intent**: Zamienić surowy parametr z adresu na coś, co bezpiecznie wchodzi do zapytania: przyciąć białe znaki, potraktować pustą frazę jako brak filtra, obciąć nadmierną długość i wyekranować znaki wzorca.

**Contract**: Funkcja przyjmująca `string | null` i zwracająca frazę gotową do użycia albo `null`, gdy filtra nie ma. Górny limit długości (np. 100 znaków) chroni przed absurdalnie długim parametrem w adresie.

Fraza przechodzi przez **dwie** warstwy składni i obie trzeba obsłużyć, w tej kolejności:

1. **Wyrażenie filtra PostgREST** — `or()` skleja warunki przecinkami, grupuje nawiasami, a cudzysłów otwiera wartość cytowaną. Te znaki są **usuwane**: w nazwie stadniny ani miejscowości nie niosą treści, a przepuszczone rozbiłyby warunek z punktu 2.
2. **Wzorzec `LIKE`** — `%`, `_` i `\` są **ekranowane**, żeby użytkownik nie miał dostępu do składni wzorca. Kolejność ekranowania jest krytyczna — patrz „Critical Implementation Details".

#### 2. Zapytanie o ośrodki

**File**: `src/lib/stables/queries.ts`

**Intent**: Jedno miejsce, które wie, jak pobrać listę ośrodków z opcjonalnym filtrem — żeby strona `.astro` zajmowała się wyłącznie widokiem.

**Contract**: Funkcja przyjmująca klienta Supabase i przygotowaną frazę (albo `null`), zwracająca listę ośrodków posortowaną alfabetycznie po nazwie. Filtr obejmuje `name` **i** `city` w alternatywie, wyrażonej jednym warunkiem `or` — patrz „Critical Implementation Details". Zwracane kolumny: `id`, `name`, `city`, `description`.

#### 3. Testy przygotowania frazy

**File**: `src/lib/stables/search.test.ts`

**Intent**: Przybić zachowanie funkcji, która stoi między wejściem użytkownika a zapytaniem do bazy.

**Contract**: Fraza pusta i złożona z samych spacji dają `null`; białe znaki z brzegów są przycinane; `%`, `_` i `\` są ekranowane, a wynik nie zawiera nieuciekniętych operatorów wzorca; fraza dłuższa niż limit jest skracana; zwykła fraza przechodzi bez zmian.

#### 4. Karta ośrodka

**File**: `src/components/stables/StableCard.astro`

**Intent**: Powtarzalny kafelek z nazwą, miejscowością i skróconym opisem, w stylu spójnym z panelami z S-01.

**Contract**: Komponent Astro (bez interaktywności, więc bez React) przyjmujący ośrodek jako właściwość. Opis skracany do jednego akapitu; brak opisu nie zostawia pustej dziury w układzie. W fazie 1 karta nie jest odnośnikiem — staje się nim w fazie 2.

#### 5. Formularz filtra

**File**: `src/components/stables/StableFilter.astro`

**Intent**: Pole tekstowe z przyciskiem, wysyłane metodą GET, z zachowaną bieżącą frazą, żeby po odświeżeniu użytkownik widział, czego szukał.

**Contract**: `<form method="GET">` kierujący na własną trasę, pole o ustalonej nazwie (np. `q`) z `value` równym bieżącej frazie. Gdy filtr jest aktywny, obok pojawia się odnośnik czyszczący (link na trasę bez parametru) — działa bez JavaScriptu.

#### 6. Strona katalogu

**File**: `src/pages/jezdziec/index.astro`

**Intent**: Zastąpić szkielet listą ośrodków: filtr, karty i dwa różne stany puste.

**Contract**: Odczytuje parametr z `Astro.url.searchParams`, przepuszcza przez funkcję z punktu 1, woła zapytanie z punktu 2. Rozróżnia dwa przypadki pustej listy: **brak filtra i brak wyników** → komunikat, że w systemie nie ma jeszcze ośrodków; **filtr aktywny i brak wyników** → komunikat o braku dopasowań z odnośnikiem czyszczącym. Nagłówek strony i tytuł dokumentu po polsku.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi (z nowymi testami przygotowania frazy)
- `npm run lint` przechodzi
- `npm run build` przechodzi
- Katalog bez filtra zwraca oba ośrodki z seeda
- Filtr `Debem` zwraca wyłącznie „Stadnina Pod Debem"; filtr `Wieliczka` wyłącznie „Stajnia Nad Rzeka"
- Filtr `%` nie zwraca wszystkiego (znak jest ekranowany, nie traktowany jako wzorzec)

#### Manual Verification:

- Filtr działa przy wyłączonym JavaScripcie, a fraza zostaje w adresie po odświeżeniu
- Komunikat przy braku dopasowań różni się od komunikatu przy pustym systemie
- Konto ośrodka wchodzące na `/jezdziec` nadal jest przekierowywane do siebie (brak regresji po S-01)

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie ręcznego sprawdzenia.

---

## Phase 2: Strona ośrodka

### Overview

Domknięcie drugiego członu outcome'u: jeździec może wybrać ośrodek i wejść na jego stronę. S-04 dołoży tam sloty i zapis, nie ruszając katalogu.

### Changes Required:

#### 1. Pobranie pojedynczego ośrodka

**File**: `src/lib/stables/queries.ts`

**Intent**: Dołożyć funkcję pobierającą jeden ośrodek po identyfikatorze, obok istniejącej funkcji listy.

**Contract**: Przyjmuje klienta i identyfikator, zwraca ośrodek albo `null`, gdy nie istnieje. Brak wiersza to normalny wynik, nie błąd — strona zamienia go na stan „nie znaleziono".

#### 2. Walidacja segmentu trasy

**File**: `src/lib/stables/search.ts`

**Intent**: Zamienić segment adresu na identyfikator albo odrzucić go, zanim trafi do zapytania — klucze są typu `bigint`, więc `/jezdziec/osrodki/abc` nie może wywołać błędu bazy.

**Contract**: Funkcja przyjmująca `string | undefined` i zwracająca dodatnią liczbę całkowitą albo `null`. Odrzuca wartości niebędące liczbą, ujemne, zero, ułamkowe i zapisane wykładniczo.

#### 3. Testy walidacji identyfikatora

**File**: `src/lib/stables/search.test.ts`

**Intent**: Przybić zachowanie strażnika trasy — to jedyne miejsce chroniące zapytanie przed śmieciem z adresu.

**Contract**: Wartości `"1"` i `"42"` przechodzą; `undefined`, `""`, `"abc"`, `"0"`, `"-3"`, `"1.5"` i `"1e3"` dają `null`.

#### 4. Strona ośrodka

**File**: `src/pages/jezdziec/osrodki/[id].astro`

**Intent**: Widok pojedynczego ośrodka z nazwą, miejscowością i pełnym opisem oraz powrotem do katalogu. To jest trasa, którą S-04 wypełni slotami.

**Contract**: Waliduje segment funkcją z punktu 2, pobiera ośrodek funkcją z punktu 1. Niepoprawny identyfikator i brak wiersza dają ten sam stan „nie znaleziono" z odnośnikiem do katalogu — bez rozróżniania, bo dla użytkownika to ta sama sytuacja. Komentarz w pliku wskazuje, że sloty dokłada S-04.

#### 5. Karta jako odnośnik

**File**: `src/components/stables/StableCard.astro`

**Intent**: Zamienić kafelek w odnośnik do strony ośrodka, żeby lista prowadziła gdziekolwiek.

**Contract**: Cała karta staje się odnośnikiem na `/jezdziec/osrodki/<id>`. Zachowany stan skupienia i widoczna obwódka przy nawigacji klawiaturą — karta jest teraz elementem interaktywnym.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi (z testami walidacji identyfikatora)
- `npm run lint` przechodzi
- `npm run build` przechodzi
- Strona istniejącego ośrodka zwraca 200 i zawiera jego nazwę
- `/jezdziec/osrodki/999999` i `/jezdziec/osrodki/abc` zwracają stan „nie znaleziono", a nie błąd serwera
- Konto ośrodka na `/jezdziec/osrodki/<id>` jest przekierowywane do `/osrodek` (trasa dziedziczy ochronę prefiksu `/jezdziec`)

#### Manual Verification:

- Kliknięcie karty prowadzi na właściwy ośrodek, a powrót wraca do katalogu
- Karta daje się wybrać klawiaturą i ma widoczne zaznaczenie

**Implementation Note**: To ostatnia faza — po niej zmiana jest gotowa do przeglądu.

---

## Testing Strategy

### Unit Tests:

Vitest, na czystej logice z `src/lib/stables/`:

- Przygotowanie frazy: pusta i sama ze spacji → brak filtra; przycinanie; ekranowanie `%`, `_`, `\` we właściwej kolejności; obcięcie nadmiernej długości.
- Walidacja identyfikatora: liczby dodatnie przechodzą; `undefined`, tekst, zero, wartości ujemne, ułamkowe i wykładnicze odpadają.

Zapytania do bazy nie są testowane jednostkowo — wymagałyby atrapy klienta Supabase, która sprawdzałaby wyłącznie to, że wywołano to, co wywołano. Ich zachowanie weryfikują kryteria automatyczne obu faz, uruchamiane przeciw lokalnej bazie z seedem.

### Integration Tests:

Brak nowych. `supabase/tests/rls_isolation.sql` z F-01 pozostaje aktualny — ten slice nie dotyka polityk ani nie zapisuje niczego do bazy.

### Manual Testing Steps:

1. `npx supabase start`, `npx supabase db reset`, `npm run dev`.
2. Zalogować się jako `anna.kowalska@example.com` (hasło `sekret123`) — oczekiwana lista dwóch ośrodków z seeda.
3. Wpisać `Wieliczka` — oczekiwany jeden wynik; wpisać `Debem` — oczekiwany drugi.
4. Wpisać frazę bez trafień (np. `xyz`) — oczekiwany komunikat o braku dopasowań z odnośnikiem czyszczącym.
5. Wyłączyć JavaScript i powtórzyć krok 3.
6. Wejść na kartę ośrodka, wrócić do katalogu.
7. Wpisać ręcznie `/jezdziec/osrodki/999999` oraz `/jezdziec/osrodki/abc` — oczekiwany stan „nie znaleziono".
8. Zalogować się jako `osrodek.debem@example.com` i wejść na `/jezdziec` — oczekiwane przekierowanie do `/osrodek`.

## Performance Considerations

Filtr wykonuje `ilike` na dwóch kolumnach bez indeksu, czyli skanuje tabelę. Przy `data_volume: small` i `qps: low` z PRD to koszt bez znaczenia — a indeks pod `ilike` i tak wymagałby rozszerzenia `pg_trgm`, czyli migracji wykluczonej z tego slice'a. Strona ośrodka trafia w klucz główny. Middleware dokłada swoje dwa zapytania (profil, a dla ośrodka także sprawdzenie stadniny) — bez zmian względem S-01.

## Migration Notes

Brak. Slice nie dotyka schematu, polityk ani danych; wycofanie to cofnięcie commitów. Na produkcji katalog wystartuje pusty, bo `seed.sql` jest wyłącznie lokalny — dlatego stan „nie ma jeszcze żadnych ośrodków" jest częścią zakresu, a nie ozdobnikiem.

## References

- Roadmapa S-03: `context/foundation/roadmap.md:94-104`
- Wymaganie: `context/foundation/prd.md:87-88` (FR-006)
- Model danych i polityki: `supabase/migrations/20260810090000_identity_and_stables.sql`
- Wzorce ustalone przez S-01: `context/changes/role-aware-auth/plan.md`, `src/lib/auth/`, `src/pages/osrodek/index.astro`
- Ochrona trasy `/jezdziec`: `src/lib/auth/roles.ts`, `src/middleware.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Katalog z filtrem

#### Automated

- [x] 1.1 `npm test` przechodzi — d2576c6
- [x] 1.2 `npm run lint` przechodzi — d2576c6
- [x] 1.3 `npm run build` przechodzi — d2576c6
- [x] 1.4 Katalog bez filtra zwraca oba ośrodki z seeda — d2576c6
- [x] 1.5 Filtr `Debem` i filtr `Wieliczka` zwracają po jednym właściwym ośrodku — d2576c6
- [x] 1.6 Filtr `%` nie zwraca wszystkiego — d2576c6

#### Manual

- [x] 1.7 Filtr działa bez JavaScriptu, fraza zostaje w adresie po odświeżeniu — d2576c6
- [x] 1.8 Komunikat przy braku dopasowań różni się od komunikatu przy pustym systemie — d2576c6
- [x] 1.9 Konto ośrodka na `/jezdziec` nadal jest przekierowywane do siebie — d2576c6

### Phase 2: Strona ośrodka

#### Automated

- [x] 2.1 `npm test` przechodzi — 9663183
- [x] 2.2 `npm run lint` przechodzi — 9663183
- [x] 2.3 `npm run build` przechodzi — 9663183
- [x] 2.4 Strona istniejącego ośrodka zwraca 200 i zawiera jego nazwę — 9663183
- [x] 2.5 `/jezdziec/osrodki/999999` i `/jezdziec/osrodki/abc` dają stan „nie znaleziono", nie błąd — 9663183
- [x] 2.6 Konto ośrodka na stronie ośrodka jest przekierowywane do `/osrodek` — 9663183

#### Manual

- [x] 2.7 Kliknięcie karty prowadzi na właściwy ośrodek, powrót wraca do katalogu — 9663183
- [x] 2.8 Karta daje się wybrać klawiaturą i ma widoczne zaznaczenie — 9663183
