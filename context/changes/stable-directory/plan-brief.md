# S-03 — Katalog ośrodków z filtrowaniem — Plan Brief

> Pełny plan: `context/changes/stable-directory/plan.md`

## What & Why

Jeździec musi móc znaleźć ośrodek, zanim zapisze się na jazdę — to jedyna droga do gwiazdy przewodniej MVP (S-04). FR-006 mówi o tym jednym zdaniem, a roadmapa dokłada drugi człon: nie tylko przeglądanie i filtrowanie, ale też **wybór ośrodka**, do którego jeździec chce się zapisać. Dziś `/jezdziec` nie robi ani jednego, ani drugiego.

## Starting Point

`/jezdziec` to pusty szkielet zostawiony przez S-01: nagłówek, powitanie i komentarz „katalog dołoży S-03". Trasa jest już chroniona mapą z `src/lib/auth/roles.ts`. Baza jest gotowa bez żadnej zmiany — F-01 utworzyło `stables.city` właśnie pod ten filtr, a polityka odczytu `using (true)` wpuszcza każdego zalogowanego.

## Desired End State

Jeździec po zalogowaniu widzi listę ośrodków z nazwą, miejscowością i skróconym opisem, a nad nią jedno pole filtrujące po nazwie i miejscowości. Fraza zostaje w adresie, więc odświeżenie i wysłanie linku działa, a całość działa bez JavaScriptu. Pusta lista tłumaczy się sama — inaczej gdy w systemie nie ma jeszcze ośrodków, inaczej gdy filtr nic nie znalazł. Kliknięcie karty prowadzi na stronę ośrodka, którą S-04 wypełni slotami.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Miejsce katalogu | `/jezdziec` staje się katalogiem | Po zalogowaniu jeździec od razu widzi to, po co przyszedł, zamiast pulpitu z jednym odnośnikiem |
| Zakres filtra | Jedno pole: nazwa i miejscowość | Pokrywa oba realne sposoby szukania bez zmuszania do wyboru kryterium; PRD i roadmapa ostrzegają przed przerostem filtra |
| Mechanika filtra | Parametr w adresie, filtrowanie w zapytaniu | Działa bez JavaScriptu jak reszta formularzy, adres da się odświeżyć i udostępnić, wzrost liczby ośrodków niczego nie psuje |
| Strona ośrodka | Tak, `/jezdziec/osrodki/[id]` | Domyka człon „wybiera ośrodek" z outcome'u S-03; S-04 dokłada tam sloty zamiast przebudowywać katalog |
| Treść karty | Nazwa, miejscowość, skrócony opis | Jedno zapytanie bez złączeń; karta nie obiecuje dostępności, której S-04 jeszcze nie dowozi |
| Stany puste | Dwa rozróżnione komunikaty | Produkcja startuje z zerem ośrodków, więc „brak wyników" bez wpisanej frazy wyglądałby jak awaria wyszukiwarki |
| Diakrytyki | Bez obsługi w v1 | Naprawa wymaga rozszerzenia `unaccent` i indeksu, czyli migracji — ten slice bazy nie rusza |

## Scope

**W zakresie:** przygotowanie i ekranowanie frazy (z testami), zapytanie o listę i o pojedynczy ośrodek, formularz filtra GET, karta ośrodka, katalog na `/jezdziec` z dwoma stanami pustymi, strona `/jezdziec/osrodki/[id]` z walidacją segmentu trasy.

**Poza zakresem:** jakakolwiek migracja i zmiana w RLS, obsługa braku polskich znaków w filtrze, sloty i zapis na jazdę (S-04), liczba koni i sygnał dostępności na karcie, sortowanie wybierane przez użytkownika, stronicowanie, filtrowanie po opisie, zmiany w `Topbar`.

## Architecture / Approach

Filtr to formularz GET: wartość ląduje w adresie, serwer zwraca gotową listę. Cała logika przygotowania frazy — przycięcie, odrzucenie pustej, ograniczenie długości, ekranowanie znaków wzorca — siedzi w jednym module pokrytym testami, żeby nie rozlać się po plikach `.astro`. Zapytania mieszkają obok, w `src/lib/stables/queries.ts`, więc strony zajmują się wyłącznie widokiem. Filtr obejmuje `name` i `city` w alternatywie, wyrażonej jednym warunkiem `or` — dwa osobne warunki `ilike` złożyłyby się w koniunkcję i fraza musiałaby pasować do obu pól naraz.

## Phases at a Glance

| Faza | Co dowozi | Główne ryzyko |
| --- | --- | --- |
| 1. Katalog z filtrem | Lista ośrodków na `/jezdziec`, formularz GET, dwa stany puste | Nieekranowana fraza — `%` wpisane przez użytkownika wyświetliłoby wszystko |
| 2. Strona ośrodka | `/jezdziec/osrodki/[id]`, karty jako odnośniki, obsługa złego identyfikatora | Segment trasy trafiający do zapytania bez walidacji — klucze są typu `bigint`, więc `abc` daje błąd bazy zamiast „nie znaleziono" |

**Prerequisites:** S-01 zaimplementowany (jest), lokalny stack Supabase z seedem, Node 22.14.0.
**Estimated effort:** ~1 sesja. Slice jest mały i wyłącznie do odczytu — nie ma migracji, zapisów ani nowych reguł domenowych.

## Open Risks & Assumptions

- **Filtr nie znajdzie „Kraków" po wpisaniu „krakow".** `ilike` ignoruje wielkość liter, ale nie diakrytyki. Przy polskich nazwach miejscowości to realna niedogodność; naprawa to rozszerzenie `unaccent` plus indeks wyrażeniowy na `unaccent(name)` i `unaccent(city)` — jedna mała migracja, świadomie odłożona.
- **Katalog na produkcji wystartuje pusty.** Schemat jest wypchnięty, ale seed jest wyłącznie lokalny. Pierwszy jeździec zobaczy komunikat „nie ma jeszcze żadnych ośrodków" — dlatego ten stan jest częścią zakresu, a nie ozdobnikiem.
- **Zapytania nie są pokryte testami jednostkowymi.** Atrapa klienta Supabase sprawdzałaby wyłącznie to, że wywołano to, co wywołano; zachowanie filtra weryfikują kryteria automatyczne przeciw lokalnej bazie z seedem.
- **Brak indeksu pod `ilike`** — filtr skanuje tabelę. Bez znaczenia przy `data_volume: small`, ale indeks i tak wymagałby `pg_trgm`, czyli migracji.

## Success Criteria (Summary)

- Jeździec po zalogowaniu widzi listę ośrodków i zawęża ją jednym polem, także z wyłączonym JavaScriptem.
- Pusta lista mówi, dlaczego jest pusta — brak ośrodków w systemie to inny komunikat niż brak dopasowań do frazy.
- Kliknięcie ośrodka prowadzi na jego stronę, a niepoprawny adres daje „nie znaleziono", nie błąd serwera.
