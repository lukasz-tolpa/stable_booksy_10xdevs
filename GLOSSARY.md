# getona.horse

Rezerwacja jazd konnych: ośrodek układa grafik dnia i limity miejsc u instruktorów, jeździec zapisuje się na wolne miejsce, a konia przydziela mu ośrodek.

## Language

**getona.horse**:
Nazwa produktu, w tekście zawsze małymi literami i z kropką, taka sama jak adres. Czyta się ją jako zdanie „get on a horse”.
_Avoid_: Stable Booksy, Get On A Horse, GetOna, Getona

**Ośrodek**:
Stadnina prowadzona przez jedno konto, które układa jej grafik i widzi jej zapisy.
_Avoid_: stajnia, klub, admin

**Jeździec**:
Osoba z kontem, która zapisuje się na jazdy w ośrodkach.
_Avoid_: uczeń, kursant, klient

**Instruktor**:
Osoba prowadząca jazdy w ośrodku. Nie ma własnego konta — dodaje ją i układa jej grafik ośrodek. Jego nazwa jest unikalna w ośrodku i nie zmienia się. Instruktora się dezaktywuje, nie usuwa: nie można go dodać do nowego dnia, ale zostaje w dniach już ułożonych i przy dawnych zapisach.
_Avoid_: trener, prowadzący

**Slot**:
Jedna godzina jednego instruktora w danym dniu, z własnym limitem miejsc.
_Avoid_: termin, okienko

**Limit miejsc**:
Liczba jeźdźców, których instruktor przyjmie w jednym slocie; zero oznacza, że w tej godzinie nie prowadzi jazdy. Suma limitów wszystkich instruktorów w jednej godzinie nie przekracza liczby koni pracujących tego dnia.
_Avoid_: pojemność, liczba miejsc

**Szkic**:
Niezapisany grafik dnia, który formularz podpowiedział z ostatnio ułożonego dnia ośrodka. Jeźdźcy go nie widzą — dzień pojawia się u nich dopiero po zapisie.
_Avoid_: wersja robocza, projekt grafiku

**Zapis**:
Jedno miejsce w slocie zajęte przez jednego jeźdźca; jest aktywny albo odwołany. Jeździec ma w ośrodku najwyżej jeden aktywny zapis na daną godzinę.
_Avoid_: rezerwacja, booking

**Przydział konia**:
Wskazanie przez ośrodek konia do zapisu — w dowolnym momencie, także po terminie. Koń ma najwyżej jednego jeźdźca w danej godzinie; zapis może pozostać bez konia. Jeździec widzi przydzielonego konia przy swoim zapisie.
_Avoid_: wybór konia

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
Godziny jazd jednego konia w okresie statystyk. Obejmuje także konie zdezaktywowane po tym okresie; jazdy bez przydziału konia nie wchodzą do żadnego obciążenia.

**Obłożenie grafiku**:
Udział miejsc wystawionych przez ośrodek w okresie statystyk (suma limitów miejsc), na których odbyła się jazda.
_Avoid_: frekwencja, wykorzystanie

**Odwołanie**:
Zapis odwołany przed terminem przez jeźdźca albo przez ośrodek; zwalnia miejsce w slocie i przydzielonego konia i nie jest jazdą. Odwołanie zostaje w statystykach także wtedy, gdy ośrodek później zmieni grafik i slot zniknie. Jeździec widzi, kto odwołał; w statystykach jeźdźca liczą się tylko odwołania jego własne.
_Avoid_: anulowanie, rezygnacja

**Jeździec zanonimizowany**:
Jeździec po usunięciu konta: jego jazdy zostają w statystykach ośrodka, ale bez powiązania z osobą.
W statystykach wszyscy zanonimizowani jeźdźcy występują łącznie, jako „Usunięci jeźdźcy".
