import { describe, expect, it } from "vitest";
import { resolveSummaryMonth } from "@/lib/month-summary/month";
import type { ExtraCost } from "@/lib/settlements/costs";
import type { RateChange } from "@/lib/settlements/rates";
import {
  composeSettlementList,
  composeSettlementsPage,
  settlementBookings,
  type SettlementBooking,
  type SettlementsInput,
} from "@/lib/settlements/settlements";

/** 20 listopada 2026, 14:30 w Warszawie. */
const NOW = new Date("2026-11-20T13:30:00Z");
const TODAY = "2026-11-20";
const NOVEMBER = resolveSummaryMonth(null, TODAY);
const OCTOBER = resolveSummaryMonth("2026-10", TODAY);
/** Kwoty mają twarde spacje — w oczekiwaniach piszemy zwykłe. */
const zl = (text: string) => text.replaceAll(" ", " ");

function ride(day: string, riderKey: string | null, riderName: string | null, hour = 10): SettlementBooking {
  return { day, hour, status: "active", riderKey, riderName };
}

const STABLE_120: RateChange = { id: 1, riderKey: null, kind: "recreation", fromMonth: "2026-10", amount: 12000 };

function input(overrides: Partial<SettlementsInput> = {}): SettlementsInput {
  return {
    month: OCTOBER,
    bookings: [],
    rates: [STABLE_120],
    costs: [],
    boardingHorses: [],
    boardingFees: [],
    ...overrides,
  };
}

// Oracle: AC #94 — jeźdźcy z jazdami miesiąca (reguła jazdy z Podsumowania miesiąca), alfabetycznie
// z „(bez nazwiska)”, liczba jazd, kwota = liczba jazd × stawka, suma miesiąca = suma wierszy,
// zanonimizowani pominięci.
describe("composeSettlementList — lista rozliczeń miesiąca", () => {
  it("kwota jeźdźca to liczba jazd razy stawka, a suma miesiąca to suma wierszy", () => {
    const list = composeSettlementList(
      input({
        bookings: [
          ride("2026-10-02", "anna", "Anna Kowalska"),
          ride("2026-10-09", "anna", "Anna Kowalska"),
          ride("2026-10-16", "anna", "Anna Kowalska"),
          ride("2026-10-03", "piotr", "Piotr Nowak"),
        ],
      }),
      NOW,
    );

    expect(list.rows.map((row) => [row.name, row.ridesText, row.ridesAmountText, row.dueText])).toEqual([
      ["Anna Kowalska", "3 jazdy", zl("360,00 zł"), zl("360,00 zł")],
      ["Piotr Nowak", "1 jazda", zl("120,00 zł"), zl("120,00 zł")],
    ]);
    expect(list.rows[0]).toMatchObject({ riderKey: "anna", rides: 3, ridesAmount: 36000, due: 36000 });
    expect(list.rows[0]?.rate).toEqual({ amount: 12000, source: "stable" });
    expect(list.total).toBe(48000);
    expect(list.totalText).toBe(`Razem: ${zl("480,00 zł")}`);
  });

  it("liczą się tylko jazdy miesiąca: bez odwołań, bez zapisów spoza miesiąca i nadchodzących", () => {
    const list = composeSettlementList(
      input({
        month: NOVEMBER,
        bookings: [
          ride("2026-11-02", "anna", "Anna Kowalska"),
          { ...ride("2026-11-03", "anna", "Anna Kowalska"), status: "cancelled" },
          ride("2026-10-31", "anna", "Anna Kowalska"),
          // Dziś 14:30: jazda o 13 się skończyła, o 14 jeszcze trwa, jutrzejsza nadchodzi.
          ride(TODAY, "anna", "Anna Kowalska", 13),
          ride(TODAY, "anna", "Anna Kowalska", 14),
          ride("2026-11-21", "anna", "Anna Kowalska"),
        ],
      }),
      NOW,
    );
    expect(list.rows.map((row) => row.rides)).toEqual([2]);
    expect(list.total).toBe(24000);
  });

  it("jeźdźcy alfabetycznie po polsku, „(bez nazwiska)” jak w Podsumowaniu miesiąca, zanonimizowani pominięci", () => {
    const list = composeSettlementList(
      input({
        bookings: [
          ride("2026-10-02", "zenon", "Zenon Żak"),
          ride("2026-10-02", "lukasz", "Łukasz Lis", 11),
          ride("2026-10-02", "bez", null, 12),
          ride("2026-10-02", null, null, 13),
          ride("2026-10-03", null, null, 13),
          ride("2026-10-02", "adam", "Adam Ąk", 14),
        ],
      }),
      NOW,
    );
    expect(list.rows.map((row) => row.name)).toEqual(["(bez nazwiska)", "Adam Ąk", "Łukasz Lis", "Zenon Żak"]);
    expect(list.total).toBe(4 * 12000);
  });

  it("dwóch jeźdźców o tej samej nazwie to dwa wiersze", () => {
    const list = composeSettlementList(
      input({ bookings: [ride("2026-10-02", "a1", "Anna Kowalska"), ride("2026-10-03", "a2", "Anna Kowalska")] }),
      NOW,
    );
    expect(list.rows.map((row) => row.riderKey)).toEqual(["a1", "a2"]);
  });

  it("stawka miesiąca obowiązuje wszystkie jego jazdy — zmiana od listopada nie przelicza października", () => {
    const rates: RateChange[] = [
      STABLE_120,
      { id: 2, riderKey: null, kind: "recreation", fromMonth: "2026-11", amount: 15000 },
    ];
    const october = composeSettlementList(input({ rates, bookings: [ride("2026-10-30", "anna", "Anna")] }), NOW);
    const november = composeSettlementList(
      input({ rates, month: NOVEMBER, bookings: [ride("2026-11-02", "anna", "Anna")] }),
      NOW,
    );
    expect(october.total).toBe(12000);
    expect(november.total).toBe(15000);
  });

  it("bez stawki ośrodka lista ma jeźdźców i jazdy, ale bez kwot i bez sumy", () => {
    const list = composeSettlementList(
      input({ rates: [], bookings: [ride("2026-10-02", "anna", "Anna Kowalska")] }),
      NOW,
    );
    expect(list.needsRate).toBe(true);
    expect(list.rows).toEqual([
      expect.objectContaining({
        name: "Anna Kowalska",
        rides: 1,
        rate: null,
        ridesAmount: null,
        ridesAmountText: null,
        due: null,
        dueText: null,
      }),
    ]);
    expect(list.total).toBeNull();
    expect(list.totalText).toBeNull();
  });

  it("stawka 0,00 zł daje kwoty 0,00 zł, nie prośbę o stawkę", () => {
    const list = composeSettlementList(
      input({
        rates: [{ id: 1, riderKey: null, kind: "recreation", fromMonth: "2026-10", amount: 0 }],
        bookings: [ride("2026-10-02", "anna", "Anna")],
      }),
      NOW,
    );
    expect(list.needsRate).toBe(false);
    expect(list.totalText).toBe(`Razem: ${zl("0,00 zł")}`);
  });
});

describe("settlementBookings — zapisy miesiąca z odczytu Podsumowania miesiąca", () => {
  it("nazwa jeźdźca z profilu, zanonimizowany bez nazwy, termin i status bez zmian", () => {
    const base = { horseId: null, instructorId: 1, cancelledBy: null } as const;
    expect(
      settlementBookings({
        bookings: [
          { ...base, day: "2026-10-02", hour: 10, status: "active", riderId: "anna" },
          { ...base, day: "2026-10-03", hour: 11, status: "cancelled", riderId: "bez" },
          { ...base, day: "2026-10-04", hour: 12, status: "active", riderId: null },
        ],
        riders: [
          { id: "anna", name: "Anna Kowalska" },
          { id: "bez", name: null },
        ],
      }),
    ).toEqual([
      { day: "2026-10-02", hour: 10, status: "active", riderKey: "anna", riderName: "Anna Kowalska" },
      { day: "2026-10-03", hour: 11, status: "cancelled", riderKey: "bez", riderName: null },
      { day: "2026-10-04", hour: 12, status: "active", riderKey: null, riderName: null },
    ]);
  });
});

describe("composeSettlementsPage — strona „Rozliczenia”", () => {
  const monthHref = (month: string) => `/osrodek/rozliczenia?miesiac=${month}`;
  const riderHref = (riderKey: string) => `/osrodek/rozliczenia/${riderKey}?miesiac=2026-10`;

  it("pokazuje stawkę ośrodka dziś, zaplanowaną zmianę i przełącznik miesięcy", () => {
    const view = composeSettlementsPage(
      {
        ...input({
          rates: [STABLE_120, { id: 7, riderKey: null, kind: "recreation", fromMonth: "2026-12", amount: 14000 }],
          bookings: [ride("2026-10-02", "anna", "Anna")],
        }),
        riders: [],
        monthHref,
        riderHref,
      },
      NOW,
    );

    expect(view.rate).toEqual({
      current: 12000,
      currentText: zl("120,00 zł"),
      planned: { id: 7, fromMonth: "2026-12", amount: 14000, text: `od grudnia 2026: ${zl("140,00 zł")}` },
      choices: [
        { value: "biezacy", label: "Od tego miesiąca (listopad 2026)", checked: true },
        { value: "nastepny", label: "Od następnego miesiąca (grudzień 2026)", checked: false },
      ],
    });
    expect(view.nav).toEqual({
      label: "październik 2026",
      previousHref: "/osrodek/rozliczenia?miesiac=2026-09",
      nextHref: "/osrodek/rozliczenia?miesiac=2026-11",
    });
    expect(view.isEmpty).toBe(false);
  });

  // Oracle: AC #117 — strona stawek ośrodka pokazuje obie stawki ośrodka, każdą z własną zaplanowaną zmianą.
  it("pokazuje osobno stawkę treningową ośrodka dziś i jej zaplanowaną zmianę", () => {
    const view = composeSettlementsPage(
      {
        ...input({
          rates: [
            STABLE_120,
            { id: 8, riderKey: null, kind: "training", fromMonth: "2026-09", amount: 15000 },
            { id: 9, riderKey: null, kind: "training", fromMonth: "2026-12", amount: 16000 },
            { id: 10, riderKey: "kasia", kind: "training", fromMonth: "2026-12", amount: 1 },
          ],
        }),
        riders: [],
        monthHref,
        riderHref,
      },
      NOW,
    );
    expect(view.trainingRate).toMatchObject({
      current: 15000,
      currentText: zl("150,00 zł"),
      planned: { id: 9, text: `od grudnia 2026: ${zl("160,00 zł")}` },
    });
    expect(view.rate).toMatchObject({ current: 12000, planned: null });
  });

  it("bez stawki treningowej ośrodka jej karta prosi o nią, a rekreacyjna zostaje", () => {
    const view = composeSettlementsPage({ ...input(), riders: [], monthHref, riderHref }, NOW);
    expect(view.trainingRate).toMatchObject({ current: null, currentText: null, planned: null });
    expect(view.rate.current).toBe(12000);
  });

  it("przed pierwszą stawką ośrodka prosi o nią zamiast kwot", () => {
    const view = composeSettlementsPage({ ...input({ rates: [] }), riders: [], monthHref, riderHref }, NOW);
    expect(view.rate.current).toBeNull();
    expect(view.rate.currentText).toBeNull();
    expect(view.rate.planned).toBeNull();
    expect(view.list.needsRate).toBe(true);
  });

  it("miesiąc bez jazd to spokojny stan pusty", () => {
    const view = composeSettlementsPage({ ...input(), riders: [], monthHref, riderHref }, NOW);
    expect(view.isEmpty).toBe(true);
    expect(view.emptyText).toBe("W październiku 2026 nie ma nic do rozliczenia.");
  });

  // Oracle: AC #105 — podsumowanie w bocznej kolumnie: „Do zapłaty razem” i „N jeźdźców · N jazd”.
  it("podsumowanie: suma miesiąca i „N jeźdźców · N jazd” z odmianą", () => {
    const summaryOf = (bookings: SettlementBooking[], rates: RateChange[] = [STABLE_120]) =>
      composeSettlementsPage({ ...input({ bookings, rates }), riders: [], monthHref, riderHref }, NOW).summary;

    expect(summaryOf([ride("2026-10-02", "anna", "Anna")])).toEqual({
      totalText: zl("120,00 zł"),
      totalLabel: `Razem: ${zl("120,00 zł")}`,
      countsText: "1 jeździec · 1 jazda",
    });
    expect(
      summaryOf([
        ride("2026-10-02", "anna", "Anna"),
        ride("2026-10-09", "anna", "Anna"),
        ride("2026-10-03", "piotr", "Piotr"),
      ]),
    ).toEqual({
      totalText: zl("360,00 zł"),
      totalLabel: `Razem: ${zl("360,00 zł")}`,
      countsText: "2 jeźdźców · 3 jazdy",
    });

    const five = ["a", "b", "c", "d", "e"].flatMap((key) => [
      ride("2026-10-02", key, key.toUpperCase()),
      ride("2026-10-05", key, key.toUpperCase()),
    ]);
    expect(summaryOf(five)).toEqual({
      totalText: zl("1 200,00 zł"),
      totalLabel: `Razem: ${zl("1 200,00 zł")}`,
      countsText: "5 jeźdźców · 10 jazd",
    });
  });

  it("podsumowanie bez stawki ośrodka: bez sumy, liczby jeźdźców i jazd zostają", () => {
    const view = composeSettlementsPage(
      { ...input({ rates: [], bookings: [ride("2026-10-02", "anna", "Anna")] }), riders: [], monthHref, riderHref },
      NOW,
    );
    expect(view.summary).toEqual({
      totalText: null,
      totalLabel: null,
      countsText: "1 jeździec · 1 jazda",
    });
  });

  // Oracle: AC #105 — karta: „N jazd × stawka [źródło] = kwota za jazdy + koszty”, „Do zapłaty”;
  // koszty tylko gdy > 0, bez stawki ośrodka sama liczba jazd.
  it("karta jeźdźca: stawka miesiąca i źródło, kwota za jazdy, koszty tylko gdy są, „Do zapłaty”", () => {
    const view = composeSettlementsPage(
      {
        ...input({
          month: NOVEMBER,
          bookings: [
            ride("2026-11-02", "anna", "Anna Kowalska"),
            ride("2026-11-09", "anna", "Anna Kowalska"),
            ride("2026-11-03", "piotr", "Piotr Nowak"),
          ],
          rates: [STABLE_120, { id: 7, riderKey: "anna", kind: "recreation", fromMonth: "2026-11", amount: 9000 }],
          costs: [cost("anna", "Anna Kowalska", 150000)],
        }),
        riders: [],
        monthHref,
        riderHref,
      },
      NOW,
    );

    expect(
      view.list.rows.map((row) => ({
        name: row.name,
        ridesText: row.ridesText,
        rateText: row.rateText,
        rateTag: row.rateTag,
        ridesAmountText: row.ridesAmountText,
        costsText: row.costsText,
        dueText: row.dueText,
      })),
    ).toEqual([
      {
        name: "Anna Kowalska",
        ridesText: "2 jazdy",
        rateText: zl("90,00 zł"),
        rateTag: { text: "stawka indywidualna", variant: "primary" },
        ridesAmountText: zl("180,00 zł"),
        costsText: `koszty ${zl("1 500,00 zł")}`,
        dueText: zl("1 680,00 zł"),
      },
      {
        name: "Piotr Nowak",
        ridesText: "1 jazda",
        rateText: zl("120,00 zł"),
        rateTag: { text: "stawka ośrodka", variant: "neutral" },
        ridesAmountText: zl("120,00 zł"),
        costsText: null,
        dueText: zl("120,00 zł"),
      },
    ]);
  });

  it("karta jeźdźca bez stawki ośrodka ma samą liczbę jazd", () => {
    const view = composeSettlementsPage(
      {
        ...input({
          rates: [],
          bookings: [ride("2026-10-02", "anna", "Anna")],
          costs: [cost("anna", "Anna", 5000)],
        }),
        riders: [],
        monthHref,
        riderHref,
      },
      NOW,
    );
    expect(view.list.rows[0]).toMatchObject({
      ridesText: "1 jazda",
      rateText: null,
      rateTag: null,
      ridesAmountText: null,
      costsText: null,
      dueText: null,
    });
  });

  it("wiersz jeźdźca prowadzi do jego rozliczenia", () => {
    const view = composeSettlementsPage(
      {
        ...input({ bookings: [ride("2026-10-02", "anna", "Anna"), ride("2026-10-03", "piotr", "Piotr")] }),
        riders: [],
        monthHref,
        riderHref,
      },
      NOW,
    );
    expect(view.list.rows.map((row) => [row.name, row.href])).toEqual([
      ["Anna", "/osrodek/rozliczenia/anna?miesiac=2026-10"],
      ["Piotr", "/osrodek/rozliczenia/piotr?miesiac=2026-10"],
    ]);
  });
});

// Oracle: AC #97 — kwoty jeźdźca ze stawką indywidualną liczą się po niej, kwoty innych jeźdźców
// po stawce ośrodka; minione miesiące się nie zmieniają; suma miesiąca = suma wierszy.
describe("composeSettlementList — stawka indywidualna", () => {
  const ANNA_90: RateChange = { id: 7, riderKey: "anna", kind: "recreation", fromMonth: "2026-11", amount: 9000 };
  const bookings = [
    ride("2026-11-02", "anna", "Anna Kowalska"),
    ride("2026-11-09", "anna", "Anna Kowalska"),
    ride("2026-11-03", "piotr", "Piotr Nowak"),
  ];

  it("jeździec ze stawką indywidualną płaci po niej, inni po stawce ośrodka, suma to suma wierszy", () => {
    const list = composeSettlementList(input({ month: NOVEMBER, bookings, rates: [STABLE_120, ANNA_90] }), NOW);
    expect(list.rows.map((row) => [row.name, row.rate?.source, row.dueText])).toEqual([
      ["Anna Kowalska", "individual", zl("180,00 zł")],
      ["Piotr Nowak", "stable", zl("120,00 zł")],
    ]);
    expect(list.total).toBe(30000);
  });

  // AC #97: dopisek źródła stawki przy każdym wierszu ze stawką.
  it("każdy wiersz ze stawką ma dopisek źródła stawki", () => {
    const list = composeSettlementList(input({ month: NOVEMBER, bookings, rates: [STABLE_120, ANNA_90] }), NOW);
    expect(list.rows.map((row) => [row.name, row.rateSourceText])).toEqual([
      ["Anna Kowalska", "stawka indywidualna"],
      ["Piotr Nowak", "stawka ośrodka"],
    ]);
    const noRate = composeSettlementList(input({ month: NOVEMBER, bookings, rates: [] }), NOW);
    expect(noRate.rows.map((row) => row.rateSourceText)).toEqual([null, null]);
  });

  it("stawka indywidualna od listopada nie zmienia października", () => {
    const list = composeSettlementList(
      input({ bookings: [ride("2026-10-02", "anna", "Anna Kowalska")], rates: [STABLE_120, ANNA_90] }),
      NOW,
    );
    expect(list.rows[0]?.rate).toEqual({ amount: 12000, source: "stable" });
    expect(list.total).toBe(12000);
  });

  // Review #93: jedna reguła bez stawki ośrodka — żadnych kwot, także przy stawce indywidualnej.
  it("stawka indywidualna bez stawki ośrodka: wiersz bez kwot, bez sumy, prośba o stawkę ośrodka", () => {
    const list = composeSettlementList(input({ month: NOVEMBER, bookings, rates: [ANNA_90] }), NOW);
    expect(list.needsRate).toBe(true);
    expect(list.rows.map((row) => [row.name, row.ridesText, row.rate, row.ridesAmountText, row.dueText])).toEqual([
      ["Anna Kowalska", "2 jazdy", null, null, null],
      ["Piotr Nowak", "1 jazda", null, null, null],
    ]);
    expect(list.total).toBeNull();
    expect(list.totalText).toBeNull();
  });

  it("stawka indywidualna 0,00 zł: jazdy na liście, kwota 0,00 zł", () => {
    const list = composeSettlementList(
      input({ month: NOVEMBER, bookings, rates: [STABLE_120, { ...ANNA_90, amount: 0 }] }),
      NOW,
    );
    expect(list.rows[0]).toMatchObject({ name: "Anna Kowalska", rides: 2, due: 0, dueText: zl("0,00 zł") });
    expect(list.total).toBe(12000);
  });
});

function cost(riderKey: string, riderName: string | null, amount: number, name = "Wyjazd na zawody"): ExtraCost {
  return { id: amount, riderKey, riderName, name, amount };
}

// Oracle: AC #96 — „Do zapłaty” = kwota za jazdy + koszty dodatkowe; jeździec z samymi kosztami jest
// na liście; suma miesiąca obejmuje koszty.
describe("composeSettlementList — koszty dodatkowe", () => {
  it("„Do zapłaty” jeźdźca to kwota za jazdy plus jego koszty, a suma miesiąca je obejmuje", () => {
    const list = composeSettlementList(
      input({
        bookings: [ride("2026-10-02", "anna", "Anna Kowalska"), ride("2026-10-03", "piotr", "Piotr Nowak")],
        costs: [cost("anna", "Anna Kowalska", 80000), cost("anna", "Anna Kowalska", 5050, "Wypożyczenie siodła")],
      }),
      NOW,
    );

    expect(list.rows.map((row) => [row.name, row.ridesAmountText, row.costsAmountText, row.dueText])).toEqual([
      ["Anna Kowalska", zl("120,00 zł"), zl("850,50 zł"), zl("970,50 zł")],
      ["Piotr Nowak", zl("120,00 zł"), zl("0,00 zł"), zl("120,00 zł")],
    ]);
    expect(list.total).toBe(97050 + 12000);
    expect(list.totalText).toBe(`Razem: ${zl("1 090,50 zł")}`);
  });

  it("jeździec bez jazd, któremu dopisano koszt, jest na liście alfabetycznie", () => {
    const list = composeSettlementList(
      input({
        bookings: [ride("2026-10-02", "piotr", "Piotr Nowak")],
        costs: [cost("anna", "Anna Kowalska", 80000), cost("bez", null, 100)],
      }),
      NOW,
    );

    expect(list.rows.map((row) => [row.name, row.ridesText, row.dueText])).toEqual([
      ["(bez nazwiska)", "0 jazd", zl("1,00 zł")],
      ["Anna Kowalska", "0 jazd", zl("800,00 zł")],
      ["Piotr Nowak", "1 jazda", zl("120,00 zł")],
    ]);
    expect(list.rows[1]).toMatchObject({ riderKey: "anna", rides: 0, ridesAmount: 0, costsAmount: 80000, due: 80000 });
    expect(list.total).toBe(80000 + 100 + 12000);
  });

  it("bez stawki ośrodka jeździec z samymi kosztami jest na liście, ale kwoty czekają na stawkę", () => {
    const list = composeSettlementList(input({ rates: [], costs: [cost("anna", "Anna Kowalska", 80000)] }), NOW);
    expect(list.needsRate).toBe(true);
    expect(list.rows).toEqual([expect.objectContaining({ name: "Anna Kowalska", rides: 0, due: null, dueText: null })]);
    expect(list.total).toBeNull();
  });

  it("miesiąc z samymi kosztami nie jest pusty", () => {
    const view = composeSettlementsPage(
      {
        ...input({ costs: [cost("anna", "Anna", 100)] }),
        riders: [],
        monthHref: (month) => month,
        riderHref: (riderKey) => riderKey,
      },
      NOW,
    );
    expect(view.isEmpty).toBe(false);
    expect(view.list.rows.map((row) => row.href)).toEqual(["anna"]);
  });
});

// Oracle: AC #106 — „Pozostali jeźdźcy ośrodka”: jeźdźcy ośrodka (konta z jakimkolwiek zapisem) bez
// rozliczenia w oglądanym miesiącu, alfabetycznie po polsku, każdy z adresem swojego rozliczenia.
describe("composeSettlementsPage — „Pozostali jeźdźcy ośrodka”", () => {
  const monthHref = (month: string) => `/osrodek/rozliczenia?miesiac=${month}`;
  const riderHref = (riderKey: string) => `/osrodek/rozliczenia/${riderKey}?miesiac=2026-10`;
  const riders = [
    { key: "zenon", name: "Zenon Żak" },
    { key: "anna", name: "Anna Kowalska" },
    { key: "lukasz", name: "Łukasz Lis" },
    { key: "piotr", name: "Piotr Nowak" },
    { key: "adam", name: "Adam Ąk" },
  ];

  it("pomija jeźdźców z jazdami i z samym kosztem, reszta alfabetycznie z adresem rozliczenia miesiąca", () => {
    const view = composeSettlementsPage(
      {
        ...input({
          bookings: [ride("2026-10-02", "piotr", "Piotr Nowak")],
          costs: [cost("anna", "Anna Kowalska", 5000)],
        }),
        riders,
        monthHref,
        riderHref,
      },
      NOW,
    );
    expect(view.others).toEqual([
      { riderKey: "adam", name: "Adam Ąk", href: "/osrodek/rozliczenia/adam?miesiac=2026-10" },
      { riderKey: "lukasz", name: "Łukasz Lis", href: "/osrodek/rozliczenia/lukasz?miesiac=2026-10" },
      { riderKey: "zenon", name: "Zenon Żak", href: "/osrodek/rozliczenia/zenon?miesiac=2026-10" },
    ]);
  });

  it("konto bez nazwy jako „(bez nazwiska)” — kolejność jak na liście", () => {
    const view = composeSettlementsPage(
      {
        ...input(),
        riders: [
          { key: "b", name: "Bartek" },
          { key: "x", name: null },
        ],
        monthHref,
        riderHref,
      },
      NOW,
    );
    expect(view.others.map((rider) => rider.name)).toEqual(["(bez nazwiska)", "Bartek"]);
  });

  it("w pustym miesiącu to wszyscy jeźdźcy ośrodka", () => {
    const view = composeSettlementsPage({ ...input(), riders, monthHref, riderHref }, NOW);
    expect(view.isEmpty).toBe(true);
    expect(view.others.map((rider) => rider.riderKey)).toEqual(["adam", "anna", "lukasz", "piotr", "zenon"]);
  });

  it("pusta lista, gdy wszyscy jeźdźcy ośrodka są na liście miesiąca", () => {
    const view = composeSettlementsPage(
      {
        ...input({ bookings: [ride("2026-10-02", "piotr", "Piotr Nowak")], costs: [cost("anna", "Anna", 100)] }),
        riders: [
          { key: "anna", name: "Anna" },
          { key: "piotr", name: "Piotr Nowak" },
        ],
        monthHref,
        riderHref,
      },
      NOW,
    );
    expect(view.others).toEqual([]);
  });
});
