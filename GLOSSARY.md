# Stable Booksy

Rezerwacja jazd konnych: ośrodek układa grafik dnia, jeździec zapisuje się na konkretną godzinę z wybranym koniem.

## Language

**Ośrodek**:
Stadnina prowadzona przez jedno konto, które układa jej grafik i widzi jej zapisy.
_Avoid_: stajnia, klub, admin

**Jeździec**:
Osoba z kontem, która zapisuje się na jazdy w ośrodkach.
_Avoid_: uczeń, kursant, klient

**Zapis**:
Rezerwacja jednego konia na jeden slot przez jednego jeźdźca; jest aktywny albo odwołany.
_Avoid_: rezerwacja, booking

**Jazda**:
Aktywny zapis, którego termin już minął. Obecność jeźdźca nie jest potwierdzana — nieodwołany zapis liczy się jako jazda.
_Avoid_: lekcja, zajęcia, trening

**Okres statystyk**:
Dowolny zakres dat wybrany przez ośrodek, dla którego liczone są statystyki.
_Avoid_: miesiąc rozliczeniowy

## Statystyki

**Godziny jazd**:
Suma czasu trwania jazd w okresie statystyk — nie liczba jazd, choć przy slotach godzinowych obie liczby są równe.

**Obciążenie konia**:
Godziny jazd jednego konia w okresie statystyk. Obejmuje także konie zdezaktywowane po tym okresie.

**Obłożenie grafiku**:
Udział slotów wystawionych przez ośrodek w okresie statystyk, na których odbyła się jazda.
_Avoid_: frekwencja, wykorzystanie

**Odwołanie**:
Zapis, który jeździec odwołał przed terminem; zwalnia slot i nie jest jazdą.
_Avoid_: anulowanie, rezygnacja

**Jeździec zanonimizowany**:
Jeździec po usunięciu konta: jego jazdy zostają w statystykach ośrodka, ale bez powiązania z osobą.
W statystykach wszyscy zanonimizowani jeźdźcy występują łącznie, jako „Usunięci jeźdźcy".
