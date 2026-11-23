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
    /** Pod nagłówkiem sekcji koni bez właściciela (#112). */
    ownerlessHint: "Pensjonariusz usunął konto — koń nie ma właściciela i nie dostanie nowego pobytu.",
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
  /** Koń bez żadnego pobytu (#112: konto pensjonariusza usunięte, zanim koń przyjechał). */
  noStay: "bez pobytu",
  /** `od 1 października 2026 — trwa` — pobyt bez dnia wyjazdu. */
  since: "od",
  ongoing: "trwa",
  setBy: {
    stable: "dzień wyjazdu wpisany przez ośrodek",
    rider: "dzień wyjazdu wpisany przez pensjonariusza",
    me: "dzień wyjazdu wpisany przez Ciebie",
    /** Pobyt zakończony usunięciem konta pensjonariusza (#120) — widzi go już tylko ośrodek. */
    accountDeleted: "dzień wyjazdu wpisany przy usunięciu konta pensjonariusza",
  },
  departureLabel: "Dzień wyjazdu",
  endStay: "Zakończ pobyt",
  correctDeparture: "Popraw dzień wyjazdu",
  departureSaved: "Zapisano dzień wyjazdu.",
  /** Opłata za pensjonat przy koniu (#117): u właściciela z formularzem, u pensjonariusza do wglądu. */
  fee: {
    heading: "Opłata za pensjonat",
    current: "Obowiązuje teraz:",
    perMonth: "miesięcznie",
    missing: "Opłata nie jest ustawiona.",
    missingStableHint: "Bez opłaty rozliczenie pensjonariusza nie ma kwoty „Do zapłaty”.",
    missingRiderHint: "Ośrodek nie ustawił jeszcze opłaty za tego konia.",
    hint: "Kwota za cały miesiąc pobytu, także miesiąc przyjazdu i wyjazdu. Zmiana nie przelicza minionych miesięcy.",
    planned: "Zaplanowana zmiana",
    deletePlanned: "Usuń zaplanowaną zmianę",
    amountLabel: "Nowa opłata (zł)",
    fromLegend: "Obowiązuje",
    submit: "Zapisz opłatę",
    saved: "Zapisano opłatę za pensjonat.",
    deleted: "Usunięto zaplanowaną zmianę opłaty za pensjonat.",
  },
  retry: "Odśwież stronę za chwilę.",
} as const;
