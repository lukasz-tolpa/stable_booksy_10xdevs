# S-02 — Grafik dnia ośrodka — Plan Brief

> Pełny plan: `context/changes/daily-schedule-management/plan.md`

## What & Why

Ośrodek musi móc powiedzieć, w jakich godzinach pracuje danego dnia i które konie tego dnia jeżdżą — bez tego reguła alokacji z PRD nie ma danych wejściowych, a S-04 (gwiazda przewodnia) nie ma z czego policzyć wolnych slotów. Slice domyka też rozstrzygnięcie Otwartego pytania #2: zmiana grafiku kolidująca z aktywnym zapisem ma być odrzucana, a połowa tej reguły **nie jest dziś egzekwowana przez nic**.

## Starting Point

`/osrodek` to szkielet z nazwą stadniny. Tabele `schedule_days`, `schedule_day_horses` i `horses` istnieją od F-01 z kompletem polityk RLS, ale **aplikacja nie dotyka żadnej z nich** — nie ma nawet jak dodać konia, choć FR-004 każe wskazywać konie ze stada. Sprawdzone na żywo: zawężenie godzin pod istniejącym zapisem przechodzi i osierocą go, a zmiana daty dnia przenosi wszystkie zapisy na inny termin. Usunięcie całego dnia z zapisami jest już zablokowane kaskadą z F-01.

## Desired End State

Ośrodek dodaje konie do stada, wybiera datę i w jednym formularzu ustawia zakres godzin oraz zaznacza konie pracujące — z polami podpowiedzianymi z ostatnio ułożonego dnia. Próba zawężenia godzin albo odpięcia konia pod istniejącym zapisem kończy się komunikatem mówiącym, co blokuje i ilu zapisów dotyczy. Reguła obowiązuje w bazie, więc żadna ścieżka zapisu jej nie ominie.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Konflikt grafiku z zapisami | Blokada z komunikatem, zapisy nigdy nie giną | Rozstrzygnięcie Otwartego pytania #2 PRD | PRD |
| Zakres triggera | Godziny **i** data | Zmiana daty przenosi zapisy po cichu — skutek gorszy niż osierocenie, bo jeździec dostaje inny termin bez wiedzy | Plan |
| Zarządzanie stadem | W zakresie S-02 | Bez koni FR-004 jest niewykonalne, a grafik ma puste pole wyboru | Plan |
| Ekran grafiku | Jeden dzień, data w adresie | Odwzorowuje model danych 1:1, działa bez JavaScriptu — wzorzec sprawdzony przy filtrze w S-03 | Plan |
| Model zapisu | Jeden formularz, zapis sekwencyjny | Ośrodek myśli „układam wtorek"; operacja idempotentna, więc częściowa porażka naprawia się ponownym wysłaniem | Plan |
| Komunikat konfliktu | Konkret: co blokuje i ile zapisów | Decyzja produktowa wymaga od ośrodka doprowadzenia do odwołania — bez wskazówki zostaje w ślepym zaułku | Plan |
| Wycofanie konia | `active = false`, bez usuwania | Usunięcie konia, który kiedykolwiek pracował, i tak blokuje RESTRICT; flaga to jedyne działające wyjście | Plan |
| Nowy dzień | Podpowiedź z ostatniego dnia | Ośrodki pracują w rytmie; przepisywanie tego samego zakresu to najczęstsza czynność na tym ekranie | Plan |
| Zakres dat | Tylko dziś i w przód | Układanie grafiku na wczoraj nie ma sensu, a historia zapisów nie powinna się zmieniać | Plan |
| Weryfikacja | Vitest + skrypt SQL na trigger | Guardraile bazy dowodzi się skryptem — wzorzec z F-01; trigger jest tu całą istotą decyzji | Plan |

## Scope

**W zakresie:** migracja z triggerem chroniącym zapisy (godziny + data) i skrypt dowodowy, lista i dodawanie koni, wycofanie konia flagą, ekran grafiku dnia z wyborem daty i podpowiedzią, endpoint zapisu, tłumaczenie kodów błędu na polskie komunikaty, odnośniki z `/osrodek`.

**Poza zakresem:** lista zapisów dnia (FR-005, czyli S-05), odwoływanie zapisów przez ośrodek (FR-009 daje to prawo tylko jeźdźcowi), wolne sloty i rezerwacja (S-04), kopiowanie grafiku na wiele dni, edycja danych konia poza flagą, usuwanie konia, grafik na daty przeszłe, zmiany w RLS.

## Architecture / Approach

Guardrail żyje w bazie, spójnie z F-01: trigger na `schedule_days` odrzuca zmiany, po których istniejący aktywny zapis wypadłby poza zakres godzin albo trafiłby na inną datę, podnosząc wyjątek z **własnym kodem błędu** — odróżnialnym od `23505` (dubel konia) i `23514` (godzina poza zakresem). Aplikacja reguły nie powiela, tylko tłumaczy kod na komunikat. Logika czysta (daty, schematy, mapowanie błędów) siedzi w `src/lib/schedule/` i `src/lib/stables/` pod testami; strony `.astro` renderują.

## Phases at a Glance

| Faza | Co dowozi | Główne ryzyko |
| --- | --- | --- |
| 1. Trigger chroniący zapisy | Migracja + skrypt dowodowy na 6 przypadków | Trigger blokujący **każdą** zmianę godzin zamiast tylko zawężającej — rozszerzenie dnia musi przechodzić |
| 2. Stado | `/osrodek/konie`, dodawanie, wycofanie flagą | Zapytanie bez jawnego filtra po stadninie pokaże cudze konie — polityka odczytu `horses` jest otwarta dla zalogowanych |
| 3. Grafik dnia | `/osrodek/grafik`, zapis, komunikaty konfliktu | Zła kolejność operacji przy podmianie koni zostawia dzień w stanie, którego ośrodek nie zamawiał |

**Prerequisites:** F-01 i S-01 zaimplementowane (są), lokalny stack Supabase z seedem, Node 22.14.0.
**Estimated effort:** ~2 sesje. Faza 1 jest krótka, ale najważniejsza; gros pracy leży w fazie 3.

## Open Risks & Assumptions

- **Trigger zamraża dane, które dziś są niespójne.** Gdyby w bazie istniał zapis poza zakresem godzin swojego dnia, po migracji nie da się tego dnia poprawić bez wcześniejszego odwołania zapisu. Na produkcji i lokalnie takich danych nie ma, bo grafiku nie dało się dotąd edytować z aplikacji.
- **Skrypt dowodowy nie pobiegnie w CI** — workflow nie stawia bazy. Regresja w triggerze nie wykryje się sama; skrypt trzeba uruchamiać świadomie po każdej zmianie schematu.
- **Porównanie dat liczone lokalnie, nie w UTC.** Inaczej po 22:00 czasu polskiego dzisiejsza data wypadnie jako wczorajsza i ośrodek nie ułoży grafiku na dziś.
- **Dzień bez koni jest legalnym stanem** — ośrodek może zapisać sam zakres godzin. S-04 zobaczy wtedy zero wolnych slotów, co jest poprawne.

## Success Criteria (Summary)

- Ośrodek przechodzi ścieżkę „dodaj konie → ułóż jutrzejszy dzień → zapisz" bez ślepych zaułków.
- Zawężenie godzin i odpięcie konia pod istniejącym zapisem są odrzucane **dwoma różnymi** komunikatami, a rozszerzenie godzin przechodzi.
- Sześć asercji skryptu guardrailowego przechodzi, łącznie z dwoma przypadkami odziedziczonymi po F-01.
