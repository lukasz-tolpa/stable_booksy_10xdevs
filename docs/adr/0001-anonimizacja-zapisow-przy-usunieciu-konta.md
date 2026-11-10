---
status: accepted
---

# Usunięcie konta jeźdźca anonimizuje jego przeszłe zapisy zamiast je kasować

Statystyki ośrodka (godziny jazd, obciążenie koni, obłożenie grafiku, odwołania) liczone są z zapisów, więc skasowanie zapisów razem z kontem jeźdźca zmieniałoby wstecz liczby za minione okresy. Dlatego usunięcie konta odpina osobę od jej przeszłych zapisów — jazd i odwołań — które zostają w danych ośrodka jako należące do jeźdźca zanonimizowanego; przyszłe aktywne zapisy są kasowane i zwalniają sloty.

## Considered Options

- **Kasowanie zapisów razem z kontem** (stan sprzed tej decyzji) — odrzucone: ośrodek traci historię, na której opiera statystyki.
- **Osobny pseudonim na każdego usuniętego jeźdźca** („Jeździec usunięty #1") — odrzucone: zachowany wzorzec jazd pozwala ośrodkowi rozpoznać osobę, więc to pseudonimizacja, nie anonimizacja.

## Consequences

- W statystykach wszyscy zanonimizowani jeźdźcy widnieją razem, w jednym wierszu „Usunięci jeźdźcy"; statystyk na osobę nie da się dla nich odtworzyć.
- Zapis może nie mieć jeźdźca. Każde miejsce, które pokazuje jeźdźca przy zapisie, musi obsłużyć ten przypadek.
- Decyzja dotyczy reguły danych. Ekran usuwania konta przez jeźdźca nie jest jej częścią.
