---
status: accepted
---

# Ośrodek to instruktorzy z kontami, a jeden z nich jest właścicielem

Dotąd ośrodek był jednym kontem o roli `stable` (`unique(owner_id)`), a instruktor nie miał konta — ADR-0002 odrzucił instruktora jako trzecią rolę, bo ośrodek mógł wszystko ustawić za niego. To przestało wystarczać: instruktor ma widzieć swoje sloty z zapisanymi jeźdźcami, a wybrani instruktorzy mają układać grafik. Zmieniamy więc model: ośrodek tworzą instruktorzy, część z nich ma konta z zaproszenia, a dokładnie jeden — właściciel — ma wszystkie uprawnienia. Pozostali widzą swoje sloty, a grafik układają tylko z uprawnieniem nadanym przez właściciela.

## Considered Options

- **Ośrodek zostaje jednym kontem, a jego właściciel loguje się „za trenera”** — odrzucone: nie daje instruktorowi wglądu tylko w swoje sloty ani uprawnień dzielonych między ludzi.
- **Konto instruktora obowiązkowe** — odrzucone: ośrodek musiałby zakładać konta ludziom, którzy nigdy się nie zalogują; instruktor bez konta działa jak dotąd.
- **Uprawnienie do układania tylko własnych limitów** — odrzucone: suma limitów w godzinie zależy od koni pracujących całego dnia, więc podział koni między instruktorów wymagałby nowych reguł. Uprawnienie obejmuje cały grafik dnia.
- **Jedno konto jako instruktor i jeździec, albo instruktor w kilku ośrodkach** — odrzucone na teraz: rola konta pozostaje niezmienna, a konto instruktora należy do jednego ośrodka. Kto potrzebuje obu ról, ma dwa konta.

## Consequences

- Zastępuje część ADR-0002 o odrzuceniu instruktora jako roli z kontem; reszta ADR-0002 (miejsca u instruktora, koń przydzielany przez ośrodek) obowiązuje.
- Rola `stable` znika na rzecz konta instruktora; każdy ośrodek ma dokładnie jednego właściciela, który może nie prowadzić żadnej jazdy. Przekazanie roli właściciela jest poza zakresem.
- Istniejące konta ośrodków można skasować zamiast migrować — produkt nie ma jeszcze danych produkcyjnych.
- Konto instruktora powstaje wyłącznie z zaproszenia właściciela i łączy się z istniejącym instruktorem ośrodka.
- Dezaktywacja instruktora odbiera dostęp do konta i uprawnienie do układania grafiku; właściciela nie można dezaktywować.
