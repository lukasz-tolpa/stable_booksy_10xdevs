/**
 * Teksty rozliczeń (spec #93) — strona „Rozliczenia” i jej formularze. Słowa ze słownika: rozliczenie,
 * stawka, jazda, jeździec, koszt dodatkowy (nie cena, cennik, faktura, osoba, trening).
 */
export const SETTLEMENT_TEXTS = {
  heading: "Rozliczenia",
  lead: "Kwoty jeźdźców ośrodka w wybranym miesiącu: liczba jazd razy stawka plus koszty dodatkowe.",
  failure: "Nie udało się wczytać rozliczeń.",
  retry: "Odśwież stronę za chwilę.",
  saved: "Zapisano.",
  /** Dokończenie zdania stanu pustego po „W październiku 2026” (`formatInMonthYear`). */
  empty: "nie ma nic do rozliczenia.",
  emptyHint: "Wybierz inny miesiąc strzałkami.",
  /** Sekcja listy jeźdźców i nazwa listy dla czytników ekranu. */
  ridersHeading: "Jeźdźcy",
  ridersList: "Rozliczenia jeźdźców",
  /** Suma miesiąca, np. `Razem: 12 340,00 zł`. */
  total: "Razem:",
  /** Zamiast kwot na liście, gdy ośrodek nie ma stawki. */
  amountsNeedRate: "Kwoty pojawią się po ustawieniu stawki ośrodka.",
  /** Rozliczenie jeźdźca (#95): `/osrodek/rozliczenia/<jeździec>?miesiac=RRRR-MM`. */
  rider: {
    /** Tytuł karty przeglądarki przed nazwą jeźdźca: `Rozliczenie — Anna Kowalska`. */
    title: "Rozliczenie",
    lead: "Rozliczenie jeźdźca za wybrany miesiąc: jego jazdy razy stawka plus koszty dodatkowe.",
    /** Nagłówek karty przed `formatMonthYear`: `Rozliczenie za listopad 2026`. */
    forMonth: "Rozliczenie za",
    back: "Wróć do rozliczeń",
    /** Początek wiersza kwoty za jazdy: `Jazdy: 8 × 120,00 zł = 960,00 zł`. */
    rides: "Jazdy:",
    /** Nagłówek sekcji jazd i początek nazwy listy jazd (`Jazdy — Anna Kowalska`). */
    ridesHeading: "Jazdy",
    /** Dopisek o źródle stawki przy kwocie za jazdy. */
    source: { stable: "stawka ośrodka", individual: "stawka indywidualna" },
    due: "Do zapłaty",
    /** Bez stawki ośrodka: prośba zamiast kwot, link na „Rozliczenia”, gdzie jest formularz stawki. */
    needsRate: "Ustaw stawkę ośrodka",
    needsRateHint: "Kwoty pojawią się po ustawieniu stawki ośrodka na stronie „Rozliczenia”.",
    notFound: "Nie ma takiego jeźdźca.",
    notFoundHint: "Rozliczenie ma tylko jeździec, który miał zapis w Twoim ośrodku.",
    failure: "Nie udało się wczytać rozliczenia jeźdźca.",
  },
  /** Stawka jeźdźca w rozliczeniu jeźdźca (#97): stawka indywidualna i powrót do stawki ośrodka. */
  riderRate: {
    heading: "Stawka jeźdźca",
    current: "Obowiązuje teraz:",
    hint: "Stawka indywidualna zastępuje stawkę ośrodka, np. karnet albo 0,00 zł dla pracownika stajni. Zmiana nie przelicza minionych miesięcy.",
    planned: "Zaplanowana zmiana",
    deletePlanned: "Usuń zaplanowaną zmianę",
    /** Nazwa formularza nowej stawki indywidualnej. */
    set: "Nowa stawka indywidualna",
    amountLabel: "Nowa stawka indywidualna (zł)",
    submit: "Zapisz stawkę indywidualną",
    /** Nazwa formularza powrotu do stawki ośrodka. */
    end: "Powrót do stawki ośrodka",
    endHint: "Od wybranego miesiąca jeździec płaci stawkę ośrodka; minione miesiące się nie zmieniają.",
    endSubmit: "Usuń stawkę indywidualną",
    /** Formularz z błędnym jeźdźcem (spreparowany) wraca na listę „Rozliczenia”. */
    unknownRider: "Nie ma takiego jeźdźca.",
  },
  rate: {
    heading: "Stawka ośrodka",
    /** Przed `formatInMonthYear`: `Stawka ośrodka w październiku 2026: 120,00 zł`. */
    inMonth: "Stawka ośrodka",
    current: "Obowiązuje teraz:",
    planned: "Zaplanowana zmiana",
    deletePlanned: "Usuń zaplanowaną zmianę",
    /** Prośba przed pierwszą stawką ośrodka. */
    missing: "Ustaw stawkę ośrodka",
    missingHint:
      "To cena jednej jazdy. Pierwsza stawka obowiązuje też we wszystkich wcześniejszych miesiącach, więc od razu rozliczysz miniony miesiąc.",
    changeHint: "Zmiana nie przelicza minionych miesięcy.",
    amountLabel: "Nowa stawka (zł)",
    fromLegend: "Obowiązuje",
    fromCurrent: "Od tego miesiąca",
    fromNext: "Od następnego miesiąca",
    submit: "Zapisz stawkę",
  },
  /** Koszty dodatkowe (#96): rozliczenie jeźdźca i „Dopisz koszt” na stronie „Rozliczenia”. */
  costs: {
    heading: "Koszty dodatkowe",
    /** Nazwa listy kosztów przed nazwą jeźdźca: `Koszty dodatkowe — Anna Kowalska`. */
    listLabel: "Koszty dodatkowe",
    none: "W tym miesiącu nie ma kosztów dodatkowych.",
    add: "Dopisz koszt",
    /** Pod formularzem na stronie „Rozliczenia”, przed `formatInMonthYear`: `Koszt trafi do rozliczenia w listopadzie 2026.` */
    addHint: "Koszt trafi do rozliczenia jeźdźca",
    riderLabel: "Jeździec",
    riderPlaceholder: "Wybierz jeźdźca",
    noRiders: "Koszt dopiszesz jeźdźcowi, który miał zapis w Twoim ośrodku.",
    nameLabel: "Nazwa kosztu",
    namePlaceholder: "np. Pensjonat konia",
    amountLabel: "Kwota (zł)",
    edit: "Popraw",
    /** Nazwa formularza poprawki przed nazwą kosztu: `Popraw koszt Pensjonat konia`. */
    editForm: "Popraw koszt",
    save: "Zapisz koszt",
    delete: "Usuń",
  },
} as const;
