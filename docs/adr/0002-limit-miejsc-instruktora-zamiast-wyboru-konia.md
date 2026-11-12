---
status: accepted
---

# Jeździec zapisuje się na miejsce u instruktora, a konia przydziela ośrodek

Pierwotnie slot był parą koń × godzina i jeździec sam wybierał konia, więc o tym, ile osób jeździ w danej godzinie, decydowała wyłącznie liczba koni pracujących tego dnia. Ośrodek nie miał jak powiedzieć, ilu jeźdźców instruktor jest w stanie poprowadzić. Odwracamy to: slot jest godziną jednego instruktora z limitem miejsc ustawianym przez ośrodek, jeździec zapisuje się na wolne miejsce, a konia przydziela mu ośrodek — przed jazdą albo po niej. Ośrodek zyskuje też prawo odwołania dowolnego zapisu przed terminem.

## Considered Options

- **Dwa tryby do wyboru przez ośrodek** (wybór konia albo limit miejsc) — odrzucone: dwie reguły alokacji, dwa interfejsy zapisu i podwójne testy dla jednego produktu.
- **Instruktor jako trzecia rola z własnym kontem** — odrzucone: dokłada rolę do rejestracji i kontroli dostępu, a nie daje nic, czego ośrodek nie ustawi za instruktora.
- **Koń całkowicie poza aplikacją** — odrzucone: znikają statystyki obciążenia koni i jazd jeźdźca na danym koniu.
- **Kontrola liczby koni przy każdym zapisie** — odrzucone na rzecz reguły przy układaniu grafiku: suma limitów miejsc w jednej godzinie nie przekracza liczby koni pracujących tego dnia, więc jeździec nigdy nie trafia na miejsce bez konia.

## Consequences

- Zapis może nie mieć konia. Po terminie nadal jest jazdą i liczy się do godzin jeźdźca, ale nie do obciążenia żadnego konia.
- Obłożenie grafiku liczy się od sumy limitów miejsc, nie od liczby slotów koń × godzina — wartości sprzed i po zmianie nie są porównywalne.
- Zapisy i grafiki dni sprzed zmiany zostały skasowane: nie miały instruktora, a w bazie były wyłącznie dane testowe.
- System nie wybiera, kogo odwołać. Zmniejszenie limitu, wypisanie instruktora lub konia z dnia i skrócenie dnia są odmawiane, dopóki ośrodek sam nie odwoła kolidujących zapisów albo nie zmieni przydziału koni.
- Zapis pamięta dzień, instruktora i godzinę niezależnie od istnienia slotu. Odwołany zapis przetrwa wypisanie instruktora z dnia i skrócenie dnia i dalej liczy się w odwołaniach; przydział konia jest przy odwołaniu czyszczony.
- Dezaktywacja instruktora nie jest odmawiana i nie rusza dni już ułożonych: jego sloty zostają otwarte na zapisy, dopóki ośrodek sam nie wyzeruje limitów. Nieaktywnego instruktora nie da się dodać do dnia, w którym go nie było.
- Grafik dnia zapisuje jedna funkcja w bazie, w jednej transakcji, i jest to jedyna droga zapisu — bezpośredni zapis do tabel grafiku jest odebrany. Reguła sumy limitów jest oceniana na stanie końcowym w tej funkcji.
- Zapisanie jeźdźca przez ośrodek i przenoszenie zapisów między slotami pozostają poza zakresem.
