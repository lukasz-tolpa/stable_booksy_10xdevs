/**
 * Teksty rozliczeń (spec #93) — strona „Rozliczenia” i jej formularze. Słowa ze słownika: rozliczenie,
 * stawka, jazda, jeździec, koszt dodatkowy (nie cena, cennik, faktura, osoba, trening).
 */
export const SETTLEMENT_TEXTS = {
  heading: "Rozliczenia",
  lead: "Kwoty jeźdźców ośrodka za jazdy w wybranym miesiącu: liczba jazd razy stawka.",
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
} as const;
