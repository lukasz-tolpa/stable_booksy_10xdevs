# S-01 — Rejestracja z wyborem roli i routing wg roli — Plan Brief

> Pełny plan: `context/changes/role-aware-auth/plan.md`

## What & Why

Konto w Stable Booksy musi od pierwszej sekundy wiedzieć, czy należy do ośrodka, czy do jeźdźca — bo obie role widzą zupełnie inne ekrany, a PRD stawia to jako pierwszy wymóg (FR-001, FR-002). Dziś rejestracja gubi tę informację, więc każde nowe konto jest jeźdźcem, a logowanie kieruje wszystkich na tę samą stronę główną. S-01 domyka to końcem w koniec: rola jest zbierana, zapisywana, znana przy każdym żądaniu i egzekwowana w routingu.

## Starting Point

Uwierzytelnianie e-mail + hasło działa i opiera się na progresywnych formularzach — React tylko waliduje po stronie klienta. Baza z F-01 jest gotowa: trigger czeka na `raw_user_meta_data.role`, a `profiles.role` ma ograniczenie na dozwolone wartości. Brakuje wszystkiego powyżej bazy: `signup.ts` nie wysyła roli, `signin.ts` przekierowuje na `/`, middleware zna wyłącznie `user`, nie ma `zod` mimo że `AGENTS.md` go opisuje, nie ma frameworku testów, a cały interfejs jest po angielsku wbrew NFR.

## Desired End State

Rejestracja wymaga wyboru roli i tworzy konto z właściwym profilem. Ośrodek ląduje w `/osrodek`, jeździec w `/jezdziec`, a wejście na cudzą przestrzeń kończy się przekierowaniem. Świeże konto ośrodka nie wychodzi poza ekran zakładania stadniny, dopóki jej nie założy — dzięki temu S-02 i S-03 zastają dane, na których mogą pracować. Cały przepływ jest po polsku, a `npm test` biegnie w CI.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Zbieranie roli | Przełącznik w jednym formularzu rejestracji | Jeden adres rejestracji, działa bez JavaScriptu tak jak reszta formularzy; rola jest niezmienna po fakcie, więc musi paść od razu |
| Kto zakłada stadninę | Osobny ekran po pierwszym zalogowaniu | Nieudana próba sama się leczy przy kolejnym wejściu; rejestracja zostaje prostym formularzem bez pól warunkowych |
| Routing po zalogowaniu | Dwie trasy per rola, `/dashboard` przekierowuje | S-02 i S-03 mają gotowe miejsce do podpięcia; adres mówi, czyja to przestrzeń |
| Źródło roli | Middleware dociąga profil z bazy | `user_metadata` jest edytowalne przez użytkownika, więc nie nadaje się na decyzje dostępowe; przy `qps: low` koszt zapytania jest bez znaczenia |
| Ochrona tras | Deklaratywna mapa prefiks → rola w middleware | Jedno miejsce decyzji; nowa strona pod istniejącym prefiksem jest chroniona bez pamiętania o guardzie |
| Walidacja | `zod` w endpointach | Domyka rozjazd między `AGENTS.md` a kodem i daje jedno miejsce na polskie komunikaty |
| Testy | Vitest na czystej logice | Pierwsza rzecz w tym projekcie, która **da się wpiąć do obecnego CI** — nie potrzebuje bazy ani serwera |
| Język | Spolszczenie całego przepływu auth | NFR wymaga polskiego; mieszanka na jednym ekranie wygląda jak błąd, a dług rośnie z każdym slice'em |
| Zakres UI | Pełny przepływ łącznie z nawigacją | Po zalogowaniu nie zostaje żaden ekran mówiący do ośrodka „Dashboard" |

## Scope

**W zakresie:** wybór roli w rejestracji, przekazanie jej do Supabase, profil w `Astro.locals`, dwie przestrzenie ról, mapa tras chronionych, przekierowania po logowaniu i rejestracji, ekran i endpoint zakładania stadniny, `Topbar` świadomy roli, `zod`, Vitest wpięty do CI, polonizacja przepływu auth.

**Poza zakresem:** jakakolwiek migracja bazy, zmiana roli po rejestracji (baza to blokuje świadomie), edycja danych stadniny, zarządzanie końmi (S-02), treść merytoryczna korzeni ról, testy end-to-end, reset hasła i zmiana e-maila, usuwanie `/auth/confirm-email`.

## Architecture / Approach

Sercem jest **jedna tabela decyzyjna w `src/lib/auth/`**: gdzie mieszka każda rola i który prefiks wymaga której roli. Middleware, oba endpointy i nawigacja czytają z niej, zamiast powtarzać `if (role === "stable")` w pięciu miejscach — ta sama zasada, którą F-01 zastosował w bazie, przeniesiona na routing. Middleware po ustaleniu użytkownika dociąga profil i wystawia go w `Astro.locals`; strony nie robią własnych zapytań o rolę i nie powtarzają sprawdzeń dostępu.

## Phases at a Glance

| Faza | Co dowozi | Główne ryzyko |
| --- | --- | --- |
| 1. Fundament | `zod`, Vitest w CI, mapa ról i tras, schematy, testy jednostkowe | Dopasowanie prefiksów zrobione naiwnie potraktuje `/osrodekxyz` jak `/osrodek` |
| 2. Rola w rejestracji i sesji | Wybór roli w formularzu, `options.data.role`, profil w `Astro.locals` | Wybór roli oparty wyłącznie na stanie Reacta nie dojedzie do serwera bez JavaScriptu |
| 3. Routing wg roli | Dwie przestrzenie, mapa tras w middleware, przekierowania, nawigacja | Zalogowany bez profilu na trasie chronionej — musi mieć zdefiniowane zachowanie, nie zepsuty widok |
| 4. Zakładanie stadniny | Ekran i endpoint, wymuszenie dla ośrodka bez stadniny | Reguła wymuszenia nie wykluczająca własnego celu zapętla przekierowania |
| 5. Polonizacja | Tłumaczenie ekranów odziedziczonych po starterze | Komunikaty walidacji rozjeżdżające się między klientem a serwerem |

**Prerequisites:** F-01 zaimplementowany (jest), lokalny stack Supabase z załadowanym seedem, Node 22.14.0.
**Estimated effort:** ~2 sesje. Fazy 1 i 5 są krótkie i mechaniczne, gros pracy leży w 2–4.

## Open Risks & Assumptions

- **Rola jest jednokierunkowa.** Trigger `profiles_role_immutable` blokuje zmianę z poziomu sesji, więc pomyłka przy rejestracji wymaga interwencji technicznej. Jeśli produkt kiedyś będzie potrzebował zmiany roli, to osobna decyzja — nie obejście w kodzie aplikacji.
- **Założenie: jedno konto ośrodka = jedna stadnina**, odziedziczone po `unique (owner_id)` z F-01. Cały przepływ zakładania stadniny jest wokół tego zbudowany.
- **Potwierdzanie e-maila jest dziś wyłączone po obu stronach.** Gdyby zostało włączone, `signUp` przestanie zwracać sesję i przekierowanie po rejestracji trafi na logowanie — działa, ale wymaga świadomego powrotu do `/auth/confirm-email`.
- **Vitest pokrywa logikę, nie przepływ.** Regresja w middleware nadal wymaga ręcznego kliknięcia — dokładnie tak jak guardraile bazy z F-01.

## Success Criteria (Summary)

- Rejestracja z rolą Ośrodek i z rolą Jeździec tworzy konta, które po zalogowaniu trafiają do dwóch różnych przestrzeni.
- Próba wejścia na przestrzeń drugiej roli kończy się przekierowaniem, a nie pustym lub zepsutym widokiem.
- Świeże konto ośrodka przechodzi ścieżkę „zarejestruj się → załóż stadninę → panel" bez ślepych zaułków, a `npm test` biegnie w CI.
