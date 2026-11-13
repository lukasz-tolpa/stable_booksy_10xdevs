---
status: accepted
---

# Produkt nazywa się getona.horse

Dotychczasowa nazwa „Stable Booksy” była roboczym zlepkiem („stajnia” + cudza marka rezerwacji) i nie miała własnego adresu. Zmieniamy ją na **getona.horse**: nazwa jest adresem, a adres czyta się jako zdanie „get on a horse”, czyli dokładnie to, co produkt umożliwia. W tekście piszemy ją zawsze małymi literami i z kropką. Aplikacja zostaje po polsku — angielska jest tylko nazwa.

Logo to ten sam napis w dwóch układach z żywego tekstu: zwarty „getona.horse” w górnym pasku i pełny, dwuwierszowy „get on a / .horse” na ciemnej zieleni w stopce strony głównej. Końcówka „.horse” jest kasztanowa; ikoną zostaje biała głowa konia na zieleni.

## Considered Options

- **Dosiad** (`dosiad.pl`, `dosiad.app`) — odrzucone: termin jeździecki trafny dla „miejsca”, ale zrozumiały tylko po polsku, a właściciel chciał nazwy czytelnej poza Polską.
- **stable.horse** — odrzucone: krótsza i w tej samej cenie, ale mówi o miejscu, a nie o tym, co robi użytkownik; zostawiałaby też skojarzenie ze starą nazwą.
- **ride.horse** — odrzucone: domena premium, 2 000,20 USD za pierwszy rok (Cloudflare Registrar, 2026-11-13) wobec 25,20 USD za `getona.horse`.
- **Krótkie słowa jeździeckie** (siodło, padok, wolta, galopem, konno; Ridely, Stablo, SaddleUp) — odrzucone: zajęte we wszystkich sprawdzanych końcówkach.
- **bookmy.horse** — odrzucone: obiecuje rezerwację konia, a jeździec zapisuje się na miejsce u instruktora i konia przydziela ośrodek (ADR-0002).

## Consequences

- Nazwa ma sens tylko razem z domeną, więc zmiana w aplikacji trafia na produkcję dopiero po zakupie `getona.horse`. Podpięcie domeny jest osobnym krokiem; adres `workers.dev` działa równolegle.
- Nazwy techniczne zostają: worker `stable-booksy` na Cloudflare i repozytorium `stable_booksy_10xdevs`. Zmiana nazwy workera zmieniłaby adres produkcji, a użytkownik tych nazw nie widzi.
- Dokumenty historyczne w `context/` oraz `idea.md` zachowują starą nazwę; zmieniają się tylko dokumenty żywe.
- „getona” samo w sobie nie jest słowem. Dlatego pełne logo rozbija je na „get on a”, a układ zwarty występuje tylko tam, gdzie na pełny nie ma miejsca.
- Logo wymusza trzy wyjątki w systemie wizualnym: nie liczy się do limitu użyć kasztanu na ekran, dodaje jeden token jasnego kasztanu wyłącznie na ciemną zieleń i czyni stopkę strony głównej drugim ciemnym tłem obok połowy ośrodka.
