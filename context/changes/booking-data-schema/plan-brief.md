# F-01 — Model danych rezerwacji — Plan Brief

> Pełny plan: `context/changes/booking-data-schema/plan.md`

## What & Why

Stable Booksy potrzebuje warstwy danych, na której da się oprzeć całą pętlę rezerwacji: profil z rolą, stadnina, konie, grafik dnia i zapisy. Sednem nie jest sam zestaw tabel, tylko **twarde ograniczenia integralności w bazie** — bo guardrail PRD „żadnej podwójnej rezerwacji tego samego konia w tym samym slocie" musi obowiązywać niezależnie od współbieżności i niezależnie od tego, którędy dane wchodzą do systemu. Każdy kolejny slice (S-01 … S-06) konsumuje ten model, więc pomyłka tutaj kosztuje migrację, a nie poprawkę.

## Starting Point

Baza jest praktycznie pusta: `supabase/config.toml` istnieje i repo jest zlinkowane ze zdalnym projektem, ale **katalog `supabase/migrations/` nie istnieje** — to pierwsza migracja w historii projektu. Logowanie e-mail+hasło działa end-to-end na kliencie SSR (`src/lib/supabase.ts`), ale rejestracja nie zna pojęcia roli i nie ma tabeli `profiles`. Nie ma frameworku testów; CI robi wyłącznie lint + build, bez bazy.

## Desired End State

Dwie migracje odtwarzają cały model od zera przez `db reset` i są wypchnięte na zdalny projekt. Druga równoległa próba zapisu na ten sam slot konia dostaje `23505` — udowodnione skryptem odpalającym 5 jednoczesnych połączeń, nie deklaracją. Konto ośrodka nie widzi ani nie zmienia danych cudzej stadniny, też sprawdzone skryptem. Lokalna baza po `db reset` zawiera komplet danych demo, a `src/types.ts` daje kolejnym slice'om typowane encje.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Reprezentacja slotu | `date` + `hour smallint` | PRD zamraża slot na 1 h; rozbicie na datę i godzinę czyni unikalność zwykłym indeksem i usuwa klasę błędów o jedną godzinę przy zmianie czasu |
| Model grafiku | `schedule_days` + tabela łącząca z końmi | Odwzorowuje FR-003/FR-004 1:1; wolne sloty liczone w locie zamiast materializowane, więc zmiana grafiku nie wymaga regeneracji wierszy |
| Guardrail współbieżności | Częściowy indeks unikalny `where status='active'` | Baza odrzuca drugi zapis niezależnie od liczby instancji Workera; roadmapa wprost wymaga guardraila w bazie, nie w kodzie |
| Rola użytkownika | Tabela `profiles` + trigger na `auth.users`, już w F-01 | Bez roli w bazie nie da się napisać żadnej polityki RLS, a izolacja ośrodka jest w outcome F-01 |
| Odwołanie zapisu | `status` + `cancelled_at`, bez kasowania wiersza | Slot zwalnia się jednym UPDATE, historia zostaje; S-06 nie będzie wymagał zmiany schematu |
| Model dostępu | Pełne RLS, klucz anon z sesją użytkownika | Guardrail izolacji żyje w bazie, więc żaden przyszły endpoint go nie ominie; zgodne z istniejącym klientem SSR |
| Dowód NFR | Skrypty SQL/bash na lokalnej bazie | Dowód na tym samym poziomie co guardrail, bez wprowadzania frameworku testów, na który F-01 nie ma budżetu |
| Workflow migracji | Pliki w repo → `db reset` lokalnie → `db push` | Migracje jako źródło prawdy, powtarzalne odtworzenie od zera; wymaga Dockera |
| Zakres poza SQL | Schemat + RLS + typy + seed, zero kodu aplikacji | Kolejne slice'y startują z typów i danych; F-01 nie pisze kodu, który nie ma jeszcze konsumenta |

## Scope

**W zakresie:** dwie migracje (tożsamość + stadnina; grafik + zapisy), funkcje pomocnicze RLS w schemacie `private`, trigger tworzący profil po rejestracji, trigger walidujący godzinę w zakresie pracy, komplet polityk RLS z indeksami, `supabase/seed.sql`, dwa skrypty weryfikacyjne w `supabase/tests/`, generowane typy bazy i aliasy w `src/types.ts`, `db push` na zdalny, korekta `AGENTS.md` i statusu w roadmapie.

**Poza zakresem:** jakikolwiek kod aplikacji (endpointy, formularze, `zod`, warstwa serwisów), wybór roli w formularzu rejestracji (S-01), przepływ zakładania stadniny (S-01/S-02), dzienny limit godzin konia (v2), reguła „jeździec bez dwóch zapisów o tej samej godzinie" (nie ma jej w PRD), wpięcie testów bazy do CI, rozstrzygnięcie Otwartego pytania #2 PRD.

## Architecture / Approach

Trzy człony reguły alokacji z PRD są rozłożone na trzy różne mechanizmy bazy: **„koń pracuje tego dnia"** to złożony klucz obcy z `bookings` do tabeli łączącej (deklaratywnie, bez triggera); **„koń z tej samej stadniny co grafik"** to zdenormalizowane `stable_id` niesione w dwóch złożonych kluczach obcych; **„godzina w zakresie pracy"** to jedyny trigger, bo `CHECK` nie sięga innego wiersza. Na wierzchu tego siedzi częściowy indeks unikalny odpowiadający za „slot niezajęty". Godziny pracy to przedział półotwarty `[open, close)` — „10–16" znaczy sloty 10…15.

Dostęp: pełne RLS `to authenticated`, predykaty przez `(select auth.uid())`, dwie funkcje `security definer` w nieeksponowanym schemacie `private` zamiast powielania podzapytania w kilkunastu politykach.

## Phases at a Glance

| Faza | Co dowozi | Główne ryzyko |
| --- | --- | --- |
| 1. Tożsamość i stadnina | `profiles` z rolą + trigger na `auth.users`, `stables`, `horses`, RLS | Trigger na schemacie `auth` bez `search_path=''` psuje rejestrację, a błąd widać dopiero z Auth, nie z migracji |
| 2. Grafik i rezerwacje | `schedule_days`, `schedule_day_horses`, `bookings`, częściowy indeks unikalny, trigger godzin, RLS | Zły kształt indeksu unikalnego przechodzi testy jednosesyjne i wykłada się dopiero przy współbieżności w S-04 |
| 3. Dane demo i dowody | `seed.sql`, skrypt współbieżności, skrypt izolacji RLS | Skrypty wymagają Dockera i `psql`; brak jednego z nich blokuje dowód NFR |
| 4. Typy, push, dokumentacja | `src/db/database.types.ts`, `src/types.ts`, `db push`, korekty w `AGENTS.md` i roadmapie | Generowany plik typów może zapalić type-checked ESLint i wywalić CI |

**Prerequisites:** Docker uruchomiony (`npx supabase start`), dostęp do zlinkowanego projektu Supabase, Node 22.14.0.
**Estimated effort:** ~2 sesje — faza 1+2 to gros pracy (SQL), fazy 3-4 są krótkie, ale faza 3 jest tą, która wyłapie błędy z fazy 2.

## Open Risks & Assumptions

- **Założenie: jedno konto ośrodka = jedna stadnina** (`unique (owner_id)` na `stables`). PRD mówi „admin zarządza wyłącznie własnym ośrodkiem" w liczbie pojedynczej; gdyby to się zmieniło, wystarczy zdjąć klucz unikalny, ale S-01/S-02 zbudują się wokół tego założenia.
- **Otwarte pytanie #2 PRD pozostaje otwarte świadomie.** Schemat zajmuje pozycję zachowawczą: `on delete restrict` sprawia, że usunięcie konia z dnia mającego aktywne zapisy **nie przechodzi**. Zapisy nie znikną po cichu, ale S-02 nie ruszy z miejsca, dopóki nie zapadnie decyzja, co pokazać ośrodkowi w tej sytuacji.
- **Dowody guardrailów nie biegną w CI.** Regresja w politykach RLS albo w indeksie nie zostanie wykryta automatycznie — skrypty trzeba uruchamiać świadomie po każdej zmianie schematu.
- **Trigger domyślnie nadaje rolę `rider`**, dopóki S-01 nie zacznie przekazywać roli przy rejestracji. Konta założone w międzyczasie będą jeźdźcami i będą wymagały ręcznej korekty roli.

## Success Criteria (Summary)

- Pięć równoległych prób zapisu na ten sam slot konia daje dokładnie jeden sukces i cztery odmowy `23505`.
- Konto ośrodka A nie odczyta ani nie zmieni koni, grafiku i zapisów ośrodka B — potwierdzone skryptem, nie inspekcją polityk.
- `npx supabase db reset` odtwarza cały model wraz z danymi demo od zera, a ten sam schemat stoi na zdalnym projekcie.
