/**
 * Teksty rozliczeń (spec #93) — strona „Rozliczenia” i jej formularze. Słowa ze słownika: rozliczenie,
 * stawka, jazda, jeździec, koszt dodatkowy (nie cena, cennik, faktura, osoba, trening).
 */
export const SETTLEMENT_TEXTS = {
  heading: "Rozliczenia",
  failure: "Nie udało się wczytać rozliczeń.",
  retry: "Odśwież stronę za chwilę.",
  saved: "Zapisano.",
  /** Formularz, którego punkt końcowy nie umie obsłużyć (spreparowany, np. koszt bez jeźdźca) — nic się nie zapisuje. */
  formRefused: "Nie udało się przetworzyć formularza.",
  /** Dokończenie zdania stanu pustego po „W październiku 2026” (`formatInMonthYear`). */
  empty: "nie ma nic do rozliczenia.",
  emptyHint: "Wybierz inny miesiąc strzałkami.",
  /** Nazwa listy kart jeźdźców dla czytników ekranu. */
  ridersList: "Rozliczenia jeźdźców",
  /** Suma miesiąca: etykieta przed kwotą dla czytników ekranu, np. `Razem: 12 340,00 zł`. */
  total: "Razem:",
  /** Nagłówek sumy w bocznej kolumnie (#105). */
  totalHeading: "Do zapłaty razem",
  /** Suma bez stawki ośrodka. */
  noTotal: "—",
  /** Nad kartami, gdy ośrodek nie ma stawki. */
  amountsNeedRate: "Kwoty pojawią się po ustawieniu stawki ośrodka.",
  /** Karta jeźdźca (#105): `Do zapłaty`, wyliczenie `… + koszty 50,00 zł`, `Rozliczenie →`. */
  card: { due: "Do zapłaty", costs: "koszty", open: "Rozliczenie →" },
  /**
   * „Pozostali jeźdźcy ośrodka” pod kartami (#106): zwinięta sekcja z liczbą jeźdźców i dopiskiem, w każdym
   * wierszu link do rozliczenia jeźdźca, gdzie dopisuje się koszt dodatkowy.
   */
  others: {
    heading: "Pozostali jeźdźcy ośrodka",
    note: "bez jazd i kosztów w tym miesiącu",
    addCost: "Dopisz koszt →",
  },
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
  /** PDF rozliczenia jeźdźca (spec #100): przycisk na stronie jeźdźca i teksty dokumentu. */
  pdf: {
    download: "Pobierz PDF",
    /** Przed `formatDayMonthYear` w bieżącym miesiącu: `stan na 21 listopada 2026`. */
    asOf: "stan na",
    stable: "Ośrodek",
    rider: "Jeździec",
    columns: { date: "Data", hour: "Godzina", instructor: "Instruktor", horse: "Koń" },
    /** Komórka konia, gdy jazda była bez konia. */
    noHorse: "—",
    costName: "Nazwa",
    costAmount: "Kwota",
    /** Przed `formatDateTime`: `Wygenerowano 21.11.2026, 14:05`. */
    generated: "Wygenerowano",
    /** Numeracja w stopce każdej strony (#102): `strona 1 z 2`. */
    pageOf: (page: number, pages: number) => `strona ${String(page)} z ${String(pages)}`,
    /** Nazwa pliku: `rozliczenie-RRRR-MM-<jeździec>.pdf`; bez imienia i nazwiska — `jezdziec`. */
    fileStem: "rozliczenie",
    unnamedSlug: "jezdziec",
  },
  /** Stawka jeźdźca w rozliczeniu jeźdźca (#97): stawka indywidualna i powrót do stawki ośrodka. */
  riderRate: {
    heading: "Stawka jeźdźca",
    current: "Obowiązuje teraz:",
    hint: "Stawka indywidualna zastępuje stawkę ośrodka, np. karnet albo 0,00 zł dla jeźdźca, który pomaga w ośrodku. Zmiana nie przelicza minionych miesięcy.",
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
    current: "Obowiązuje teraz:",
    planned: "Zaplanowana zmiana",
    deletePlanned: "Usuń zaplanowaną zmianę",
    /** Prośba przed pierwszą stawką ośrodka. */
    missing: "Ustaw stawkę ośrodka",
    missingHint:
      "To kwota za jedną jazdę. Pierwsza stawka obowiązuje też we wszystkich wcześniejszych miesiącach, więc od razu rozliczysz miniony miesiąc.",
    changeHint: "Zmiana nie przelicza minionych miesięcy.",
    amountLabel: "Nowa stawka (zł)",
    fromLegend: "Obowiązuje",
    fromCurrent: "Od tego miesiąca",
    fromNext: "Od następnego miesiąca",
    submit: "Zapisz stawkę",
  },
  /** Koszty dodatkowe (#96) w rozliczeniu jeźdźca — jedyne miejsce, gdzie się je dopisuje (#106). */
  costs: {
    heading: "Koszty dodatkowe",
    /** Nazwa listy kosztów przed nazwą jeźdźca: `Koszty dodatkowe — Anna Kowalska`. */
    listLabel: "Koszty dodatkowe",
    none: "W tym miesiącu nie ma kosztów dodatkowych.",
    add: "Dopisz koszt",
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
