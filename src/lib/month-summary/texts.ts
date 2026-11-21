/**
 * Teksty Podsumowania miesiąca (spec #87) — wspólne dla właściciela, instruktora i jeźdźca.
 * Słowa ze słownika: jazda, jeździec, instruktor (nie trening, osoba, trener).
 */
export const MONTH_SUMMARY_TEXTS = {
  heading: "Podsumowanie miesiąca",
  /** Landmark przełącznika miesięcy (`DayNav`). */
  navLabel: "Wybór miesiąca",
  previous: "Poprzedni",
  next: "Następny",
  /** Dokończenie zdania stanu pustego po „W październiku 2026” (`formatInMonthYear`), osobno dla każdej roli. */
  empty: {
    owner: "nie było jazd.",
    instructor: "nie było jazd na Twoich slotach.",
    rider: "nie jeździłeś.",
  },
  emptyHint: "Wybierz inny miesiąc strzałkami.",
  failure: "Nie udało się wczytać podsumowania miesiąca.",
  retry: "Odśwież stronę za chwilę.",
  /** Nagłówek listy jeźdźców (sekcja i jej nazwa dla czytników ekranu). */
  ridersHeading: "Jeźdźcy",
  /** Podpis rozwijanej listy jazd jeźdźca. */
  ridesOf: "Jazdy",
  instructor: {
    lead: "Jazdy jeźdźców na Twoich slotach w wybranym miesiącu. Rozwiń jeźdźca, żeby zobaczyć daty jazd.",
  },
  owner: {
    lead: "Jazdy każdego jeźdźca ośrodka w wybranym miesiącu. Rozwiń jeźdźca, żeby zobaczyć daty jazd.",
    /** Link na stronie Statystyk. */
    statsLink: "Podsumowanie miesiąca",
    statsLinkNote: "liczba jazd każdego jeźdźca w miesiącu, z datami",
    /** Link do Rozliczeń wybranego miesiąca (#98), pod opisem strony. */
    settlementsLink: "Rozliczenia za ten miesiąc",
    /** Filtr instruktora (#89): formularz GET nad listą jeźdźców. */
    filter: {
      /** Nazwa formularza dla czytników ekranu. */
      name: "Filtr instruktora",
      label: "Instruktor",
      all: "Wszyscy instruktorzy",
      submit: "Pokaż",
    },
  },
  rider: {
    lead: "Twoje jazdy w wybranym miesiącu, osobno w każdym ośrodku.",
    /** Link powrotu, jak w „Moje zapisy”. */
    back: "Wróć do listy ośrodków",
  },
} as const;
