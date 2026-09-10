<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: UI redesign in the Horse to go visual system

- **Plan**: `context/changes/ui-redesign/plan.md`
- **Scope**: fazy 1–7 (pełny plan)
- **Date**: 2026-09-10
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 krytycznych, 5 ostrzeżeń, 4 obserwacje

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Weryfikacja kryteriów sukcesu

Wszystkie 29 automatycznych wierszy `## Progress` uruchomione ponownie w dniu przeglądu:

| Sprawdzenie                                                         | Wynik                     |
| ------------------------------------------------------------------- | ------------------------- |
| `npm run lint`, `npm run check`, `npm test`                         | 0 błędów, 225/225 testów  |
| `npx playwright test`                                               | 5/5                       |
| grep na `bg-cosmic` / `Welcome.astro` / `LibBadge` / `template.png` | brak trafień              |
| godzina jako samodzielne `"{h}:00"` (sloty i lista ośrodka)         | zmierzone na żywo, zgodne |
| myślnik U+2014 w `— Twój zapis`                                     | potwierdzony bajtowo      |
| `name="horseIds"` niezmienione względem `main`                      | 1 = 1                     |
| pięć wysp z `client:load`                                           | zgodne                    |
| `npx prettier --check` na zmienionych dokumentach                   | czyste                    |
| bramki PR #21 (`ci`, `db-tests`, `e2e`)                             | zielone, stan `MERGEABLE` |

Pozycja 7.5 (scalenie) świadomie wstrzymana decyzją właściciela repozytorium.
Pozycje manualne pozostają nieodhaczone — żadna nie została podbita bez dowodu.

Dodatkowo, poza planem: 25 tokenów kolorystycznych z `DESIGN.md` §2 zgadza się co do
wartości z `global.css`; 12 par tekst-tło przeliczone pod kątem kontrastu (11 spełnia
AA, jedna wypadła poniżej — finding F5); wszystkie 12 ekranów mają zrzuty w 390 px
i 1440 px, w tym `osrodek/nowa-stadnina` uchwycony przez założenie konta ośrodka
bez stadniny.

## Findings

### F1 — Tryb ciemny wrócił bocznymi drzwiami

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — decyzja oczywista, poprawka wąska
- **Dimension**: Scope Discipline
- **Location**: `src/components/ui/button.tsx:8,22,24,26`
- **Detail**: Faza 1 usunęła `@custom-variant dark (&:is(.dark *))`, który wiązał wariant
  z klasą `.dark`. Wbudowany wariant Tailwinda 4 to `@media (prefers-color-scheme: dark)`,
  więc cztery pozostawione klasy `dark:` zaczęły być kompilowane na serio. Potwierdzone
  w zbudowanym arkuszu: `dist/client/_astro/Layout.*.css` zawierał blok
  `@media (prefers-color-scheme: dark)`. Praktyczny efekt zerowy (dotyczy wariantów
  `destructive`/`outline`/`ghost`, których aplikacja nie renderuje, oraz `aria-invalid`,
  którego nie ustawia), ale brief zakazuje trybu ciemnego, a sekcja Design w `AGENTS.md`
  twierdzi wprost, że go nie ma.
- **Fix**: usunąć cztery klasy `dark:` i zostawić w pliku ostrzeżenie dla przyszłego
  `npx shadcn add`.
- **Decision**: FIXED

### F2 — Duplikacja arkuszy stylów między stronami

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis
- **Dimension**: Pattern Consistency
- **Location**: 12 plików w `src/pages`
- **Detail**: Policzone niezależnie: reguła `.page` powtórzona w 7 plikach, `.page-lead`
  w 5, `.lead` w 4, `.eyebrow` w 4, przycisk drugorzędny napisany od zera pod sześcioma
  różnymi selektorami (`.btn-ghost`, `.daypick button`, `.links a`, `.horse button`,
  `.row__action button`, `.row button`), rodzina `.rows` zdublowana między dwoma ekranami
  list (6 reguł identycznych). `global.css` ma 176 linii i 3 utility, a bloki `<style>`
  stron urosły z 1056 do 1819 linii. Do usunięcia około 35 reguł.
- **Fix**: wydzielić `BookingRow.astro`, `Button.astro` (warianty primary/ghost,
  rozmiary md/lg, prop `as`) oraz utility `page` / `page-lead` / `eyebrow` / `lead`.
- **Decision**: SKIPPED — zapisane jako dług w `follow-ups/review-fixes.md`

### F3 — Nowa treść wbrew zapisowi briefu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline
- **Location**: `src/pages/index.astro`, `src/pages/auth/*.astro`, `src/components/Topbar.astro`
- **Detail**: `change.md` mówi „No new features, fields, routes or copy", a przybyło
  trzynaście napisów widocznych dla użytkownika: nadpisy („Konto", „Stadnina", „Dwie role"),
  zdania wprowadzające na obu ekranach auth, opisy i przykładowe dane na kartach ról
  („10–14 · 4 sloty na konia", „11:00 · Bella"), tekst alternatywny zdjęcia oraz nazwa
  landmarku „Wybór dnia". Sprzeczność jest w dokumentach, nie w kodzie: kontrakty faz 2
  i 3 same zamawiały zdanie wprowadzające i karty ról. Wada planu, nie implementacji.
- **Fix**: uznać odstępstwo za świadome i odnotować je w briefie.
- **Decision**: ACCEPTED — odnotowane w tym raporcie

### F4 — Zdjęcie hero to wciąż placeholder

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Safety & Quality
- **Location**: `public/hero.webp`
- **Detail**: `change.md:16` mówi wprost: „placeholder photo, **replace or compress**
  before shipping". Wykonano kompresję (2,12 MB PNG → 122 KB webp), ale nie podmianę.
  Repozytorium jest publiczne, a scalenie do `main` wystawia zdjęcie na produkcję przez
  Cloudflare Workers Builds. Pochodzenie i licencja pozostają niepotwierdzone.
- **Fix**: potwierdzić licencję albo podmienić na zdjęcie o znanym pochodzeniu przed
  scaleniem PR #21.
- **Decision**: PENDING — decyzja właściciela repozytorium

### F5 — Tekst informacyjny poniżej progu kontrastu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: `src/pages/osrodek/grafik.astro:201`
- **Detail**: Przypis „Pola wypełniono wartościami z ostatnio ułożonego dnia" używał
  `--faint`, co na tle strony daje 3,33:1 — poniżej AA dla tekstu 13 px. Pozostałe
  jedenaście przeliczonych par przechodzi. Trzy inne użycia `--faint` są nieszkodliwe:
  dwa to podpowiedzi w polach, jedno to wyłączony kierunek dnia (WCAG 1.4.3 zwalnia
  nieaktywne kontrolki).
- **Fix**: zamienić na `--muted` (5,62:1).
- **Decision**: FIXED

### F6 — Zmiana zachowania poza zakresem wizualnym

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Scope Discipline
- **Location**: `src/pages/index.astro:18`
- **Detail**: Strona główna czyta `Astro.locals` i renderuje inne wezwanie do działania
  dla zalogowanego. To poprawka błędu zgłoszonego przez właściciela repozytorium
  (commit `791abd5`), ale wykracza poza deklarację „visual-only". Błąd był zastany —
  stary `Welcome.astro` też pokazywał „Sign In"/„Sign Up" niezależnie od sesji.
- **Decision**: ACCEPTED

### F7 — Komponent karty nie przyjmuje odnośnika

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architecture
- **Location**: `src/components/ui/Card.astro:13`
- **Detail**: Prop `as` dopuszcza tylko `"div" | "section" | "article" | "aside"`, więc
  `StableCard.astro:26-33` odtwarza powierzchnię karty ręcznie (`--surface`, `--border`,
  `--r-lg`, `--shadow-sm`). To jedyne powtórzenie wynikające z ograniczenia komponentu.
- **Decision**: SKIPPED — w `follow-ups/review-fixes.md`

### F8 — Lista wewnątrz formularza grafiku

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: `src/components/schedule/ScheduleDayForm.tsx:137`
- **Detail**: Karty koni owinięto w `<ul>`/`<li>`, co dokłada elementy o roli `listitem`
  na ekranie grafiku, gdzie wcześniej ich nie było. Dziś nieszkodliwe — żaden scenariusz
  e2e nie sięga tam po `getByRole("listitem")`. Warto pamiętać przy dopisywaniu testów
  dla ekranu ośrodka.
- **Decision**: ACCEPTED

### F9 — Niespójne skale i nieużywane narzędzie

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: 9 plików w `src/pages`, `src/styles/global.css:173`
- **Detail**: Nagłówek `h1` przedefiniowany w 9 plikach w trzech rozmiarach (26 px na
  kartach auth, 32 px na ekranach aplikacji, 30 px w dwóch miejscach — wygląda na
  przypadkową trzecią wartość). Utility `mono-nums` użyte 3 razy, przy 6 ręcznych
  powtórzeniach jego treści w blokach `<style>`.
- **Decision**: SKIPPED — w `follow-ups/review-fixes.md`

## Czego przegląd szukał i nie znalazł

- **Wstrzyknięcia HTML**: zero. W `src/` nie ma ani jednego `set:html`,
  `dangerouslySetInnerHTML` ani `innerHTML`. Parametr `?error=` renderuje się jako tekst
  w obu ścieżkach (`Banner.astro`, `ServerError.tsx`).
- **Nowa ekspozycja danych**: zero. Frontmatter każdej zmienionej strony jest identyczny
  z `main` poza importami komponentów. `getMyBookings` nadal zawężone do własnego
  `user.id`, `getOwnedStableId` nadal bramkuje ekran zapisów ośrodka.
- **Utracone pola formularzy**: zero. 10 pól `hidden` na `main`, 10 na gałęzi, ten sam
  zestaw nazw i wartości.
- **Naruszenie granic zakresu**: żaden plik spod `src/pages/api/`, `src/lib/`,
  `src/middleware.ts`, `supabase/`, `e2e/` ani `playwright.config.ts` nie został tknięty.
- **Utracone napisy kontraktowe**: zero. Każdy ciąg lokalizowany przez suitę e2e
  występuje i na `main`, i na gałęzi.
- **Osierocone klasy po `tw-animate-css`**: zero. Jedyna animacja w kodzie to
  `animate-spin` z rdzenia Tailwinda.

Jedna rzecz wypadła lepiej, niż wymagał brief: na `main` nie było ani jednego
`aria-hidden`, na gałęzi jest siedem. Redesign poprawił dostępność ikon zamiast ją
naruszyć, choć pozostałe ikony dekoracyjne nadal go nie mają.
