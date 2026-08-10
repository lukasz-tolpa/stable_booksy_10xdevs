# S-01 — Rejestracja z wyborem roli i routing wg roli — Implementation Plan

## Overview

Doprowadzenie uwierzytelniania do stanu, w którym konto ma rolę Ośrodek albo Jeździec, aplikacja tę rolę zna przy każdym żądaniu i kieruje użytkownika do właściwej przestrzeni, a próba wejścia na cudzą jest odrzucana w middleware. Po drodze zamykamy lukę „kto zakłada stadninę", stawiamy pierwszy framework testów w projekcie i spolszczamy przepływ auth.

Zero migracji — model danych z F-01 jest kompletny, a trigger `handle_new_user()` czeka na `raw_user_meta_data.role`, którego rejestracja dziś nie wysyła.

## Current State Analysis

- **Rejestracja gubi rolę.** `src/pages/api/auth/signup.ts:13` woła `signUp({ email, password })` bez `options.data`, więc trigger z F-01 nadaje fallback `rider` każdemu nowemu kontu. To jedyne, czego brakuje po stronie zapisu — baza jest gotowa.
- **Potwierdzanie e-maila jest wyłączone po obu stronach.** Lokalnie `enable_confirmations = false` (`supabase/config.toml:209`), na zdalnym `mailer_autoconfirm = true`. `signUp` zwraca sesję od razu, a mimo to `signup.ts:19` przekierowuje na `/auth/confirm-email` — użytkownik jest już zalogowany, a widzi ekran „sprawdź pocztę". Istniejący błąd, nie nowy.
- **Logowanie nie zna roli.** `src/pages/api/auth/signin.ts:19` przekierowuje na `/` niezależnie od tego, kim jest użytkownik.
- **Middleware zna tylko `user`.** `src/middleware.ts:13` ustawia `context.locals.user`; `src/env.d.ts` deklaruje wyłącznie to pole. `PROTECTED_ROUTES` to płaska lista prefiksów bez pojęcia roli.
- **Formularze są progresywne.** `SignUpForm.tsx:66` to zwykły `<form method="POST" action="/api/auth/signup">`; React służy wyłącznie walidacji po stronie klienta. Wybór roli musi wejść w ten sam wzorzec, żeby działał bez JavaScriptu.
- **Interfejs jest po angielsku.** `SignUpForm.tsx` („Email is required", „Create account"), `auth/signup.astro:14` („Sign up"), `Topbar.astro:25` („Not signed in"), `dashboard.astro:11` („Dashboard", „Welcome"). PRD §NFR wymaga polskiego. Po polsku jest dziś jeden plik: `src/lib/config-status.ts`.
- **Brak `zod`** mimo że `AGENTS.md` opisuje go jako konwencję dla endpointów. Endpointy rzutują przez `as string`.
- **Brak frameworku testów.** CI (`.github/workflows/ci.yml`) uruchamia lint + build. F-01 świadomie odłożył framework do slice'a, który pierwszy napisze logikę w TypeScripcie.
- **Luka w wymaganiach.** Żaden FR ani slice nie mówi, kto zakłada stadninę. Konto z rolą `stable` bez wiersza w `stables` ma `private.current_stable_id() = NULL`, więc nie ułoży grafiku (S-02) ani nie doda koni, a katalog z S-03 nie ma czego pokazać.

## Desired End State

1. Rejestracja wymaga wyboru roli; konto Ośrodek i konto Jeździec powstają z właściwą wartością w `profiles.role`.
2. Po zalogowaniu i po rejestracji użytkownik trafia do `/osrodek` albo `/jezdziec` zgodnie ze swoją rolą; `/dashboard` przekierowuje tam samo.
3. Wejście jeźdźca na `/osrodek` (i odwrotnie) kończy się przekierowaniem do własnej przestrzeni, egzekwowanym w jednym miejscu w middleware.
4. Konto Ośrodek bez stadniny nie wychodzi poza `/osrodek/nowa-stadnina`, dopóki jej nie założy; po założeniu wpada do swojej przestrzeni.
5. `npm test` przechodzi i jest wpięty do CI — pierwszy krok w tym projekcie, który weryfikuje logikę automatycznie.
6. Cały przepływ uwierzytelniania jest po polsku.

### Key Discoveries:

- **Baza jest gotowa, ale rola jest jednokierunkowa.** Trigger `public.handle_new_user()` mapuje `raw_user_meta_data ->> 'role'` twardo na `stable`/`rider`, a `profiles_role_immutable` blokuje późniejszą zmianę z poziomu sesji. Rola musi być poprawna w momencie rejestracji — nie ma ścieżki naprawczej w UI.
- **RLS wymusza kolejność przy zakładaniu stadniny.** Polityka `stables_insert_own` wymaga `owner_id = auth.uid()` **oraz** `private.current_role() = 'stable'`, więc insert musi lecieć z sesją użytkownika (istniejący klient SSR), nie z klucza serwisowego.
- **`stables` ma `unique (owner_id)`** — druga próba założenia stadniny przez to samo konto skończy się `23505`. To jest zabezpieczenie przed podwójnym wysłaniem formularza, ale wymaga zmapowania na komunikat.
- **Middleware biegnie na każde żądanie**, także dla zasobów statycznych i stron publicznych — dociąganie profilu musi być warunkowe względem obecności użytkownika, inaczej dokładamy zapytanie do każdego żądania anonimowego.
- **Vitest jest jedynym frameworkiem, który wejdzie do obecnego CI**, bo testy czystych funkcji nie potrzebują bazy ani serwera — w przeciwieństwie do skryptów z F-01, które zostały poza CI.

## What We're NOT Doing

- **Żadnej migracji ani zmiany schematu** — F-01 dostarczył komplet.
- **Bez zmiany roli po rejestracji** — baza to blokuje świadomie; ewentualna ścieżka „zmień rolę" to osobna decyzja produktowa, nie S-01.
- **Bez edycji danych stadniny** (nazwa, miejscowość, opis) po jej założeniu — S-01 tylko ją tworzy.
- **Bez zarządzania końmi** — należy do S-02.
- **Bez treści merytorycznej w korzeniach ról** — `/osrodek` i `/jezdziec` dostają szkielet z nawigacją i informacją o roli, a nie zapowiedzi kolejnych slice'ów. Grafik wypełni S-02, katalog S-03.
- **Bez testów end-to-end** — Vitest pokrywa czystą logikę; przepływ przez HTTP zostaje weryfikacją ręczną.
- **Bez resetu hasła, zmiany e-maila i potwierdzania konta** — poza FR-001 i FR-002.
- **Bez usuwania `/auth/confirm-email`** — strona zostaje na dysku, wypada tylko z przepływu, bo potwierdzanie maila jest dziś wyłączone po obu stronach. Gdyby kiedyś zostało włączone, wraca bez pisania jej od nowa.

## Implementation Approach

Rdzeniem jest **jedna tabela decyzyjna w `src/lib/auth/`**: która rola gdzie mieszka i który prefiks wymaga której roli. Middleware, oba endpointy i `Topbar` czytają z niej, zamiast powtarzać `if (role === "stable")` w pięciu miejscach. To ta sama zasada, którą F-01 zastosował w bazie — jedno miejsce, w którym reguła żyje — przeniesiona na warstwę routingu.

Kolejność faz jest podporządkowana temu, żeby każda bramka dawała się sprawdzić. Faza 1 dowozi wyłącznie czystą logikę i testy, więc od razu widać, czy tabela decyzyjna zachowuje się jak trzeba, zanim cokolwiek jej użyje. Dopiero potem wchodzi zapis roli (faza 2), jej konsumpcja w routingu (faza 3) i przypadek brzegowy ośrodka bez stadniny (faza 4). Polonizacja idzie na koniec jako zamiatanie tego, co odziedziczone — nowy interfejs z faz 2–4 powstaje od razu po polsku.

## Critical Implementation Details

**Kolejność w fazie 2.** `signUp` z włączonym autopotwierdzaniem zwraca sesję natychmiast, ale profil tworzy trigger bazy **po** wstawieniu wiersza do `auth.users`. Jeśli endpoint zaraz po `signUp` spróbuje odczytać `profiles`, żeby wybrać trasę przekierowania, wyścigu nie ma (trigger jest `AFTER INSERT` w tej samej transakcji), ale zapytanie jest zbędne — rolę endpoint zna, bo sam ją właśnie wysłał. Przekierowanie licz z wysłanej wartości, nie z odczytu.

**Middleware a żądania anonimowe.** Profil dociągaj wyłącznie, gdy `getUser()` zwrócił użytkownika. Bez tego warunku każde żądanie anonimowe — łącznie ze stroną główną — płaci za dodatkowe zapytanie do bazy.

**Wymuszenie ekranu stadniny nie może zapętlić przekierowań.** Reguła „ośrodek bez stadniny → `/osrodek/nowa-stadnina`" musi wykluczać samą tę trasę oraz endpoint, który przyjmuje formularz, inaczej middleware wpadnie w pętlę na własnym celu.

## Phase 1: Fundament — walidacja, mapa ról i testy

### Overview

Czysta logika i pierwszy framework testów w projekcie. Nic z tej fazy nie jest jeszcze używane przez UI, ale wszystko, co powstaje dalej, z tego korzysta. To także pierwszy krok, po którym CI weryfikuje logikę, a nie tylko składnię.

### Changes Required:

#### 1. Zależności i skrypt testowy

**File**: `package.json`

**Intent**: Dodać `zod` jako zależność produkcyjną (walidacja wejścia w endpointach) i `vitest` jako deweloperską wraz ze skryptem `test`.

**Contract**: `dependencies.zod`, `devDependencies.vitest`, `scripts.test` uruchamiające testy w trybie jednokrotnym (bez trybu obserwacji, bo skrypt biegnie w CI).

#### 2. Tabela decyzyjna ról i tras

**File**: `src/lib/auth/roles.ts`

**Intent**: Jedno miejsce, które wie, gdzie mieszka każda rola i który prefiks ścieżki wymaga której roli. Middleware, endpointy i nawigacja pytają tutaj, zamiast powielać warunki.

**Contract**: Eksportuje trasy startowe obu ról, funkcję zwracającą trasę startową dla podanej roli oraz funkcję odpowiadającą na pytanie „czy ta ścieżka wymaga roli, a jeśli tak, to której". Mapa prefiksów jest strukturą danych, nie łańcuchem `if`-ów — dopisanie trasy w kolejnym slice'ie ma być jednym wpisem. Dopasowanie po prefiksie musi traktować `/osrodek` i `/osrodek/cokolwiek` jako tę samą przestrzeń, ale **nie** dopasowywać `/osrodekxyz`.

#### 3. Schematy walidacji

**File**: `src/lib/auth/schemas.ts`

**Intent**: Schematy `zod` dla rejestracji (e-mail, hasło, powtórzenie, rola), logowania i formularza stadniny (nazwa, miejscowość), z komunikatami po polsku. Nieznana rola ma odpaść tutaj, a nie zamienić się po cichu w jeźdźca w triggerze bazy.

**Contract**: Po jednym schemacie na formularz plus wyprowadzone typy wejścia. Reguła długości hasła musi zgadzać się z `MIN_PASSWORD_LENGTH` z `SignUpForm.tsx:8` — jedna wartość, importowana, nie dwie kopie. Nazwa i miejscowość stadniny po przycięciu białych znaków muszą być niepuste, żeby walidacja odpowiadała ograniczeniom `stables_name_not_blank` i `stables_city_not_blank` z F-01.

#### 4. Testy jednostkowe

**File**: `src/lib/auth/roles.test.ts`, `src/lib/auth/schemas.test.ts`

**Intent**: Przybić zachowanie tabeli decyzyjnej i schematów, bo to reguły, które kolejne slice'y będą modyfikować.

**Contract**: Dla `roles` — trasa startowa obu ról, dopasowanie prefiksu dla trasy dokładnej i zagnieżdżonej, brak dopasowania dla trasy publicznej i dla nazwy zaczynającej się tak samo (`/osrodekxyz`). Dla `schemas` — poprawne wejście przechodzi, nieznana rola odpada, hasło krótsze niż minimum odpada, niezgodne powtórzenie hasła odpada, nazwa stadniny z samych spacji odpada.

#### 5. Testy w CI

**File**: `.github/workflows/ci.yml`

**Intent**: Dopisać `npm test` do przebiegu. To pierwszy krok w tym projekcie, który uruchamia w CI logikę, a nie tylko lint i build.

**Contract**: Krok po `npm run lint`, przed `npm run build`. Bez usług dodatkowych — testy nie dotykają bazy ani sieci.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Brak — faza nie dostarcza niczego widocznego dla użytkownika

**Implementation Note**: Faza bez weryfikacji ręcznej — po przejściu automatycznej przejdź od razu do rytuału commita.

---

## Phase 2: Rola w rejestracji i w sesji

### Overview

Rola zaczyna być zbierana przy rejestracji, zapisywana w bazie i dostępna w każdym żądaniu. Po tej fazie aplikacja wie, kim jest zalogowany użytkownik — jeszcze nic z tą wiedzą nie robiąc.

### Changes Required:

#### 1. Wybór roli w formularzu rejestracji

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Dodać wybór Ośrodek / Jeździec jako pole formularza, z krótkim opisem przy każdej opcji, żeby użytkownik rozumiał różnicę przed wyborem. Rola musi jechać w tym samym POST co reszta pól i działać bez JavaScriptu.

**Contract**: Pole o nazwie `role` z wartościami `stable` i `rider`, zrealizowane jako grupa pól wyboru (nie `select` sterowany stanem Reacta bez odpowiednika w formularzu). Brak wyboru blokuje wysłanie po stronie klienta i jest odrzucany po stronie serwera. Walidacja klienta korzysta z tego samego minimum długości hasła co schemat z fazy 1.

#### 2. Endpoint rejestracji

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Zwalidować wejście schematem z fazy 1 i przekazać rolę do Supabase, żeby trigger z F-01 zapisał ją w profilu. Przy okazji naprawić przekierowanie — konto jest od razu zalogowane, więc kierowanie na „sprawdź pocztę" jest błędem.

**Contract**: `signUp({ email, password, options: { data: { role } } })`. Błąd walidacji wraca na `/auth/signup?error=<komunikat po polsku>`, spójnie z istniejącym wzorcem obsługi błędów. Przekierowanie po sukcesie liczone z **wysłanej** roli przez funkcję z fazy 1 — bez odczytu profilu z bazy.

#### 3. Profil w kontekście żądania

**File**: `src/middleware.ts`, `src/env.d.ts`

**Intent**: Po ustaleniu użytkownika dociągnąć jego wiersz z `profiles` i wystawić w `Astro.locals`, żeby strony i nawigacja miały rolę bez własnych zapytań.

**Contract**: `App.Locals` zyskuje pole na profil (rola + nazwa, `null` dla anonimowego). Zapytanie wykonywane **wyłącznie** gdy `getUser()` zwrócił użytkownika. Gdy profil nie istnieje — sytuacja nietypowa, bo tworzy go trigger — pole zostaje `null`, a żądanie idzie dalej; faza 3 zdecyduje, co z takim stanem zrobić na trasach chronionych.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi
- Rejestracja z rolą `stable` tworzy profil z `role = 'stable'` (sprawdzone zapytaniem do lokalnej bazy)
- Rejestracja z rolą `rider` tworzy profil z `role = 'rider'`
- Żądanie z rolą spoza dozwolonego zbioru jest odrzucone przez walidację i nie tworzy konta

#### Manual Verification:

- Formularz rejestracji pokazuje oba warianty roli z czytelnym opisem i nie daje się wysłać bez wyboru
- Rejestracja działa przy wyłączonym JavaScripcie (wybór roli dojeżdża do serwera)

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie ręcznego sprawdzenia.

---

## Phase 3: Routing wg roli i ochrona tras

### Overview

Rola zaczyna decydować, co użytkownik widzi. Powstają dwie przestrzenie, oba endpointy kierują do właściwej, a middleware odrzuca wejścia na cudzą.

### Changes Required:

#### 1. Korzenie przestrzeni obu ról

**File**: `src/pages/osrodek/index.astro`, `src/pages/jezdziec/index.astro`

**Intent**: Dać każdej roli własną stronę startową — szkielet z nagłówkiem, informacją kim jest zalogowany użytkownik i wylogowaniem. Treść merytoryczną dołożą S-02 i S-03; tutaj chodzi o to, żeby przestrzeń istniała i dała się chronić.

**Contract**: Obie strony renderują się wyłącznie dla właściwej roli (egzekwuje middleware, strony nie powtarzają sprawdzenia). Teksty po polsku. Strona ośrodka pokazuje nazwę stadniny, jeśli istnieje.

#### 2. Mapa tras chronionych w middleware

**File**: `src/middleware.ts`

**Intent**: Zastąpić płaską listę `PROTECTED_ROUTES` regułą z fazy 1: brak sesji na trasie chronionej → logowanie; zła rola → własna przestrzeń użytkownika.

**Contract**: Decyzja pochodzi wyłącznie z funkcji z `src/lib/auth/roles.ts` — middleware jej nie duplikuje. Zalogowany użytkownik bez profilu na trasie wymagającej roli jest wylogowywany i kierowany na logowanie z komunikatem, zamiast oglądać zepsuty widok.

#### 3. Przekierowania po zalogowaniu

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Po udanym logowaniu skierować użytkownika do przestrzeni jego roli zamiast na stronę główną.

**Contract**: Rola odczytana z `profiles` dla zalogowanego użytkownika, trasa wyliczona funkcją z fazy 1. Wejście walidowane schematem logowania. Gdy profil nie istnieje — wylogowanie i powrót na `/auth/signin` z komunikatem.

#### 4. `/dashboard` jako przekierowanie

**File**: `src/pages/dashboard.astro`

**Intent**: Zachować stary adres, ale przenieść go na właściwą przestrzeń, żeby nie istniały dwa równoległe „panele".

**Contract**: Strona nie renderuje treści — przekierowuje na trasę startową roli zalogowanego użytkownika (lub na logowanie, gdy sesji brak).

#### 5. Nawigacja świadoma roli

**File**: `src/components/Topbar.astro`

**Intent**: Górny pasek ma prowadzić do przestrzeni użytkownika i mówić, w jakiej roli jest zalogowany, zamiast linkować do „Dashboard".

**Contract**: Link do trasy startowej roli, etykieta roli obok adresu e-mail, teksty po polsku. Wariant dla niezalogowanego zostaje bez zmian poza tłumaczeniem.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi

#### Manual Verification:

- Logowanie kontem ośrodka ląduje na `/osrodek`, kontem jeźdźca na `/jezdziec`
- Jeździec wchodzący na `/osrodek` jest przekierowany do `/jezdziec`, i odwrotnie
- Niezalogowany na `/osrodek` i `/jezdziec` trafia na logowanie
- `/dashboard` przekierowuje do przestrzeni właściwej roli
- Górny pasek pokazuje rolę i prowadzi do właściwej przestrzeni

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie ręcznego sprawdzenia.

---

## Phase 4: Zakładanie stadniny

### Overview

Domknięcie luki między F-01 a S-02: konto Ośrodek dostaje stadninę, bez której nie może zrobić nic. To jedyna faza dokładająca zapis do tabeli domenowej.

### Changes Required:

#### 1. Ekran zakładania stadniny

**File**: `src/pages/osrodek/nowa-stadnina.astro`, `src/components/stable/NewStableForm.tsx`

**Intent**: Formularz nazwy i miejscowości, wyjaśniający, dlaczego bez stadniny nie da się iść dalej. Ten sam wzorzec progresywny co formularze auth.

**Contract**: `<form method="POST">` do endpointu z punktu 2, walidacja klienta odpowiadająca schematowi z fazy 1, obsługa błędu serwera przez istniejący komponent komunikatu. Teksty po polsku.

#### 2. Endpoint tworzenia stadniny

**File**: `src/pages/api/stables/create.ts`

**Intent**: Zwalidować dane i wstawić wiersz do `stables` w imieniu zalogowanego użytkownika.

**Contract**: Insert leci **klientem SSR z sesją użytkownika**, nie kluczem serwisowym — polityka `stables_insert_own` wymaga `owner_id = auth.uid()` oraz roli `stable`, więc każda inna droga zostanie odrzucona przez bazę. Naruszenie `unique (owner_id)` (kod `23505`, skutek podwójnego wysłania) mapowane na komunikat „masz już stadninę" i przekierowanie do `/osrodek`, nie na surowy błąd. Po sukcesie przekierowanie na `/osrodek`.

#### 3. Wymuszenie stadniny w middleware

**File**: `src/middleware.ts`

**Intent**: Konto Ośrodek bez stadniny ma trafiać na ekran zakładania i nie wychodzić poza niego, dopóki go nie wypełni.

**Contract**: Reguła obowiązuje wyłącznie dla roli `stable` na trasach jej przestrzeni i **musi wykluczać** samą trasę `/osrodek/nowa-stadnina` oraz endpoint przyjmujący formularz — inaczej middleware zapętli przekierowania na własnym celu. Sprawdzenie wykonywane tylko dla roli `stable`, żeby nie dokładać zapytania jeźdźcom.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi
- Rejestracja nowego konta ośrodka + wypełnienie formularza tworzy wiersz w `stables` z `owner_id` równym temu kontu (sprawdzone zapytaniem do lokalnej bazy)
- `supabase/tests/rls_isolation.sql` nadal przechodzi (brak regresji w politykach)

#### Manual Verification:

- Świeże konto ośrodka po zalogowaniu trafia na ekran zakładania stadniny i nie da się z niego wyjść na `/osrodek`
- Po założeniu stadniny konto wpada do `/osrodek` i widzi jej nazwę
- Ponowne wysłanie formularza (np. przyciskiem wstecz) pokazuje komunikat, a nie surowy błąd bazy
- Konto jeźdźca nigdy nie widzi ekranu zakładania stadniny

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie ręcznego sprawdzenia.

---

## Phase 5: Polonizacja zastanych ekranów

### Overview

Zamiatanie angielszczyzny odziedziczonej po starterze. Interfejs powstały w fazach 2–4 jest już po polsku; tutaj chodzi wyłącznie o to, co istniało wcześniej.

### Changes Required:

#### 1. Ekrany uwierzytelniania

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Przetłumaczyć nagłówki, opisy i odsyłacze między ekranami.

**Contract**: Same teksty — bez zmian w strukturze ani w propsach komponentów. `confirm-email.astro` zostaje na dysku mimo wypadnięcia z przepływu; komentarz w pliku wyjaśnia, dlaczego nikt do niego nie linkuje.

#### 2. Formularze i komunikaty walidacji

**File**: `src/components/auth/SignInForm.tsx`, `src/components/auth/SignUpForm.tsx`, `src/components/auth/SubmitButton.tsx`, `src/components/auth/PasswordToggle.tsx`

**Intent**: Przetłumaczyć etykiety pól, teksty zastępcze, komunikaty walidacji klienta i etykiety dostępności.

**Contract**: Komunikaty walidacji klienta mają brzmieć tak samo jak odpowiadające im komunikaty schematów `zod` z fazy 1 — użytkownik nie może dostać dwóch różnych zdań o tym samym błędzie zależnie od tego, czy ma włączony JavaScript.

#### 3. Pozostały interfejs

**File**: `src/components/Topbar.astro`, `src/layouts/Layout.astro`

**Intent**: Domknąć tłumaczenie widocznej powierzchni przepływu, łącznie z atrybutem języka dokumentu.

**Contract**: `<html lang>` ustawione na `pl`. `dashboard.astro` nie wymaga tłumaczenia — po fazie 3 nie renderuje treści.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi
- `npm run lint` przechodzi
- `npm run build` przechodzi
- Brak angielskich pozostałości w przepływie auth: przegląd `src/pages/auth/`, `src/components/auth/`, `src/components/Topbar.astro` nie zwraca tekstów widocznych dla użytkownika po angielsku

#### Manual Verification:

- Przejście rejestracja → logowanie → panel obu ról jest w całości po polsku
- Komunikat o błędzie walidacji brzmi tak samo z włączonym i wyłączonym JavaScriptem

**Implementation Note**: To ostatnia faza — po niej zmiana jest gotowa do przeglądu.

---

## Testing Strategy

### Unit Tests:

Vitest, wyłącznie na czystej logice z `src/lib/auth/`:

- Mapowanie rola → trasa startowa dla obu ról.
- Dopasowanie mapy tras: trasa dokładna, trasa zagnieżdżona, trasa publiczna, nazwa zaczynająca się tym samym prefiksem (`/osrodekxyz` nie może być traktowane jak `/osrodek`).
- Schematy walidacji: wejście poprawne, rola spoza zbioru, hasło poniżej minimum, niezgodne powtórzenie hasła, nazwa stadniny z samych białych znaków.

### Integration Tests:

Brak nowych. `supabase/tests/rls_isolation.sql` z F-01 jest uruchamiany w fazie 4 jako test regresji — S-01 jest pierwszym slice'em zapisującym do tabeli domenowej z poziomu aplikacji, więc to pierwszy moment, w którym polityki są używane naprawdę.

### Manual Testing Steps:

1. `npx supabase start` i `npx supabase db reset`, potem `npm run dev`.
2. Zarejestrować nowe konto z rolą Jeździec — oczekiwane lądowanie na `/jezdziec`.
3. Zarejestrować nowe konto z rolą Ośrodek — oczekiwany ekran zakładania stadniny; próba wejścia na `/osrodek` ma na niego wracać.
4. Założyć stadninę — oczekiwane lądowanie na `/osrodek` z widoczną nazwą.
5. Będąc jeźdźcem, wejść ręcznie na `/osrodek` — oczekiwane przekierowanie na `/jezdziec`.
6. Wylogować się i wejść na `/osrodek` — oczekiwane przekierowanie na logowanie.
7. Zalogować się kontem `osrodek.debem@example.com` z seeda (ma już stadninę) — oczekiwane lądowanie prosto na `/osrodek`, z pominięciem ekranu zakładania.
8. Wyłączyć JavaScript w przeglądarce i powtórzyć rejestrację z wyborem roli.

## Performance Considerations

Middleware zyskuje jedno zapytanie do bazy na żądanie zalogowanego użytkownika (profil) oraz — wyłącznie dla roli `stable` w jej przestrzeni — sprawdzenie istnienia stadniny. Przy `qps: low` i `data_volume: small` z PRD to koszt bez znaczenia; oba zapytania trafiają w klucz główny albo w indeks unikalny `stables(owner_id)`. Żądania anonimowe nie płacą nic, bo dociąganie profilu jest warunkowe. Gdyby ruch kiedyś urósł, naturalnym krokiem jest przeniesienie roli do własnego oświadczenia w tokenie — świadomie odrzucone w tej zmianie, bo `user_metadata` jest edytowalne przez użytkownika i nie nadaje się na źródło decyzji dostępowych.

## Migration Notes

Bez migracji bazy. Konta założone przed tą zmianą mają rolę `rider` z fallbacku triggera — w praktyce dotyczy to wyłącznie kont testowych z lokalnego środowiska, bo produkcja nie ma jeszcze użytkowników. Gdyby jakieś konto wymagało roli `stable`, jedyną drogą jest zmiana z poziomu obsługi technicznej (`psql` lub klucz serwisowy), bo trigger `profiles_role_immutable` blokuje ją z poziomu sesji — to zachowanie zamierzone, nie przeszkoda do obejścia w kodzie aplikacji.

Wycofanie: cała zmiana to kod, więc cofnięcie commitów wystarczy. Wiersze utworzone w `stables` przez fazę 4 zostaną, ale nie kolidują z niczym.

## References

- Roadmapa S-01: `context/foundation/roadmap.md:69-79`
- Wymagania: `context/foundation/prd.md:73-76` (FR-001, FR-002), `context/foundation/prd.md:110-118` (§Access Control), `context/foundation/prd.md:96-100` (§NFR — polski interfejs)
- Model danych i guardraile: `context/changes/booking-data-schema/plan.md`, migracje `supabase/migrations/`
- Istniejący przepływ auth: `src/middleware.ts`, `src/pages/api/auth/signin.ts:19`, `src/pages/api/auth/signup.ts:13`, `src/components/auth/SignUpForm.tsx:66`
- Konwencje: `AGENTS.md`, `CLAUDE.md.scaffold:32-42`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fundament — walidacja, mapa ról i testy

#### Automated

- [x] 1.1 `npm test` przechodzi — c9f16df
- [x] 1.2 `npm run lint` przechodzi — c9f16df
- [x] 1.3 `npm run build` przechodzi — c9f16df

### Phase 2: Rola w rejestracji i w sesji

#### Automated

- [x] 2.1 `npm test` przechodzi
- [x] 2.2 `npm run lint` przechodzi
- [x] 2.3 `npm run build` przechodzi
- [x] 2.4 Rejestracja z rolą `stable` tworzy profil z `role = 'stable'`
- [x] 2.5 Rejestracja z rolą `rider` tworzy profil z `role = 'rider'`
- [x] 2.6 Rola spoza dozwolonego zbioru jest odrzucona przez walidację i nie tworzy konta

#### Manual

- [x] 2.7 Formularz pokazuje oba warianty roli z opisem i nie da się wysłać bez wyboru
- [x] 2.8 Rejestracja działa przy wyłączonym JavaScripcie

### Phase 3: Routing wg roli i ochrona tras

#### Automated

- [ ] 3.1 `npm test` przechodzi
- [ ] 3.2 `npm run lint` przechodzi
- [ ] 3.3 `npm run build` przechodzi

#### Manual

- [ ] 3.4 Logowanie ośrodkiem ląduje na `/osrodek`, jeźdźcem na `/jezdziec`
- [ ] 3.5 Jeździec na `/osrodek` jest przekierowany do `/jezdziec`, i odwrotnie
- [ ] 3.6 Niezalogowany na `/osrodek` i `/jezdziec` trafia na logowanie
- [ ] 3.7 `/dashboard` przekierowuje do przestrzeni właściwej roli
- [ ] 3.8 Górny pasek pokazuje rolę i prowadzi do właściwej przestrzeni

### Phase 4: Zakładanie stadniny

#### Automated

- [ ] 4.1 `npm test` przechodzi
- [ ] 4.2 `npm run lint` przechodzi
- [ ] 4.3 `npm run build` przechodzi
- [ ] 4.4 Wypełnienie formularza tworzy wiersz w `stables` z właściwym `owner_id`
- [ ] 4.5 `supabase/tests/rls_isolation.sql` nadal przechodzi

#### Manual

- [ ] 4.6 Świeże konto ośrodka nie wychodzi poza ekran zakładania stadniny
- [ ] 4.7 Po założeniu stadniny konto wpada do `/osrodek` i widzi jej nazwę
- [ ] 4.8 Ponowne wysłanie formularza pokazuje komunikat, nie surowy błąd bazy
- [ ] 4.9 Konto jeźdźca nigdy nie widzi ekranu zakładania stadniny

### Phase 5: Polonizacja zastanych ekranów

#### Automated

- [ ] 5.1 `npm test` przechodzi
- [ ] 5.2 `npm run lint` przechodzi
- [ ] 5.3 `npm run build` przechodzi
- [ ] 5.4 Brak angielskich tekstów widocznych dla użytkownika w przepływie auth

#### Manual

- [ ] 5.5 Przejście rejestracja → logowanie → panel obu ról jest w całości po polsku
- [ ] 5.6 Komunikat walidacji brzmi tak samo z JavaScriptem i bez
