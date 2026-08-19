<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-04 — Rezerwacja jazdy (slot-booking-flow)

- **Plan**: `context/changes/slot-booking-flow/plan.md`
- **Scope**: Phases 1–3 of 3 (cały plan)
- **Date**: 2026-08-19
- **Verdict**: APPROVED (wszystkie findings rozstrzygnięte w triage)
- **Findings**: 0 critical, 1 warning, 2 observations — wszystkie FIXED

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING (addendum, patrz F2) |
| Safety & Quality | WARNING (naprawione w triage) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Zakres i weryfikacja

Commity `b69a30d` (p1) → `37e5322` (p2) → `8079f71` (p3) → `71f079a` (epilog) + `a. fix` z tego przeglądu. Agent driftu: **pełny MATCH we wszystkich 3 fazach**, zero MISSING, granice „What We're NOT Doing" respektowane (brak odwołań, „moich zapisów", kroku potwierdzenia, zmian RLS). Semantyka progu minionych godzin identyczna między stroną a endpointem (ten sam komparator `<=`, to samo `currentWarsawHour`, Europe/Warsaw); przejście przez północ kończy się bezpieczną odmową.

Kryteria automatyczne: `npm test` (99), `npm run lint`, `npm run build`, `concurrent_double_booking.sh` (1/5 sukcesów), `rls_isolation.sql` (komplet PASS) — zielone. Kryteria manualne 3.4–3.9 potwierdzone ręcznie przez użytkownika na seedzie.

Bezpieczeństwo — czyste: zero XSS (domyślne escapowanie Astro, brak `set:html`), zero open redirect (`stableId` zawsze numeryczne), `rider_id` wyłącznie z sesji z obroną w głąb (polityka INSERT + złożony FK + trigger + częściowy indeks), RPC `security definer` z `search_path=''` i odciętym `anon`.

Uwagi bez akcji: plan błędnie opisywał kanon endpointu jako zawierający `prerender = false` — kanon (`save.ts`) go nie ma, bo `output: "server"`; brak jawnego sprawdzenia roli w endpoincie jest zgodny z kanonem (RLS odrzuca konto ośrodka z komunikatem fallback); `formData()` poza try/catch — identycznie jak w kanonie; zajętość slotów jest enumerowalna przez każdego zalogowanego — świadome, udokumentowane w migracji.

## Findings

### F1 — getMyBookings: komentarz obiecywał więcej, niż RLS daje

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/lib/bookings/queries.ts:22-38`
- **Detail**: Komentarz twierdził, że RLS przycina do własnych wierszy, ale polityka SELECT to own-OR-my-stable — sesja ośrodka pytająca o ten sam `schedule_day_id` dostałaby zapisy wszystkich jeźdźców i funkcja zgłosiłaby je jako „moje". Dziś bezpieczne (jedyny caller za middlewarem roli rider), ale gwarancja żyła dwie warstwy od funkcji — mina pod S-05/S-06.
- **Fix**: Dodany parametr `riderId: string` + jawny `.eq("rider_id", riderId)`; caller przekazuje `user.id`; komentarz opisuje teraz prawdziwy powód filtra.
- **Decision**: FIXED

### F2 — Nieplanowana nawigacja poprzedni/następny dzień

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/pages/jezdziec/osrodki/[id].astro:124-147`
- **Detail**: Plan przewidywał tylko formularz GET z polem daty; pasek Poprzedni/Następny (wzorzec nawigacji z `grafik.astro`, z blokadą cofania w przeszłość) to dodatek. Nie narusza granicy „chipów dostępności" (nie pokazuje dostępności).
- **Fix**: Pozostawiony świadomie — niniejszy wpis stanowi addendum planu: nawigacja dzienna jest częścią dowiezionego UI.
- **Decision**: FIXED (addendum, bez zmian w kodzie)

### F3 — Ścieżka supabase/user null renderowała „Nie znaleziono"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/jezdziec/osrodki/[id].astro:34`
- **Detail**: Przy poprawnym `id`, ale braku klienta Supabase/sesji, strona pokazywałaby „Nie znaleziono takiego ośrodka" — kłamstwo o awarii konfiguracji. W praktyce nieosiągalne przez middleware, ale kruche wobec zmian mapy tras.
- **Fix**: Gałąź `else if (id !== null) { loadFailed = true; }` z komentarzem — awaria konfiguracji renderuje stan błędu.
- **Decision**: FIXED

## Stan po triage

`npm test` (99), `npm run lint`, `npm run build` — zielone po poprawkach.
