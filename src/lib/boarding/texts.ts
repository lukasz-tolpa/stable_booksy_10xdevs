/**
 * Teksty stron „Pensjonariusze” (właściciel, `/osrodek/pensjonariusze`) i „Moje konie” (pensjonariusz,
 * `/jezdziec/konie`), #114. Słowa z GLOSSARY: pensjonariusz, koń pensjonatowy, pobyt, dzień przyjazdu,
 * dzień wyjazdu.
 */
export const BOARDING_PAGE_TEXTS = {
  stable: {
    title: "Pensjonariusze",
    lead: "Konie pensjonatowe w Twoim ośrodku, ich właściciele i pobyty. Konie pensjonatowe nie pracują w grafiku — chodzą tylko pod swoimi właścicielami.",
    listLabel: "Pensjonariusze",
    empty:
      "W ośrodku nie stoi jeszcze żaden koń pensjonatowy. Dodaj pierwszego — wskaż pensjonariusza po adresie e-mail jego konta.",
    failure: "Nie udało się wczytać pensjonariuszy.",
    addHeading: "Dodaj konia pensjonatowego",
    addHint: "Pensjonariusz musi mieć konto jeźdźca w getona.horse — wpisz adres e-mail tego konta.",
    nameLabel: "Imię konia",
    emailLabel: "Adres e-mail pensjonariusza",
    arrivalLabel: "Dzień przyjazdu",
    add: "Dodaj konia pensjonatowego",
    added: "Dodano konia pensjonatowego.",
    newStay: "Nowy pobyt",
    newStayLabel: "Dzień przyjazdu",
    addStay: "Dodaj pobyt",
    stayAdded: "Dodano nowy pobyt.",
    ownerless: "Konie bez właściciela",
  },
  rider: {
    title: "Moje konie",
    lead: "Twoje konie pensjonatowe i ich pobyty w ośrodkach. Dane konia prowadzi ośrodek; pobyt możesz zakończyć sam.",
    empty:
      "Nie masz koni pensjonatowych. Konia pensjonatowego dodaje ośrodek, w którym stoi, po adresie e-mail Twojego konta.",
    failure: "Nie udało się wczytać Twoich koni.",
  },
  stays: "Pobyty",
  current: "w ośrodku",
  ended: "wyjechał",
  /** `od 1 października 2026 — trwa` — pobyt bez dnia wyjazdu. */
  since: "od",
  ongoing: "trwa",
  setBy: {
    stable: "dzień wyjazdu wpisany przez ośrodek",
    rider: "dzień wyjazdu wpisany przez pensjonariusza",
    me: "dzień wyjazdu wpisany przez Ciebie",
  },
  departureLabel: "Dzień wyjazdu",
  endStay: "Zakończ pobyt",
  correctDeparture: "Popraw dzień wyjazdu",
  departureSaved: "Zapisano dzień wyjazdu.",
  retry: "Odśwież stronę za chwilę.",
} as const;
