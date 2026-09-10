# Follow-up: dług po przeglądzie implementacji `ui-redesign`

Zebrane z `reviews/impl-review.md` (2026-09-10). Nic z tego nie blokuje scalenia —
to porządki do zrobienia przy następnej pracy nad warstwą widoku.

## 1. Duplikacja CSS między stronami (F2) — największa pozycja

Bloki `<style>` stron urosły z 1056 do 1819 linii, a `global.css` ma 176 linii i trzy
utility. Warstwa wspólna jest niedoinwestowana względem tego, ile powtarzają strony.

**Reguły powtórzone dosłownie:**

| Reguła                 | W ilu plikach |
| ---------------------- | ------------- |
| `.page`                | 7             |
| `.page-lead`           | 5             |
| `.lead`                | 4             |
| `.eyebrow`             | 4             |
| `.authwrap`            | 3             |
| `.switch` + trzy stany | 2             |
| `.back` + dwa stany    | 2             |
| rodzina `.rows`        | 2 (6 reguł)   |

**Przycisk drugorzędny napisany od zera sześć razy**, za każdym razem pod inną nazwą:
`.btn-ghost` (`jezdziec/index.astro:108`), `.daypick button` (`jezdziec/osrodki/[id].astro:292`),
`.links a` (`osrodek/index.astro:73`), `.horse button` (`osrodek/konie.astro:169`),
`.row__action button` (`jezdziec/zapisy.astro:277`), `.row button`
(`components/stables/StableFilter.astro:77`). Siódmy wariant, `.btn--ghost`
(`index.astro:253`), to ta sama idea w skali `lg`.

**Kolejność według zwrotu z inwestycji:**

1. `src/components/ui/BookingRow.astro` — wiersz listy zapisów jest identyczny na dwóch
   ekranach, różni się tylko obecnością kolumny akcji. Kasuje 6 reguł razy 2 pliki.
   Komentarz w `osrodek/zapisy.astro:136` sam to przyznaje.
2. `src/components/ui/Button.astro` z wariantami `primary`/`ghost`, rozmiarami `md`/`lg`
   i propem `as` (część selektorów celuje w `<a>`, część w `<button>`). Kasuje sześć
   równoległych definicji i niespójność `.btn--ghost` kontra `.btn-ghost`.
3. `@utility page`, `page-lead`, `eyebrow`, `lead` w `global.css` — kasuje 16 wystąpień.
   Rozważyć scalenie `lead` i `page-lead`: to ten sam byt semantyczny w dwóch skalach
   (14,5 px w karcie auth, 15,5 px na ekranie aplikacji).

## 2. Karta jako odnośnik (F7)

`src/components/ui/Card.astro:13` dopuszcza w propie `as` tylko `"div" | "section" |
"article" | "aside"`, więc `StableCard.astro:26-33` odtwarza powierzchnię karty ręcznie.
Do wyboru: rozszerzyć unię o `"a"` z opcjonalnym `href`, albo świadomie udokumentować
w `Card.astro`, że karty-linki stoją poza komponentem.

## 3. Skala nagłówków i nieużywane narzędzie (F9)

`h1` jest przedefiniowany w dziewięciu plikach w trzech rozmiarach: 26 px na kartach
auth, 32 px na ekranach aplikacji i 30 px w dwóch miejscach (`osrodek/index.astro:51`
oraz `.stable h1` w `jezdziec/osrodki/[id].astro:244`). Trzecia wartość wygląda na
przypadkową. `@layer base` w `global.css` ustawia już dla `h1,h2,h3` krój, wagę
i interlinię — brakuje tylko rozmiaru, więc skala ma gdzie zamieszkać.

Utility `mono-nums` jest użyte trzy razy, przy sześciu ręcznych powtórzeniach jego
treści (`font-family: var(--font-mono); font-variant-numeric: tabular-nums`) w blokach
`<style>`: `components/ui/DayNav.astro:37`, `jezdziec/osrodki/[id].astro:278` i `:339`,
`jezdziec/zapisy.astro:221`, `osrodek/zapisy.astro:157`.

## 4. Ikony dekoracyjne bez `aria-hidden`

Nie jest to regresja — na `main` nie było ani jednego `aria-hidden`, na gałęzi jest
siedem. Pozostałe ikony z `lucide-react` nadal go nie mają (około trzydziestu pięciu
wystąpień). Warto domknąć przy okazji wydzielania `Button.astro`, bo ikony wchodzą tam
przez slot.

## 5. Zdjęcie hero (F4) — do decyzji, nie do kodu

`change.md` wymagał „replace **or** compress before shipping". Wykonano kompresję,
nie podmianę. Pochodzenie i licencja zdjęcia z eksportu OpenDesign pozostają
niepotwierdzone, a repozytorium jest publiczne i scalenie wystawia plik na produkcję.
To jedyna pozycja z przeglądu, którą warto rozstrzygnąć **przed** scaleniem.
