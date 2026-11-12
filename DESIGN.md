# DESIGN.md — Stable Booksy

System wizualny przeniesiony z marki „Horse to go" (eksport OpenDesign,
`horseToGo-FrontEnd-Tailwind/prototype/brand-spec.md` + `css/app.css`).
Zastępuje w całości dotychczasowy ciemny motyw startera. Jest źródłem prawdy
dla prototypów OpenDesign i dla implementacji w Astro + Tailwind 4 + shadcn/ui.

## 1. Kierunek

Equestrian, spokojny, prowadzony marką. Natura, zaufanie, powietrze. Jasny
motyw jako jedyny (bez dark mode). Leśna zieleń jako kolor marki, kasztan
(maść konia) jako jeden akcent na ekran, dużo bieli.

## 2. Kolory (OKLch)

```css
--bg: oklch(98% 0.008 150); /* mglista zieleń-biel, tło strony */
--surface: oklch(100% 0 0); /* karty */
--surface-2: oklch(96.5% 0.012 155); /* sekcje, pola formularzy */
--surface-3: oklch(93.5% 0.016 158); /* zajęty slot, wiersz nieaktywny */
--fg: oklch(24% 0.03 160); /* tekst główny */
--muted: oklch(50% 0.02 160); /* tekst pomocniczy */
--faint: oklch(64% 0.018 160); /* podpowiedzi, placeholder */
--border: oklch(90% 0.012 155);
--border-2: oklch(85% 0.014 155);

--primary: oklch(45% 0.1 162); /* leśna zieleń marki: CTA, linki, aktywne */
--primary-strong: oklch(38% 0.1 162); /* hover, logo */
--primary-soft: oklch(95% 0.025 160); /* tło badge „Ośrodek", aktywna zakładka */
--primary-tint: oklch(90% 0.04 160);

--accent: oklch(56% 0.11 52); /* kasztan: max 1–2 użycia na ekran, WYPEŁNIENIA */
--accent-soft: oklch(94% 0.03 60); /* tło badge „Jeździec", „Twój zapis" */
--accent-ink: oklch(48% 0.12 52); /* TEKST kasztanowy: --accent na --accent-soft to 4,0:1 */

--success: oklch(58% 0.13 150);
--success-soft: oklch(94% 0.04 150); /* banner „Zapisano na jazdę." */
--success-ink: oklch(42% 0.11 150); /* tekst na --success-soft */
--warn: oklch(70% 0.13 75);
--warn-soft: oklch(95% 0.05 80);
--warn-ink: oklch(45% 0.1 70); /* tekst stanu awarii */
--danger: oklch(56% 0.18 25); /* obrys i pasek bannera */
--danger-soft: oklch(56% 0.18 25 / 0.1);
--danger-ink: oklch(42% 0.16 25); /* TEKST błędu, „Odwołaj" (ghost) */
```

Role: **Ośrodek** = `--primary-strong` na `--primary-soft`. **Jeździec** = `--accent-ink`
na `--accent-soft`. Badge roli w topbarze i na kartach ról landingu.

Warianty `-ink` to jedyne dopuszczone kolory **tekstu** na miękkich tłach — pełne
`--accent` / `--danger` / `--warn` zostają dla wypełnień, obrysów i pasków bannera.
`--faint` służy wyłącznie do placeholderów i wyłączonych kontrolek (3,2:1 na `--bg`);
tekst pomocniczy idzie na `--muted`.

## 3. Typografia

- Display (h1, h2, przyciski, logo): **Plus Jakarta Sans** 700/800,
  `letter-spacing: -0.02em`, `line-height: 1.1`.
- Body: **Inter** 400/500/600, 16 px, `line-height: 1.55`.
- Dane (godziny, daty, zakres „10–14"): `ui-monospace`, `tabular-nums`.
- Eyebrow (mały nagłówek sekcji): mono 12 px, uppercase, `letter-spacing:
0.16em`, kolor `--primary`.
- Skala: h1 `clamp(30px, 4vw, 44px)`, h2 24–28 px, h3 18 px, tekst
  pomocniczy 13–14 px `--muted`.
- Fonty z Google Fonts (`preconnect` + jeden `<link>`), fallback `system-ui`.

## 4. Kształt i przestrzeń

- Promienie: karty 18 px (`--r-lg`), pola i przyciski drugorzędne 12 px,
  przyciski główne pigułka 999 px, badge 999 px.
- Bordery hairline 1 px `--border`; cień tylko na kartach interaktywnych
  (`--shadow-sm`) i overlayach.
- Kontener treści `max-width: 880px` (`container-narrow`), gutter 24 px;
  landing `max-width: 1200px`.
- Topbar sticky 68 px, białe tło z `backdrop-filter: blur(14px)`, hairline
  na dole. Logo „Stable Booksy" w `--primary-strong`, 800.
- Mobile-first 390 px: jedna kolumna, przyciski `btn-block`, siatka slotów
  zawija się.

## 5. Komponenty

| Komponent            | Wygląd                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Przycisk primary     | tło `--primary`, biały tekst, pigułka, `--shadow-sm`; hover `--primary-strong`                                                                                                                                                                    |
| Przycisk ghost       | tło `--surface`, border `--border-2`; np. „Zaloguj się" obok „Załóż konto"                                                                                                                                                                        |
| Przycisk accent      | tło `--accent`; wyłącznie jedno CTA na ekran (np. slot do rezerwacji po najechaniu, „Zapisz grafik")                                                                                                                                              |
| Karta                | `--surface`, border, 18 px, padding 22 px                                                                                                                                                                                                         |
| Pole formularza      | etykieta 13 px 600 nad polem, pole 12 px radius, tło `--surface`, focus ring `--primary` 2 px                                                                                                                                                     |
| Checkbox listy koni  | wiersz jako karta 12 px, checkbox po lewej, nazwa konia 500                                                                                                                                                                                       |
| Nawigacja dniami     | pasek z „‹ Poprzedni", datą w mono na środku, „Następny ›" po prawej; linki w `--primary`                                                                                                                                                         |
| Slot wolny           | przycisk ghost z nazwą konia; hover tło `--primary-soft`                                                                                                                                                                                          |
| Slot zajęty          | ten sam kształt, tło `--surface-3`, tekst `--muted`, bez obrysu i cienia; renderowany jako `<span aria-disabled>`, **nigdy** `<button disabled>` — `e2e/booking-refusal.spec.ts` wymaga zera trafień dla `getByRole("button", { name: "<koń>" })` |
| Slot „Twój zapis"    | tło `--accent-soft`, tekst `--accent`, ikona check; tekst „Bella — Twój zapis"                                                                                                                                                                    |
| Badge roli           | pigułka 12 px, patrz §2                                                                                                                                                                                                                           |
| Banner sukces / błąd | pełna szerokość kontenera, `--success-soft` lub `--danger` na 10 % z lewym paskiem 3 px                                                                                                                                                           |
| Pusty stan           | jedno zdanie `--muted` w karcie, opcjonalny link w `--primary`                                                                                                                                                                                    |
| Stan awarii          | karta z `--warn-soft` i zdaniem po polsku                                                                                                                                                                                                         |

## 6. Landing

Pełnoszerokie zdjęcie konia na łące jako hero (jak w Horse to go), nakładka
gradient z bieli po lewej dla czytelności tekstu. Eyebrow, h1 „Stable
Booksy", jedno zdanie, dwa przyciski (primary „Załóż konto", ghost „Zaloguj
się"). Pod hero dwie karty ról z badge w kolorze roli. Bez sekcji „jak to
działa", cennika, opinii, stopki z linkami — to MVP.

## 7. Zasady

- Język polski wszędzie. Ikony tylko lucide-react, tylko przy etykiecie.
- Akcent kasztanowy maks. 2 razy na ekran.
- Bez animacji poza hover/focus (150 ms).
- Semantyka HTML zachowana: h1/h2, `<button>`, `<a>`, `<label for>`, `<ul><li>`.
  Testy E2E lokalizują elementy przez `getByRole` / `getByLabel`.
- Teksty przycisków, nagłówków i etykiet są kontraktem (lista w
  `context/foundation/test-plan.md` §6.3 i w `e2e/*.spec.ts`), nie zmieniamy ich.

## 8. Implementation notes

How the system above is wired into the code. Written for agents, hence English.

- **No dark mode.** `global.css` carries no `.dark` block and no `@custom-variant dark`, and `Layout.astro` pins `<meta name="color-scheme" content="light">`.
- **Tokens live once**, in `src/styles/global.css`. `:root` holds the §2 names verbatim (`--surface`, `--muted`, `--primary`, `--accent`, …), so prototypes read 1:1 and `<style>` blocks use `var(--…)`. `@theme` carries typography and radii as literal values; `@theme inline` re-exports the palette as Tailwind utilities. `scripts/check-tokens.mjs` (part of `npm run lint`) rejects colour and font literals anywhere else; a new colour gets a token here.
- **Two name collisions with shadcn.** shadcn's `--muted` and `--accent` are _background_ colours; this document's are _text_ and _chestnut_. So `bg-muted` / `bg-accent` keep the shadcn meaning, helper text is `text-muted-foreground`, and chestnut is `bg-chestnut` / `bg-chestnut-soft` / `text-chestnut-ink`. A name from §2 is never mapped onto a shadcn utility.
- **Shared blocks** live in `src/components/ui/`: `Card`, `EmptyState`, `FailureState`, `RoleBadge`, `DayNav`, `BarChart`, next to the shadcn components ("new-york" style, added with `npx shadcn@latest add [name]`).
- **Charts** are `BarChart.astro`: server-rendered HTML + CSS bars, no charting library and no client JavaScript, so it runs unchanged on workerd SSR. `orientation` is `vertical` for time series and `horizontal` for rankings. The series comes ready from the view model; the component computes only its axis scale. The drawing is `aria-hidden` and the same data sits in a `<details>` table ("Pokaż dane wykresu w tabeli"). Single series: `--primary` bars, a 2 px `--border-2` stub for zero, mono `--muted` labels, no chestnut.
- **Astro scoped styles stop at a child component's root.** `.foo h1` works when the markup sits in the page; to style a `<Card>` from outside, pass Tailwind utilities (`class="w-full max-w-[420px]"`) or wrap the slot content in your own element.
- **Chestnut today** (cap of two per screen, §7): the rider `RoleBadge`, the own-booking slot pill and the "Zapisz grafik" button.
- **Prototypes** in `context/changes/ui-redesign/design/*.html` are the geometry contract, not code to copy. They use container queries against a fake `.app` wrapper; the app has no such wrapper, so the same breakpoints are media queries.
- **Screenshots.** `scripts/shots.mjs` captures every screen at 390 px and 1440 px into `shots/` (gitignored) against a running preview; run `npm run db:demo` first so the statistics page has data. It sits outside `e2e/` so the suite never collects it. `scripts/hero.mjs` documents how `public/hero.webp` was produced.
