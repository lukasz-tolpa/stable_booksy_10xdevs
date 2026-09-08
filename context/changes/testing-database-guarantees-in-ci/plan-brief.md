# Gwarancje bazodanowe w CI — Plan Brief

> Full plan: `context/changes/testing-database-guarantees-in-ci/plan.md`
> Research: `context/changes/testing-database-guarantees-in-ci/research.md`

## What & Why

Trzy dowody gwarancji bazodanowych — brak dubla konia, ochrona zapisów przed edycją grafiku, izolacja własności i ról — istnieją jako ręczne skrypty, których nikt nie uruchamia po każdej zmianie. Wdrażamy je jako bramkę CI na każdy push i PR, przepisujemy mutacje tak, by szły przez RLS jako persony (czyli tą ścieżką, którą idzie aplikacja), i wypełniamy test-plan §6.2 wzorcem „jak dodać test integracyjny bazy”. To faza 1 rolloutu z `test-plan.md` §3 (ryzyka #1, #2, #4).

## Starting Point

Gwarancje siedzą w Postgresie (indeks częściowy `bookings_active_slot_key`, trigger `SB001`/`SB002` + FK RESTRICT, polityki RLS na `auth.uid()`), a aplikacja tylko tłumaczy kody. Skrypty w `supabase/tests/` zwracają kody wyjścia i są niemal gotowe do CI, ale dwa z nich mutują jako `postgres` (RLS pominięte), a `ci.yml` nie stawia bazy. Research odsłonił dwie rozbieżności kod–PRD: odwołany zapis przypina konia do dnia przez FK, choć pre-check w aplikacji go ignoruje (częściowy zapis + mylący komunikat), i `toggle-active` z obcym `horseId` przekierowuje bez błędu.

## Desired End State

Każdy push uruchamia job `db-tests` (Postgres z migracjami i seedem, `npm run test:db`), a `deploy` czeka na niego. Skrypty dowodzą gwarancji jako Anna, Piotr i właściciel Pod Dębem, asertują SQLSTATE **i** `row_count` **i** stan po operacji, a każdy potrafi paść po sabotażu strażnika. Odwołany zapis świadomie przypina konia (PRD doprecyzowane, aplikacja odmawia przed zapisem), `toggle-active` odmawia widocznie, a §6.2 test-planu mówi, jak dodać kolejny test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Kształt harnessu | psql + bash przez `npx supabase db start`, runner `run_all.sh`, `npm run test:db` | Zero nowych zależności, skrypty już zwracają kody wyjścia, to stack z test-planu §4; pgTAP nie wyrazi współbieżności. | Plan |
| Odwołany zapis vs wypisanie konia | Zaakceptować: odwołany zapis przypina konia do dnia (historia zostaje); utrwalić testem, doprecyzować PRD, wyrównać pre-check w aplikacji | Bez zmiany schematu; komunikat i moment odmowy stają się prawdziwe. | Plan |
| Cichy sukces `toggle-active` | Naprawić tu wg wzorca cancel (`.select("id").maybeSingle()`) | 5 linii wg istniejącego wzorca; kryterium „żądanie jest odrzucone” staje się prawdziwe przed testem HTTP z Fazy 2. | Plan |
| Persona w skryptach #1/#2 | Mutacje jako persona (`set local role authenticated` + claims), setup jako `postgres` | Dowodzi osiągalności strażnika przez RLS i odróżnia „0 wierszy” od odmowy. | Research → Plan |
| Umiejscowienie bramki | Osobny job `db-tests`, `deploy.needs: [ci, db-tests]` | Lint/build i baza raportują niezależnie; deploy i tak zablokowany. | Plan |
| Polityka RLS UPDATE na `bookings` dla ośrodka | Zostaje bez zmian | PRD: ośrodek modyfikuje dane własnej stadniny; FR-009 daje odwołanie jeźdźcowi jako funkcję, nie zakaz; odmowa w `cancel.ts` to zachowanie endpointu → test HTTP w Fazie 2. | Research |
| Warstwa HTTP | Poza zakresem (Faza 2 rolloutu, §6.4) | Wymaga serwera Astro + GoTrue w CI; Faza 2 zaprojektuje harness pod Playwright. | Research → Plan |
| Oracle asercji | SQLSTATE + `row_count` + ponowny odczyt, nie komunikaty | Komunikaty są w unit testach; test bazy nie może być lustrem kodu. | Test-plan |

## Scope

**In scope:**
- `supabase/tests/run_all.sh`, `npm run test:db`, job `db-tests`, `deploy` czeka na oba
- Skrypt współbieżności jako Anna/Piotr przez RLS + ścieżka zwolnienia slotu
- Skrypt strażnika jako właściciel przez RLS, deterministyczny wybór dnia, przypadki z odwołanym zapisem, obcy właściciel → 0 wierszy
- Skrypt izolacji: jeździec → tabele ośrodka, ośrodek → INSERT zapisu, obce `schedule_days`/`schedule_day_horses`, odwołanie po `id`
- Pre-check wypisania konia liczy wszystkie zapisy; komunikat prawdziwy; unit testy `APP001`/`APP002`
- `toggle-active` z widoczną odmową
- PRD Open Question #2 doprecyzowane; test-plan §3/§4/§5/§6.2/§6.5; AGENTS.md

**Out of scope:**
- Migracje i zmiany polityk RLS (żadnych)
- Testy HTTP, serwer Astro/GoTrue w CI, Vitest integracyjny, pgTAP
- Transakcyjny RPC zapisu grafiku; `horses.active` a przydziały
- Hooki per-edit, Playwright (Fazy 2–3 rolloutu)

## Architecture / Approach

```
push/PR → [ci: lint, unit, build] ─┐
        → [db-tests: npx supabase db start → npm run test:db] ─┤→ [deploy]
                                     │
                run_all.sh ─ rls_isolation.sql ─ schedule_change_guardrails.sql ─ concurrent_double_booking.sh
                             (persona przez set local role + request.jwt.claims; setup jako postgres; rollback)
```

Każdy skrypt: setup jako `postgres` → mutacja jako persona → asercja na SQLSTATE, `row_count`, ponowny odczyt → `rollback` (lub sprzątanie w bashu). Każda faza kończy się sabotażem strażnika, który musi zaczerwienić test.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Runner i bramka CI | `run_all.sh`, `npm run test:db`, job `db-tests`, deploy czeka | Czas startu Postgresa na zimnym runnerze (nieweryfikowany, ~1–2 min) |
| 2. Ryzyko #1 pod RLS | Dwoje jeźdźców, `23505` + indeks, 1 aktywny, zwolnienie slotu | Bariera `pg_sleep` nie zsynchronizuje N procesów na wolnym runnerze → próby nie kolidują (test „przechodzi” trywialnie); sabotaż to wykryje |
| 3. Ryzyko #2 pod RLS | Właściciel edytuje, zapis nietknięty po odmowie, odwołany nie blokuje godzin / przypina konia, obcy → 0; pre-check + PRD + komunikat | Zmiana komunikatu i pre-checku dotyka UI ośrodka — weryfikacja manualna w aplikacji |
| 4. Ryzyko #4 | Nowe asercje izolacji; `toggle-active` odmawia widocznie | Brak testu HTTP na poprawkę — tylko manualnie do Fazy 2 |
| 5. Cookbook i dokumenty | §6.2, §3/§4/§5/§6.5 test-planu, AGENTS.md, plan sync | Wzorzec bash/SQL obcy kontrybutorom Vitest — §6.2 musi być samowystarczalne |

**Prerequisites:** Docker + `npx supabase start` lokalnie i świeży seed (`npx supabase db reset` tego samego dnia — runner to sprawdza); hostowy `psql` opcjonalny (bez niego runner używa `docker exec`); `gh` do obserwacji runów; commit `9130117` wypchnięty (permalinki w research).
**Estimated effort:** ~4–5 sesji, po jednej na fazę; Faza 1 najkrótsza, Faza 3 najdłuższa.

## Open Risks & Assumptions

- `npx supabase db start` na `ubuntu-latest` ładuje migracje i seed na świeżym wolumenie (potwierdzone w dokumentacji CLI), ale czas i stabilność na runnerze zmierzymy dopiero w Fazie 1.
- Zakładamy, że `set role authenticated` z sesji superusera egzekwuje RLS (tabele należą do `postgres`, `authenticated` nie jest właścicielem) — tak działa dziś `rls_isolation.sql`.
- Okno wyścigu między pre-checkiem a zapisem grafiku zostaje (decyzja archiwalna); test dowodzi strażnika bazy jako ostatniej linii, nie atomowości zapisu.
- Akceptacja „odwołany zapis przypina konia” to decyzja produktowa z tej sesji; jeśli w praktyce ośrodki będą chciały wypisywać konie z historią, potrzebna będzie osobna zmiana schematu (trigger zamiast FK RESTRICT) i aktualizacja przypadku 8.

## Success Criteria (Summary)

- Zielony run z jobami `ci`, `db-tests`, `deploy` po pushu; czerwony `db-tests` blokuje deploy.
- Każdy z trzech skryptów czerwieni się po sabotażu swojego strażnika (drop indeksu, drop triggera, RLS off) i zielenieje po `db reset`.
- Nowy kontrybutor dodaje asercję RLS z samego §6.2 test-planu, bez pytania nikogo.
