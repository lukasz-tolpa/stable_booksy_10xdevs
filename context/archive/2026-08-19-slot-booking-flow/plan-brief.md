# S-04 — Rezerwacja jazdy — Plan Brief

> Pełny plan: `context/changes/slot-booking-flow/plan.md`

## What & Why

Jeździec na stronie ośrodka widzi wyłącznie wolne sloty (godzina × koń) zgodne z regułą alokacji i zapisuje się na jazdę jednym kliknięciem; próba zapisu na slot zajęty w międzyczasie kończy się czytelną polską odmową. To gwiazda przewodnia MVP — domyka Primary Success Criterion PRD (pełna pętla rezerwacji end-to-end) i największe ryzyko techniczne całej roadmapy.

## Starting Point

Baza jest gotowa niemal w całości: dubel slotu odrzuca częściowy indeks unikalny (`23505`), godzinę poza zakresem trigger (`23514`), konia niepracującego tego dnia złożony FK (`23503`) — S-04 niczego nie re-implementuje, tylko tłumaczy kody. Strona `/jezdziec/osrodki/[id]` istnieje od S-03 z komentarzem-placeholderem. **Jedyna luka:** RLS pokazuje jeźdźcowi tylko własne zapisy, więc zajętości cudzych slotów nie da się dziś odczytać — stąd jedyna migracja tego slice'a.

## Desired End State

Jeździec wybiera dzień (domyślnie jutro), widzi sekcje godzin z przyciskami dostępnych koni, własny zapis oznaczony jako „Twój zapis", i zapisuje się jednym kliknięciem — także z wyłączonym JavaScriptem. Przegrany wyścig o slot daje komunikat o zajętości i odświeżoną listę. Dzień bez grafiku pokazuje stan pusty z wyjaśnieniem. Zapis pojawia się w bazie po stronie ośrodka.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Odczyt zajętości | Funkcja RPC `security definer` (`get_taken_slots`) | Zwraca tylko pary koń×godzina — zero wycieku `rider_id`; spójna z wzorcem funkcji `private.*` z F-01 | Plan |
| UI slotów | Sekcje godzin, konie jako przyciski | Naturalne na telefonie (NFR mobile), działa bez JS; każdy przycisk to formularz POST | Plan |
| Wybór dnia | `?dzien=` w adresie, domyślnie jutro | Dokładnie wzorzec `/osrodek/grafik` i filtra S-03 — adres do udostępnienia | Plan |
| Po zapisie | PRG z komunikatem, „Twój zapis" w liście | Domyka outcome S-04 bez „moich zapisów" — te wejdą z odwołaniami w S-06 | Plan |
| Dziś i przeszłość | Dziś dozwolone, minione godziny ukryte | Spontaniczna jazda to realny scenariusz; baza dat nie pilnuje, więc pilnuje aplikacja | Plan |
| Przepływ zapisu | Jeden klik, bez kroku potwierdzenia | Minimalne tarcie; wyścig i tak rozstrzyga baza (`23505`) | Plan |
| Odmowy | Mapowanie kodów `23505`/`23514`/`23503` na polskie komunikaty | Wzorzec `scheduleErrorMessage` z S-02; sam kod, bez parsowania message | PRD/Plan |
| Weryfikacja | Vitest na czystej logice + rozszerzony `rls_isolation.sql` + istniejący skrypt współbieżności | Guardraile bazy dowodzi się skryptem — wzorzec F-01/S-02 | Plan |

## Scope

**W zakresie:** migracja z funkcją zajętości + regeneracja typów, moduł `src/lib/bookings/` (sloty, schema, błędy, zapytania) z testami, rozbudowa strony ośrodka (data, sekcje slotów, stany puste, komunikaty), `POST /api/bookings/create`, nowe asercje w `rls_isolation.sql`, korekta AGENTS.md.

**Poza zakresem:** odwołanie zapisu (S-06), lista zapisów ośrodka (S-05), widok „moje zapisy", krok potwierdzenia, blokada dwóch zapisów jeźdźca o tej samej godzinie (nie ma w PRD), limit godzin konia (v2), zmiany istniejących polityk RLS, CI dla skryptów SQL.

## Architecture / Approach

Zajętość dostarcza jedna addytywna funkcja `security definer` w `public` (złączenie `bookings` × `schedule_days`, tylko aktywne, bez tożsamości). Wolne sloty liczy czysta funkcja `computeSlotSections` (godziny `[open, close)` × konie dnia − zajęte − minione godziny w `Europe/Warsaw`) pod Vitest; strona `.astro` renderuje, endpoint powtarza kanon `api/schedule/save.ts` (zod → guardy przed mutacją → `rider_id` z sesji → mapowanie kodów → redirect PRG).

## Phases at a Glance

| Faza | Co dowozi | Główne ryzyko |
| --- | --- | --- |
| 1. Zajętość slotów w bazie | Migracja z RPC, typy, asercje izolacji | `security definer` bez `search_path=''`/revoke — funkcja to jedyny nowy punkt styku z izolacją F-01 |
| 2. Czysta logika rezerwacji | `src/lib/bookings/` + komplet testów | Błąd w przedziale półotwartym albo w progu „minionej godziny" — klasy błędów o jeden |
| 3. Strona i endpoint | Sloty na `/jezdziec/osrodki/[id]`, `POST /api/bookings/create` | Zaufanie polom formularza — dzień grafiku musi być rozwiązany serwerowo, `rider_id` z sesji |

**Prerequisites:** F-01, S-02, S-03 zaimplementowane (są), lokalny stack Supabase z seedem, Docker, Node 22.14.0.
**Estimated effort:** ~2 sesje — faza 1 krótka, gros pracy w fazach 2–3; seed daje wszystkie scenariusze testowe od ręki.

## Open Risks & Assumptions

- **Konie pokazujemy wg przydziału do dnia, nie flagi `active`** — to kontrakt bazy (FK sprawdza przydział). Koń wycofany, ale wciąż przydzielony, będzie widoczny do rezerwacji; spójne z guardrailem, choć ośrodek może się zdziwić.
- **Zajętość jest z natury stale nieaktualna** — lista wolnych slotów to migawka; ostateczny arbiter to indeks unikalny, a UX odmowy (`23505` → komunikat + odświeżenie) jest częścią projektu, nie błędem.
- **Skrypty SQL nadal poza CI** — regresja w RPC nie wykryje się sama; odpalać po każdej zmianie schematu.
- **Grafik na dziś z bieżącą godziną graniczną**: slot o godzinie równej bieżącej uznajemy za miniony (jazda już się zaczęła) — próg jest w jednym miejscu (`computeSlotSections` + guard endpointu).

## Success Criteria (Summary)

- Anna na seedzie przechodzi pełną pętlę: katalog → Pod Dębem → jutro → zapis na Kasztana 12:00; slot znika z wolnych, zapis widać w bazie ośrodka.
- Przegrany wyścig o slot dostaje komunikat o zajętości, nie surowy błąd; `concurrent_double_booking.sh` nadal daje dokładnie 1 sukces na 5 prób.
- `rls_isolation.sql` dowodzi, że jeździec widzi zajętość, ale nie tożsamość innych jeźdźców, a `anon` nie wywoła funkcji.
