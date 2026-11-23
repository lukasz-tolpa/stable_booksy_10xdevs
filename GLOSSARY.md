# getona.horse

Rezerwacja jazd konnych: ośrodek układa grafik dnia i limity miejsc u instruktorów, jeździec zapisuje się na wolne miejsce, a konia przydziela mu ośrodek.

## Language

Słowa z _Avoid_ nie występują w interfejsie ani w dokumentach. Wyjątek: teksty dla wyszukiwarek (tytuł strony, opis, fraza pod hasłem) mogą użyć słów, które ludzie wpisują w wyszukiwarkę, np. „stajnia” czy „rezerwacja jazd”.

**getona.horse**:
Nazwa produktu, w tekście zawsze małymi literami i z kropką, taka sama jak adres. Czyta się ją jako zdanie „get on a horse”.
_Avoid_: Stable Booksy, Get On A Horse, GetOna, Getona

**Ośrodek**:
Stadnina, w której pracują instruktorzy; jeden z nich jest jej właścicielem. Gdy mowa, że coś robi ośrodek (układa grafik, przydziela konia, odwołuje zapis), robi to właściciel — a grafik także instruktor z uprawnieniem do układania grafiku, konia zaś także instruktor przy zapisach na swoje sloty.
_Avoid_: stajnia, klub

**Jeździec**:
Osoba z kontem, która zapisuje się na jazdy w ośrodkach. Konto jeźdźca nigdy nie jest zarazem kontem instruktora.
_Avoid_: uczeń, kursant, klient

**Pensjonariusz**:
Jeździec, który ma w ośrodku co najmniej jednego konia pensjonatowego. O tym, kto jest pensjonariuszem, decyduje własność konia, nie dyscyplina — jeździec skaczący na koniu ośrodka jest jeźdźcem rekreacyjnym. Pensjonariusz nie jeździ rekreacyjnie: jeździ tylko na swoich koniach pensjonatowych, a zapis na slot rekreacyjny jest mu odmawiany. Jeździec jest pensjonariuszem w każdym miesiącu, w którym trwał pobyt choć jednego jego konia. Pensjonariusz widzi zajętość placów ośrodka.
_Avoid_: właściciel konia, prywaciarz

**Koń ośrodka**:
Koń należący do ośrodka, przydzielany jeźdźcom do jazd. Tylko konie ośrodka są końmi pracującymi, które ograniczają limity miejsc.
_Avoid_: koń stadninowy, koń szkółkowy

**Koń pensjonatowy**:
Prywatny koń pensjonariusza, który stoi w ośrodku. Chodzi tylko pod swoim właścicielem: ośrodek nie przydziela go innym jeźdźcom. Konia pensjonatowego dodaje właściciel ośrodka, wskazując pensjonariusza po adresie e-mail jego konta.
_Avoid_: koń prywatny

**Pobyt**:
Okres od dnia przyjazdu do dnia wyjazdu, w którym koń pensjonatowy stoi w ośrodku. Pobyt kończy każda ze stron: ośrodek albo pensjonariusz, wpisując dzień wyjazdu — nie późniejszy niż dziś i nie wcześniejszy niż ostatnia jazda konia; ośrodek może ten dzień poprawić, a pensjonariusz widzi każdą zmianę. Usunięcie konta pensjonariusza kończy pobyty jego koni we wszystkich ośrodkach.

**Opłata za pensjonat**:
Miesięczna kwota za jednego konia pensjonatowego, wchodząca do rozliczenia jego właściciela za każdy miesiąc, w którym trwa pobyt konia — w całości, także w miesiącu przyjazdu i wyjazdu. Obowiązuje od wskazanego miesiąca, jak stawka: zmiana nie przelicza minionych miesięcy, a — jak pierwsza stawka ośrodka — pierwsza opłata konia obowiązuje też we wszystkich wcześniejszych miesiącach jego pobytu. Koń bez opłaty nie ma kwoty, więc rozliczenie jego właściciela nie ma „Do zapłaty”.
_Avoid_: pensjonat (jako koszt dodatkowy), czynsz

**Instruktor**:
Osoba prowadząca jazdy w ośrodku. Może mieć konto, założone z zaproszenia właściciela; konto instruktora należy do jednego ośrodka, a instruktor z kontem widzi swoje sloty z zapisanymi jeźdźcami i przydziela im konie. Instruktor bez konta też prowadzi jazdy — jego grafik układa ośrodek. Nazwa instruktora jest unikalna w ośrodku i nie zmienia się. Instruktora się dezaktywuje, nie usuwa: nie można go dodać do nowego dnia, ale zostaje w dniach już ułożonych i przy dawnych zapisach. Dezaktywacja odbiera też dostęp do jego konta i uprawnienie do układania grafiku; ponowna aktywacja nie przywraca uprawnienia.
_Avoid_: trener, prowadzący

**Właściciel**:
Instruktor z kontem, który ma w ośrodku wszystkie uprawnienia. Każdy ośrodek ma dokładnie jednego właściciela; może on nie prowadzić żadnej jazdy i nie można go dezaktywować.
_Avoid_: admin, administrator, kierownik

**Uprawnienie do układania grafiku**:
Zgoda właściciela dla instruktora z kontem na układanie całego grafiku dnia ośrodka — koni pracujących i limitów miejsc wszystkich instruktorów — tak jak robi to właściciel. Właściciel może je w każdej chwili odebrać.
_Avoid_: rola, admin grafiku

**Dyscyplina**:
Rodzaj jazdy z ustalonego zbioru: skoki, ujeżdżenie, rekreacja. Instruktor ma dyscypliny, które może prowadzić; slot ma jedną dyscyplinę spośród dyscyplin swojego instruktora. Jeździec widzi dyscyplinę przy slocie.
_Avoid_: rodzaj treningu, specjalizacja

**Dyscyplina zamknięta**:
Dyscyplina, której sloty w danym ośrodku widzą i na które zapisują się tylko jeźdźcy z dopuszczeniem. Ośrodek sam decyduje, które dyscypliny zamyka; pozostałe są otwarte dla wszystkich jeźdźców. Jeździec bez dopuszczenia nie dowiaduje się o ukrytych slotach: dzień, w którym nie widzi żadnego slotu, w ogóle mu się nie pokazuje, a sam ośrodek widzi zawsze.

**Dopuszczenie**:
Zgoda właściciela, by jeździec zapisywał się w jego ośrodku na sloty danej dyscypliny zamkniętej. Właściciel wskazuje jeźdźca po adresie e-mail jego konta, także takiego, który nie ma jeszcze żadnego zapisu w ośrodku. Odebranie dopuszczenia nie odwołuje przyszłych zapisów jeźdźca — ośrodek może je odwołać sam.
_Avoid_: grupa, uprawnienie jeźdźca

**Slot**:
Jedna godzina jednego instruktora w danym dniu, na jednym placu, z własnym limitem miejsc. Slot jest rekreacyjny albo treningowy; rodzaj i plac ustawia ośrodek przy układaniu grafiku.
_Avoid_: termin, okienko

**Plac**:
Nazwane miejsce jazd w ośrodku, np. hala, duży plac, lonżownik. Ośrodek sam zakłada swoje place; nazwa placu jest unikalna w ośrodku.
_Avoid_: ujeżdżalnia, arena, maneż

**Zajętość placów**:
Liczba zajętych miejsc w slotach na każdym placu w każdej godzinie dnia, z instruktorem i rodzajem slotu, bez jeźdźców i koni. Widzą ją pensjonariusze — by nie wjeżdżać na plac pełen jazd — i ośrodek; jeździec rekreacyjny jej nie widzi.
_Avoid_: obłożenie placu

**Slot treningowy**:
Slot, na który zapisują się tylko pensjonariusze, jadąc na swoich koniach pensjonatowych. Widzi go każdy pensjonariusz ośrodka, bez dopuszczenia. Nie zużywa koni ośrodka.
_Avoid_: trening, slot prywatny

**Limit miejsc**:
Liczba jeźdźców, których instruktor przyjmie w jednym slocie; zero oznacza, że w tej godzinie nie prowadzi jazdy. Suma limitów slotów rekreacyjnych w jednej godzinie nie przekracza liczby koni ośrodka pracujących tego dnia.
_Avoid_: pojemność, liczba miejsc

**Szkic**:
Niezapisany grafik dnia, który formularz podpowiedział z ostatnio ułożonego dnia ośrodka. Jeźdźcy go nie widzą — dzień pojawia się u nich dopiero po zapisie.
_Avoid_: wersja robocza, projekt grafiku

**Zapis**:
Jedno miejsce w slocie zajęte przez jednego jeźdźca; jest aktywny albo odwołany. Jeździec ma w ośrodku najwyżej jeden aktywny zapis na daną godzinę.
_Avoid_: rezerwacja, booking

**Przydział konia**:
Wskazanie konia do zapisu przez ośrodek albo przez instruktora z kontem, gdy zapis jest na jego slot — w dowolnym momencie, także po terminie. Koń pochodzi z koni pracujących tego dnia. Przy zapisie na slot treningowy koniem jest koń pensjonatowy zapisanego pensjonariusza: jedyny — przydzielony od razu, jeden z kilku — wybrany przez pensjonariusza przy zapisie. Koń ma najwyżej jednego jeźdźca w danej godzinie; zapis może pozostać bez konia. Jeździec widzi przydzielonego konia przy swoim zapisie.
_Avoid_: wybór konia

**Jazda**:
Aktywny zapis, którego termin już minął. Obecność jeźdźca nie jest potwierdzana — nieodwołany zapis liczy się jako jazda.
_Avoid_: lekcja, zajęcia, trening

**Okres statystyk**:
Dowolny zakres dat wybrany przez ośrodek, dla którego liczone są statystyki.
_Avoid_: miesiąc rozliczeniowy

**Podsumowanie miesiąca**:
Jazdy każdego jeźdźca w ośrodku w jednym miesiącu kalendarzowym: ich liczba i daty, osobno dla jeźdźców rekreacyjnych i pensjonariuszy. Właściciel widzi wszystkich jeźdźców ośrodka, instruktor z kontem — jeźdźców ze swoich slotów, jeździec — tylko siebie. W bieżącym miesiącu liczą się jazdy do teraz; nadchodzące zapisy i odwołania nie wchodzą. Jeźdźcy zanonimizowani występują łącznie, z samą liczbą jazd, bez dat.
_Avoid_: raport miesięczny, zestawienie treningów

## Rozliczenia

**Rozliczenie**:
Kwota, którą jeździec jest winien ośrodkowi za jeden miesiąc kalendarzowy: jego jazdy w tym miesiącu razy stawka plus koszty dodatkowe, a u pensjonariusza także opłaty za pensjonat jego koni. Przygotowuje je właściciel. Jeźdźcy zanonimizowani nie mają rozliczenia. Opłacenie rozliczenia nie jest śledzone.
_Avoid_: faktura, rachunek, miesiąc rozliczeniowy

**Stawka**:
Cena jednej jazdy w ośrodku. Ośrodek ma dwie stawki ośrodka: rekreacyjną — za jazdę na koniu ośrodka — i treningową — za jazdę pensjonariusza na jego koniu pensjonatowym; jeździec może mieć stawkę indywidualną, która zastępuje stawkę ośrodka jego rodzaju jazd. Stawka obowiązuje od wskazanego miesiąca, więc jej zmiana nie przelicza minionych miesięcy; tylko pierwsza stawka ośrodka obowiązuje też we wszystkich wcześniejszych miesiącach, a jeździec bez stawki indywidualnej liczy się po stawce ośrodka. Wszystkie jazdy jeźdźca w jednym miesiącu liczą się po tej samej stawce.
_Avoid_: cena, cennik, taryfa

**Koszt dodatkowy**:
Pozycja rozliczenia poza jazdami i opłatą za pensjonat (np. wyjazd na zawody, kowal, praca konia pod instruktorem), z nazwą i kwotą, dopisana przez właściciela jednemu jeźdźcowi na jeden miesiąc — także gdy jeździec nie miał w nim żadnej jazdy.
_Avoid_: opłata, dopłata

## Statystyki

**Godziny jazd**:
Suma czasu trwania jazd w okresie statystyk — nie liczba jazd, choć przy slotach godzinowych obie liczby są równe.

**Obciążenie konia**:
Godziny jazd jednego konia w okresie statystyk, osobno dla koni ośrodka i koni pensjonatowych. Obejmuje także konie zdezaktywowane po tym okresie; jazdy bez przydziału konia nie wchodzą do żadnego obciążenia.

**Obłożenie grafiku**:
Udział miejsc wystawionych przez ośrodek w okresie statystyk (suma limitów miejsc), na których odbyła się jazda — osobno dla slotów rekreacyjnych i treningowych.
_Avoid_: frekwencja, wykorzystanie

**Odwołanie**:
Zapis odwołany przed terminem przez jeźdźca albo przez ośrodek; zwalnia miejsce w slocie i przydzielonego konia i nie jest jazdą. Odwołanie zostaje w statystykach także wtedy, gdy ośrodek później zmieni grafik i slot zniknie. Jeździec widzi, kto odwołał; w statystykach jeźdźca liczą się tylko odwołania jego własne.
_Avoid_: anulowanie, rezygnacja, wypisanie

**Jeździec zanonimizowany**:
Jeździec po usunięciu konta: jego jazdy zostają w statystykach ośrodka, ale bez powiązania z osobą. Usunięcia konta nigdy się nie odmawia — także pensjonariuszowi, którego koń stoi w ośrodku.
W statystykach wszyscy zanonimizowani jeźdźcy występują łącznie, jako „Usunięci jeźdźcy".
