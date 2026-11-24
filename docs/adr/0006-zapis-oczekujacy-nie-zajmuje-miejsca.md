---
status: proposed
---

# Zapis oczekujący nie zajmuje miejsca

Zapis jeźdźca czeka na przyjęcie przez ośrodek. Miejsce w slocie zajmuje dopiero przyjęcie: na jedno wolne miejsce może czekać kilku jeźdźców, ośrodek wybiera, kogo przyjąć, przyjęcie ponad limit miejsc jest odmawiane, a po zapełnieniu slotu pozostałe zapisy oczekujące są odrzucane same z powodem „Brak miejsc”. Konto w getona.horse zakłada się bez kosztu, więc gdyby zapis oczekujący trzymał miejsce, konkurencyjny ośrodek mógłby fałszywymi kontami zablokować cały grafik do czasu, aż ośrodek odrzuci każdy zapis z osobna.

## Considered Options

- **Zapis oczekujący zajmuje miejsce** (kto pierwszy kliknie, ten trzyma miejsce) — odrzucone: daje jeźdźcowi pewność miejsca, ale fałszywe konta blokują sloty, a limity na konto nic nie dają przy darmowych kontach.
- **Zapis oczekujący zajmuje miejsce z krótkim czasem ważności albo z blokadą jeźdźców** — odrzucone: łata to samo nadużycie dodatkowymi regułami, a i tak blokuje miejsca do czasu reakcji ośrodka.

## Consequences

- Kliknięcie „Zapisz się” nie gwarantuje miejsca; jeździec widzi zapis jako „Czeka na przyjęcie”.
- Wszędzie, gdzie liczą się zajęte miejsca (wolne miejsca, limit przy zmianie grafiku, zajętość placów, obłożenie, rozliczenia), liczą się tylko zapisy aktywne.
- Zapisy oczekujące nie blokują zmian grafiku: gdy slot zniknie albo dostanie limit zero, są odrzucane same.
- Liczbę oczekujących na slot rekreacyjny widzi tylko ośrodek, żeby fałszywe konta nie zniechęcały jeźdźców; na slot treningowy widzą ją też pensjonariusze, których nie da się podrobić.
