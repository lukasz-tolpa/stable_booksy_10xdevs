import { describe, expect, it } from "vitest";
import type { SummaryBooking } from "@/lib/month-summary/summary";
import { resolveSummaryMonth } from "@/lib/month-summary/month";
import type { ExtraCost } from "@/lib/settlements/costs";
import type { BoardingFeeChange } from "@/lib/boarding/fees";
import type { RateChange } from "@/lib/settlements/rates";
import type { SettlementBoardingHorse } from "@/lib/settlements/settlements";
import {
  composeRiderSettlement,
  composeRiderSettlementPage,
  parseRiderKey,
  type RiderSettlementInput,
} from "@/lib/settlements/rider";

/** 20 listopada 2026, 14:30 w Warszawie. */
const NOW = new Date("2026-11-20T13:30:00Z");
const TODAY = "2026-11-20";
const NOVEMBER = resolveSummaryMonth(null, TODAY);
const OCTOBER = resolveSummaryMonth("2026-10", TODAY);
/** Kwoty mają twarde spacje — w oczekiwaniach piszemy zwykłe. */
const zl = (text: string) => text.replaceAll(" ", " ");

const MAREK = { id: 1, name: "Marek Dębowski" };

function ride(day: string, overrides: Partial<SummaryBooking> = {}): SummaryBooking {
  return {
    day,
    hour: 10,
    status: "active",
    riderKey: "anna",
    riderName: "Anna Kowalska",
    instructor: MAREK,
    horseName: "Iskra",
    ...overrides,
  };
}

const STABLE_120: RateChange = { id: 1, riderKey: null, kind: "recreation", fromMonth: "2026-10", amount: 12000 };

function input(overrides: Partial<RiderSettlementInput> = {}): RiderSettlementInput {
  return {
    month: OCTOBER,
    rider: { key: "anna", name: "Anna Kowalska" },
    bookings: [],
    rates: [STABLE_120],
    costs: [],
    boardingHorses: [],
    boardingFees: [],
    dayHref: null,
    ...overrides,
  };
}

// Oracle: AC #95 — rozliczenie jeźdźca za miesiąc: liczba jazd × obowiązująca stawka ze źródłem,
// wiersze jazd jak w Podsumowaniu miesiąca, „Do zapłaty” = kwota za jazdy; jazda bez konia kosztuje
// tyle samo, odwołania nic, w bieżącym miesiącu tylko jazdy do teraz; bez stawki — prośba o nią.
describe("composeRiderSettlement — rozliczenie jeźdźca", () => {
  it("jazdy: liczba jazd × stawka ośrodka = kwota, „Do zapłaty” to ta kwota", () => {
    const settlement = composeRiderSettlement(
      input({ bookings: [ride("2026-10-02"), ride("2026-10-09"), ride("2026-10-16")] }),
      NOW,
    );

    expect(settlement.ridesLine).toBe(`Jazdy: 3 × ${zl("120,00 zł")} = ${zl("360,00 zł")}`);
    expect(settlement.rateSourceText).toBe("stawka ośrodka");
    expect(settlement).toMatchObject({
      riderKey: "anna",
      name: "Anna Kowalska",
      monthLabel: "październik 2026",
      rides: 3,
      ridesText: "3 jazdy",
      rate: { amount: 12000, source: "stable" },
      ridesAmount: 36000,
      due: 36000,
      dueText: zl("360,00 zł"),
      needsRate: false,
    });
  });

  it("jazda bez konia kosztuje tyle samo, odwołanie i jazdy innych jeźdźców nic", () => {
    const settlement = composeRiderSettlement(
      input({
        bookings: [
          ride("2026-10-02", { horseName: null }),
          ride("2026-10-03", { status: "cancelled" }),
          ride("2026-10-04", { riderKey: "piotr", riderName: "Piotr Nowak" }),
          ride("2026-10-05", { riderKey: null, riderName: null }),
          ride("2026-10-06"),
        ],
      }),
      NOW,
    );
    expect(settlement.rides).toBe(2);
    expect(settlement.due).toBe(24000);
  });

  it("wiersze jazd chronologicznie: data, godzina, instruktor, koń albo „bez konia”", () => {
    const settlement = composeRiderSettlement(
      input({
        bookings: [ride("2026-10-09", { hour: 12, horseName: null }), ride("2026-10-02", { hour: 9 })],
        dayHref: (day) => `/osrodek/zapisy?dzien=${day}`,
      }),
      NOW,
    );
    expect(settlement.rideRows).toEqual([
      {
        day: "2026-10-02",
        date: "pt., 2 paź",
        dayHref: "/osrodek/zapisy?dzien=2026-10-02",
        hour: "9:00",
        instructorName: "Marek Dębowski",
        horseName: "Iskra",
        withoutHorse: false,
      },
      {
        day: "2026-10-09",
        date: "pt., 9 paź",
        dayHref: "/osrodek/zapisy?dzien=2026-10-09",
        hour: "12:00",
        instructorName: "Marek Dębowski",
        horseName: "bez konia",
        withoutHorse: true,
      },
    ]);
  });

  it("w bieżącym miesiącu liczą się tylko jazdy do teraz", () => {
    const settlement = composeRiderSettlement(
      input({
        month: NOVEMBER,
        // Dziś 14:30: jazda o 13 się skończyła, o 14 jeszcze trwa, jutrzejsza nadchodzi.
        bookings: [ride("2026-11-02"), ride(TODAY, { hour: 13 }), ride(TODAY, { hour: 14 }), ride("2026-11-21")],
      }),
      NOW,
    );
    expect(settlement.rides).toBe(2);
    expect(settlement.monthLabel).toBe("listopad 2026");
  });

  it("stawka miesiąca rozliczenia — zmiana od listopada nie przelicza października", () => {
    const rates: RateChange[] = [
      STABLE_120,
      { id: 2, riderKey: null, kind: "recreation", fromMonth: "2026-11", amount: 15000 },
    ];
    const october = composeRiderSettlement(input({ rates, bookings: [ride("2026-10-30")] }), NOW);
    const november = composeRiderSettlement(input({ rates, month: NOVEMBER, bookings: [ride("2026-11-02")] }), NOW);
    expect(october.due).toBe(12000);
    expect(november.due).toBe(15000);
  });

  it("miesiąc bez jazd: zero jazd i 0,00 zł do zapłaty", () => {
    const settlement = composeRiderSettlement(input(), NOW);
    expect(settlement.ridesLine).toBe(`Jazdy: 0 × ${zl("120,00 zł")} = ${zl("0,00 zł")}`);
    expect(settlement.rideRows).toEqual([]);
    expect(settlement.dueText).toBe(zl("0,00 zł"));
  });

  it("przed pierwszą stawką ośrodka: jazdy bez kwot i prośba o stawkę", () => {
    const settlement = composeRiderSettlement(input({ rates: [], bookings: [ride("2026-10-02")] }), NOW);
    expect(settlement).toMatchObject({
      rides: 1,
      ridesText: "1 jazda",
      needsRate: true,
      rate: null,
      ridesLine: "Jazdy: 1 jazda",
      rateSourceText: null,
      ridesAmount: null,
      due: null,
      dueText: null,
    });
    expect(settlement.rideRows).toHaveLength(1);
  });

  it("jeździec bez nazwy w profilu to „(bez nazwiska)”", () => {
    const settlement = composeRiderSettlement(input({ rider: { key: "anna", name: null } }), NOW);
    expect(settlement.name).toBe("(bez nazwiska)");
  });
});

function cost(id: number, amount: number, name = "Wyjazd na zawody", riderKey = "anna"): ExtraCost {
  return { id, riderKey, riderName: "Anna Kowalska", name, amount };
}

// Oracle: AC #96 — koszty dodatkowe z nazwą i kwotą, „Do zapłaty” = jazdy + suma kosztów; koszty widać
// także przed pierwszą stawką ośrodka (kwota za jazdy i „Do zapłaty” czekają na stawkę).
describe("composeRiderSettlement — koszty dodatkowe", () => {
  it("„Do zapłaty” to kwota za jazdy plus suma kosztów jeźdźca; koszty innych jeźdźców się nie liczą", () => {
    const settlement = composeRiderSettlement(
      input({
        bookings: [ride("2026-10-02"), ride("2026-10-09")],
        costs: [cost(1, 80000), cost(2, 5050, "Wypożyczenie siodła"), cost(3, 99900, "Wyjazd na zawody", "piotr")],
      }),
      NOW,
    );

    expect(settlement.costs).toEqual([
      { id: 1, name: "Wyjazd na zawody", amount: 80000, amountText: zl("800,00 zł"), amountInput: "800,00" },
      { id: 2, name: "Wypożyczenie siodła", amount: 5050, amountText: zl("50,50 zł"), amountInput: "50,50" },
    ]);
    expect(settlement).toMatchObject({ ridesAmount: 24000, costsAmount: 85050, due: 109050 });
    expect(settlement.costsAmountText).toBe(zl("850,50 zł"));
    expect(settlement.dueText).toBe(zl("1 090,50 zł"));
  });

  it("jeździec z samymi kosztami: 0 jazd, „Do zapłaty” = suma kosztów", () => {
    const settlement = composeRiderSettlement(input({ costs: [cost(1, 80000)] }), NOW);
    expect(settlement.rides).toBe(0);
    expect(settlement.dueText).toBe(zl("800,00 zł"));
  });

  it("bez kosztów lista kosztów jest pusta, a „Do zapłaty” to kwota za jazdy", () => {
    const settlement = composeRiderSettlement(input({ bookings: [ride("2026-10-02")] }), NOW);
    expect(settlement.costs).toEqual([]);
    expect(settlement.costsAmount).toBe(0);
    expect(settlement.due).toBe(12000);
  });

  it("przed pierwszą stawką ośrodka koszty widać, a „Do zapłaty” czeka na stawkę", () => {
    const settlement = composeRiderSettlement(input({ rates: [], costs: [cost(1, 80000)] }), NOW);
    expect(settlement.costs.map((item) => item.name)).toEqual(["Wyjazd na zawody"]);
    expect(settlement.costsAmountText).toBe(zl("800,00 zł"));
    expect(settlement).toMatchObject({ needsRate: true, due: null, dueText: null });
  });
});

describe("composeRiderSettlementPage — strona rozliczenia jeźdźca", () => {
  const monthHref = (month: string) => `/osrodek/rozliczenia/anna?miesiac=${month}`;
  const pdfHref = "/osrodek/rozliczenia/anna/pdf?miesiac=2026-10";

  it("strzałki miesięcy prowadzą do rozliczenia tego samego jeźdźca", () => {
    const view = composeRiderSettlementPage({ ...input({ bookings: [ride("2026-10-02")] }), monthHref, pdfHref }, NOW);
    expect(view.nav).toEqual({
      label: "październik 2026",
      previousHref: "/osrodek/rozliczenia/anna?miesiac=2026-09",
      nextHref: "/osrodek/rozliczenia/anna?miesiac=2026-11",
    });
    expect(view.settlement.rides).toBe(1);
    expect(view.settlement.emptyText).toBeNull();
  });

  it("miesiąc bez jazd jeźdźca to spokojny stan pusty zamiast listy jazd i bez „Pokaż wszystkie jazdy”", () => {
    const view = composeRiderSettlementPage({ ...input(), monthHref, pdfHref }, NOW);
    expect(view.settlement.emptyText).toBe("W październiku 2026 nie było jazd.");
    expect(view.ridesToggle).toBeNull();
  });

  // Oracle: AC #109 — pełna lista jazd zwinięta pod „Pokaż wszystkie jazdy (N)”, N = liczba jazd rozliczenia.
  it("lista jazd zwinięta pod „Pokaż wszystkie jazdy (N)” z liczbą jazd rozliczenia", () => {
    const view = composeRiderSettlementPage(
      {
        ...input({ bookings: [ride("2026-10-02"), ride("2026-10-03", { status: "cancelled" }), ride("2026-10-09")] }),
        monthHref,
        pdfHref,
      },
      NOW,
    );
    expect(view.ridesToggle).toBe("Pokaż wszystkie jazdy (2)");
  });

  // Oracle: AC #101 — „Pobierz PDF” tylko, gdy PDF jest dostępny (stawka ośrodka, jazdy albo koszty).
  it("„Pobierz PDF” prowadzi do PDF rozliczenia, gdy PDF jest dostępny; bez stawki ośrodka go nie ma", () => {
    const priced = composeRiderSettlementPage(
      { ...input({ bookings: [ride("2026-10-02")] }), monthHref, pdfHref },
      NOW,
    );
    const unpriced = composeRiderSettlementPage(
      { ...input({ bookings: [ride("2026-10-02")], rates: [] }), monthHref, pdfHref },
      NOW,
    );

    expect(priced.pdfHref).toBe(pdfHref);
    expect(unpriced.pdfHref).toBeNull();
  });
});

// Oracle: AC #109 — karta rozliczenia na górze strony pokazuje sumę kosztów dodatkowych zdaniem z modelu
// widoku (nie samą kwotą — jedyną samą kwotą karty jest „Do zapłaty”); bez kosztów tego zdania nie ma.
describe("composeRiderSettlementPage — suma kosztów dodatkowych w karcie", () => {
  const monthHref = (month: string) => `/osrodek/rozliczenia/anna?miesiac=${month}`;
  const pdfHref = "/osrodek/rozliczenia/anna/pdf?miesiac=2026-10";

  it("z kosztami: „Koszty dodatkowe: suma” tylko kosztów tego jeźdźca", () => {
    const view = composeRiderSettlementPage(
      {
        ...input({
          bookings: [ride("2026-10-02")],
          costs: [cost(1, 80000), cost(2, 5050, "Wypożyczenie siodła"), cost(3, 99900, "Wyjazd na zawody", "piotr")],
        }),
        monthHref,
        pdfHref,
      },
      NOW,
    );
    expect(view.costsLine).toBe(`Koszty dodatkowe: ${zl("850,50 zł")}`);
  });

  it("bez kosztów zdania o kosztach nie ma", () => {
    const view = composeRiderSettlementPage(
      {
        ...input({ bookings: [ride("2026-10-02")], costs: [cost(3, 99900, "Wyjazd na zawody", "piotr")] }),
        monthHref,
        pdfHref,
      },
      NOW,
    );
    expect(view.costsLine).toBeNull();
  });

  it("przed pierwszą stawką ośrodka suma kosztów też jest widoczna", () => {
    const view = composeRiderSettlementPage(
      { ...input({ rates: [], costs: [cost(1, 80000)] }), monthHref, pdfHref },
      NOW,
    );
    expect(view.costsLine).toBe(`Koszty dodatkowe: ${zl("800,00 zł")}`);
  });
});

describe("parseRiderKey — jeździec z adresu", () => {
  it("przyjmuje identyfikator konta (UUID), małymi literami", () => {
    expect(parseRiderKey("7D0B3B5E-1C2A-4F7B-9E39-2B1B4D9B6A01")).toBe("7d0b3b5e-1c2a-4f7b-9e39-2b1b4d9b6a01");
  });

  it.each([undefined, "", "anna", "7d0b3b5e-1c2a-4f7b-9e39-2b1b4d9b6a0", "7d0b3b5e-1c2a-4f7b-9e39-2b1b4d9b6a01x"])(
    "odrzuca %j — strona pokaże „nie ma takiego jeźdźca”",
    (raw) => {
      expect(parseRiderKey(raw)).toBeNull();
    },
  );
});

// Oracle: AC #97 — rozliczenie jeźdźca liczy się po jego stawce indywidualnej z dopiskiem
// „stawka indywidualna”; powrót do stawki ośrodka od swojego miesiąca.
describe("composeRiderSettlement — stawka indywidualna", () => {
  const bookings = [ride("2026-11-02"), ride("2026-11-09")];

  it("jazdy × stawka indywidualna z dopiskiem „stawka indywidualna”", () => {
    const settlement = composeRiderSettlement(
      input({
        month: NOVEMBER,
        bookings,
        rates: [STABLE_120, { id: 2, riderKey: "anna", kind: "recreation", fromMonth: "2026-11", amount: 9050 }],
      }),
      NOW,
    );
    expect(settlement.ridesLine).toBe(`Jazdy: 2 × ${zl("90,50 zł")} = ${zl("181,00 zł")}`);
    expect(settlement.rateSourceText).toBe("stawka indywidualna");
    expect(settlement).toMatchObject({ due: 18100, needsRate: false });
  });

  // Review #93: jedna reguła bez stawki ośrodka — żadnych kwot, także przy stawce indywidualnej.
  it("stawka indywidualna bez stawki ośrodka: jazdy bez kwot i prośba o stawkę ośrodka", () => {
    const settlement = composeRiderSettlement(
      input({
        month: NOVEMBER,
        bookings,
        rates: [{ id: 2, riderKey: "anna", kind: "recreation", fromMonth: "2026-11", amount: 9050 }],
        costs: [{ id: 5, riderKey: "anna", riderName: "Anna Kowalska", name: "Wyjazd na zawody", amount: 80000 }],
      }),
      NOW,
    );
    expect(settlement).toMatchObject({
      rides: 2,
      needsRate: true,
      rate: null,
      ridesLine: "Jazdy: 2 jazdy",
      rateSourceText: null,
      ridesAmountText: null,
      dueText: null,
    });
    expect(settlement.costs.map((row) => row.name)).toEqual(["Wyjazd na zawody"]);
  });

  it("stawka indywidualna innego jeźdźca nie zmienia rozliczenia", () => {
    const settlement = composeRiderSettlement(
      input({
        month: NOVEMBER,
        bookings,
        rates: [STABLE_120, { id: 2, riderKey: "piotr", kind: "recreation", fromMonth: "2026-11", amount: 0 }],
      }),
      NOW,
    );
    expect(settlement.rateSourceText).toBe("stawka ośrodka");
    expect(settlement.due).toBe(24000);
  });

  it("po usunięciu stawki indywidualnej od listopada jeździec wraca do stawki ośrodka", () => {
    const settlement = composeRiderSettlement(
      input({
        month: NOVEMBER,
        bookings,
        rates: [
          STABLE_120,
          { id: 2, riderKey: "anna", kind: "recreation", fromMonth: "2026-10", amount: 0 },
          { id: 3, riderKey: "anna", kind: "recreation", fromMonth: "2026-11", amount: null },
        ],
      }),
      NOW,
    );
    expect(settlement.rateSourceText).toBe("stawka ośrodka");
    expect(settlement.due).toBe(24000);
  });
});

// Oracle: AC #110 — kalendarz miesiąca w rozliczeniu jeźdźca: pola od poniedziałku tygodnia z 1. dniem
// miesiąca (puste pola przed nim), dzień z liczbą jazd rozliczenia, adresem zapisów dnia, poziomem
// wyróżnienia i opisem dla czytnika. W pustym miesiącu kalendarza nie ma.
describe("composeRiderSettlementPage — kalendarz miesiąca", () => {
  const monthHref = (month: string) => `/osrodek/rozliczenia/anna?miesiac=${month}`;
  const pdfHref = "/osrodek/rozliczenia/anna/pdf?miesiac=2026-10";
  const dayHref = (day: string) => `/osrodek/zapisy?dzien=${day}`;

  function calendarOf(month: string, bookings: SummaryBooking[]) {
    const view = composeRiderSettlementPage(
      { ...input({ month: resolveSummaryMonth(month, TODAY), bookings, dayHref }), monthHref, pdfHref },
      NOW,
    );
    if (view.calendar === null) throw new Error("brak kalendarza");
    return view.calendar;
  }

  it("miesiąc od poniedziałku nie ma pustych pól, od niedzieli — sześć przed 1. dniem", () => {
    // 1 czerwca 2026 to poniedziałek, 1 lutego 2026 — niedziela.
    const june = calendarOf("2026-06", [ride("2026-06-03")]);
    const february = calendarOf("2026-02", [ride("2026-02-03")]);

    expect(june.cells[0]).toMatchObject({ day: 1, date: "2026-06-01" });
    expect(february.cells.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(february.cells[6]).toMatchObject({ day: 1, date: "2026-02-01" });
  });

  it.each([
    ["2026-02", 28],
    ["2026-06", 30],
    ["2026-10", 31],
  ])("%s ma %i dni", (month, days) => {
    const calendar = calendarOf(month, [ride(`${month}-03`)]);
    const monthDays = calendar.cells.filter((cell) => cell !== null);
    expect(monthDays).toHaveLength(days);
    expect(monthDays.at(-1)).toMatchObject({ day: days, date: `${month}-${String(days)}` });
  });

  it("w miesiącu bez jazd jeźdźca kalendarza nie ma — także gdy są tylko odwołania i jazdy innych", () => {
    const view = composeRiderSettlementPage(
      {
        ...input({
          bookings: [ride("2026-10-02", { status: "cancelled" }), ride("2026-10-03", { riderKey: "piotr" })],
          dayHref,
        }),
        monthHref,
        pdfHref,
      },
      NOW,
    );
    expect(view.calendar).toBeNull();
  });

  it("liczba jazd w dniu jak w „Jazdy: N” — bez odwołanych, w bieżącym miesiącu do teraz; adres tylko przy jazdach", () => {
    const view = composeRiderSettlementPage(
      {
        ...input({
          month: NOVEMBER,
          // Dziś 14:30: jazda o 13 się skończyła, o 14 jeszcze trwa, jutrzejsza nadchodzi.
          bookings: [
            ride("2026-11-02", { hour: 9 }),
            ride("2026-11-02", { hour: 11, horseName: null }),
            ride("2026-11-03", { status: "cancelled" }),
            ride("2026-11-05", { riderKey: "piotr", riderName: "Piotr Nowak" }),
            ride(TODAY, { hour: 13 }),
            ride(TODAY, { hour: 14 }),
            ride("2026-11-21"),
          ],
          dayHref,
        }),
        monthHref,
        pdfHref,
      },
      NOW,
    );
    const days = (view.calendar?.cells ?? []).filter((cell) => cell !== null);
    const byDate = new Map(days.map((cell) => [cell.date, cell]));

    expect(byDate.get("2026-11-02")).toMatchObject({ rides: 2, href: "/osrodek/zapisy?dzien=2026-11-02" });
    expect(byDate.get(TODAY)).toMatchObject({ rides: 1, href: `/osrodek/zapisy?dzien=${TODAY}` });
    for (const date of ["2026-11-01", "2026-11-03", "2026-11-05", "2026-11-21"]) {
      expect(byDate.get(date), date).toMatchObject({ rides: 0, href: null });
    }
    expect(view.settlement.ridesLine).toMatch(/^Jazdy: 3 × /);
    expect(days.reduce((sum, cell) => sum + cell.rides, 0)).toBe(3);
  });

  it("poziom wyróżnienia 1–3 w tercjach rozpiętości dni z jazdami (najmniej — 1, najwięcej — 3), 0 — dzień bez jazd", () => {
    // 1–6 października: dzień N ma N jazd; najintensywniejszy dzień ma 6.
    const bookings = [1, 2, 3, 4, 5, 6].flatMap((count) =>
      Array.from({ length: count }, (_, hour) => ride(`2026-10-0${String(count)}`, { hour: 8 + hour })),
    );
    const levels = calendarOf("2026-10", bookings)
      .cells.filter((cell) => cell !== null)
      .slice(0, 7)
      .map((cell) => [cell.rides, cell.level]);

    expect(levels).toEqual([
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
      [5, 3],
      [6, 3],
      [0, 0],
    ]);
  });

  it("3, 4 i 5 jazd w dniu to trzy różne poziomy — liczy się rozpiętość, nie tercje najintensywniejszego dnia", () => {
    const bookings = [3, 4, 5].flatMap((count) =>
      Array.from({ length: count }, (_, hour) => ride(`2026-10-0${String(count)}`, { hour: 8 + hour })),
    );
    const levels = calendarOf("2026-10", bookings)
      .cells.filter((cell) => cell !== null)
      .filter((cell) => cell.rides > 0)
      .map((cell) => [cell.rides, cell.level]);

    expect(levels).toEqual([
      [3, 1],
      [4, 2],
      [5, 3],
    ]);
  });

  it("gdy każdy dzień z jazdami ma po jednej jeździe, wszystkie mają najwyższy poziom", () => {
    const days = calendarOf("2026-10", [ride("2026-10-02"), ride("2026-10-09")]).cells.filter((cell) => cell !== null);
    expect(days.filter((cell) => cell.level === 3).map((cell) => cell.day)).toEqual([2, 9]);
    expect(days.filter((cell) => cell.level !== 3).every((cell) => cell.level === 0)).toBe(true);
  });

  it("opis dnia dla czytnika z polską odmianą: 1 jazda, 2–4 jazdy, 5+ jazd", () => {
    const bookings = [
      ride("2026-11-02"),
      ...[9, 10, 11, 12].map((hour) => ride("2026-11-03", { hour })),
      ...[9, 10, 11, 12, 13].map((hour) => ride("2026-11-04", { hour })),
    ];
    const days = calendarOf("2026-11", bookings).cells.filter((cell) => cell !== null);

    expect(days.slice(0, 4).map((cell) => cell.label)).toEqual([
      "1 listopada: 0 jazd",
      "2 listopada: 1 jazda",
      "3 listopada: 4 jazdy",
      "4 listopada: 5 jazd",
    ]);
  });

  it("nagłówki dni tygodnia od poniedziałku", () => {
    expect(calendarOf("2026-11", [ride("2026-11-02")]).weekdays).toEqual(["pon", "wt", "śr", "czw", "pt", "sob", "nd"]);
  });
});

// Oracle: AC #110 — zestawienie „Z kim i na czym”: instruktorzy i konie z liczbą jazd rozliczenia,
// malejąco, przy remisie alfabetycznie po polsku; jazda bez konia to pozycja „bez konia”; sumy obu list
// równe liczbie jazd. W pustym miesiącu zestawienia nie ma.
describe("composeRiderSettlementPage — zestawienie „Z kim i na czym”", () => {
  const monthHref = (month: string) => `/osrodek/rozliczenia/anna?miesiac=${month}`;
  const pdfHref = "/osrodek/rozliczenia/anna/pdf?miesiac=2026-10";
  const JOANNA = { id: 2, name: "Joanna Wrona" };
  const BARTOSZ = { id: 3, name: "Bartosz Lis" };

  it("instruktorzy i konie malejąco, remis alfabetycznie po polsku, „bez konia” jak w liście jazd, sumy = N", () => {
    const view = composeRiderSettlementPage(
      {
        ...input({
          bookings: [
            ride("2026-10-01", { hour: 9 }),
            ride("2026-10-01", { hour: 10 }),
            ride("2026-10-02", { horseName: null }),
            ride("2026-10-05", { instructor: JOANNA, horseName: "Tango" }),
            ride("2026-10-06", { instructor: BARTOSZ, horseName: "Śnieżka" }),
            ride("2026-10-07", { instructor: BARTOSZ, horseName: "Tango", status: "cancelled" }),
            ride("2026-10-08", { instructor: JOANNA, riderKey: "piotr", riderName: "Piotr Nowak" }),
          ],
        }),
        monthHref,
        pdfHref,
      },
      NOW,
    );
    const breakdown = view.breakdown;
    if (breakdown === null) throw new Error("brak zestawienia");
    const pairs = (items: { name: string; rides: number }[]) => items.map((item) => [item.name, item.rides]);

    expect(pairs(breakdown.instructors)).toEqual([
      ["Marek Dębowski", 3],
      ["Bartosz Lis", 1],
      ["Joanna Wrona", 1],
    ]);
    // Po polsku „Ś” stoi przed „T”, a wielkość liter nie decyduje — „bez konia” przed „Śnieżka”.
    expect(pairs(breakdown.horses)).toEqual([
      ["Iskra", 2],
      ["bez konia", 1],
      ["Śnieżka", 1],
      ["Tango", 1],
    ]);
    expect(breakdown.horses.find((item) => item.name === "bez konia")?.name).toBe(
      view.settlement.rideRows.find((row) => row.withoutHorse)?.horseName,
    );
    expect(breakdown.instructors[0].ridesText).toBe("3 jazdy");

    const sum = (items: { rides: number }[]) => items.reduce((acc, item) => acc + item.rides, 0);
    expect(sum(breakdown.instructors)).toBe(view.settlement.rides);
    expect(sum(breakdown.horses)).toBe(view.settlement.rides);
    expect(view.settlement.rides).toBe(5);
  });

  it("w miesiącu bez jazd zestawienia nie ma", () => {
    const view = composeRiderSettlementPage({ ...input({ costs: [cost(1, 80000)] }), monthHref, pdfHref }, NOW);
    expect(view.breakdown).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rozliczenie pensjonariusza (#117)
// ---------------------------------------------------------------------------

const KASIA = { key: "kasia", name: "Katarzyna Zając" };
const TRAINING_150: RateChange = { id: 10, riderKey: null, kind: "training", fromMonth: "2026-10", amount: 15000 };

function horse(
  horseId: number,
  name: string,
  stays: SettlementBoardingHorse["stays"],
  riderKey = "kasia",
): SettlementBoardingHorse {
  return { horseId, name, riderKey, stays };
}
function fee(id: number, horseId: number, amount: number, fromMonth = "2026-10"): BoardingFeeChange {
  return { id, horseId, fromMonth, amount };
}
/** Hrabia stoi od sierpnia i nadal. */
const HRABIA = horse(7, "Hrabia", [{ arrivalDay: "2026-08-10", departureDay: null }]);

function boarderInput(overrides: Partial<RiderSettlementInput> = {}): RiderSettlementInput {
  return input({
    rider: KASIA,
    rates: [STABLE_120, TRAINING_150],
    boardingHorses: [HRABIA],
    boardingFees: [fee(1, 7, 150000)],
    bookings: [
      ride("2026-10-07", { riderKey: "kasia", riderName: "Katarzyna Zając", horseName: "Hrabia" }),
      ride("2026-10-14", { riderKey: "kasia", riderName: "Katarzyna Zając", horseName: "Hrabia" }),
    ],
    ...overrides,
  });
}

// Oracle: AC #117, GLOSSARY „Opłata za pensjonat”, „Pensjonariusz” — pensjonariusz w miesiącu (pobyt konia
// zachodzi na miesiąc) płaci: jazdy × stawka treningowa (indywidualna albo ośrodka) + opłata za pensjonat
// za każdego konia w całości (także w miesiącu przyjazdu i wyjazdu) + koszty dodatkowe; bez stawki
// treningowej albo opłaty konia „Do zapłaty” nie jest liczone.
describe("composeRiderSettlement — rozliczenie pensjonariusza", () => {
  it("jazdy × stawka treningowa ośrodka, opłata za pensjonat konia i „Do zapłaty”", () => {
    const settlement = composeRiderSettlement(boarderInput(), NOW);

    expect(settlement.kind).toBe("training");
    expect(settlement.ridesLine).toBe(`Jazdy: 2 × ${zl("150,00 zł")} = ${zl("300,00 zł")}`);
    expect(settlement.rateSourceText).toBe("stawka treningowa ośrodka");
    expect(settlement.fees).toEqual([
      {
        horseId: 7,
        horseName: "Hrabia",
        amount: 150000,
        amountText: zl("1 500,00 zł"),
        line: `Opłata za pensjonat — Hrabia: ${zl("1 500,00 zł")}`,
      },
    ]);
    expect(settlement).toMatchObject({ ridesAmount: 30000, due: 180000, needsRate: false, needsFee: false });
    expect(settlement.dueText).toBe(zl("1 800,00 zł"));
  });

  it("stawka indywidualna pensjonariusza jest treningowa; jego rekreacyjna stawka indywidualna się nie liczy", () => {
    const settlement = composeRiderSettlement(
      boarderInput({
        rates: [
          STABLE_120,
          TRAINING_150,
          { id: 11, riderKey: "kasia", kind: "training", fromMonth: "2026-10", amount: 11000 },
          { id: 12, riderKey: "kasia", kind: "recreation", fromMonth: "2026-10", amount: 1000 },
        ],
      }),
      NOW,
    );
    expect(settlement.ridesLine).toBe(`Jazdy: 2 × ${zl("110,00 zł")} = ${zl("220,00 zł")}`);
    expect(settlement.rateSourceText).toBe("stawka indywidualna");
    expect(settlement.due).toBe(22000 + 150000);
  });

  it("opłata za każdego konia z pobytem w miesiącu — w całości przy przyjeździe i wyjeździe w trakcie miesiąca", () => {
    const settlement = composeRiderSettlement(
      boarderInput({
        boardingHorses: [
          // Wicher przyjechał 20 października, Hrabia wyjechał 3 października, Sokół — we wrześniu.
          horse(8, "Wicher", [{ arrivalDay: "2026-10-20", departureDay: null }]),
          horse(7, "Hrabia", [{ arrivalDay: "2026-08-10", departureDay: "2026-10-03" }]),
          horse(9, "Sokół", [{ arrivalDay: "2026-05-01", departureDay: "2026-09-30" }]),
          horse(10, "Bursztyn", [{ arrivalDay: "2026-01-01", departureDay: null }], "piotr"),
        ],
        boardingFees: [fee(1, 7, 150000), fee(2, 8, 120000), fee(3, 9, 99900), fee(4, 10, 88800)],
      }),
      NOW,
    );
    expect(settlement.fees.map((line) => [line.horseName, line.amount])).toEqual([
      ["Hrabia", 150000],
      ["Wicher", 120000],
    ]);
    expect(settlement.due).toBe(30000 + 150000 + 120000);
  });

  it("opłata miesiąca rozliczenia — zmiana od listopada nie przelicza października, pierwsza działa wstecz", () => {
    const fees = [fee(1, 7, 150000, "2026-09"), fee(2, 7, 170000, "2026-11")];
    const october = composeRiderSettlement(boarderInput({ boardingFees: fees }), NOW);
    const november = composeRiderSettlement(boarderInput({ boardingFees: fees, month: NOVEMBER, bookings: [] }), NOW);
    const firstLater = composeRiderSettlement(boarderInput({ boardingFees: [fee(3, 7, 160000, "2026-11")] }), NOW);
    expect(october.fees[0]?.amount).toBe(150000);
    expect(november.fees[0]?.amount).toBe(170000);
    expect(firstLater.fees[0]?.amount).toBe(160000);
  });

  it("koszty dodatkowe pensjonariusza wchodzą do „Do zapłaty” obok opłaty", () => {
    const settlement = composeRiderSettlement(
      boarderInput({ costs: [cost(1, 25000, "Wyjazd na zawody", "kasia")] }),
      NOW,
    );
    expect(settlement.costs.map((row) => row.name)).toEqual(["Wyjazd na zawody"]);
    expect(settlement.due).toBe(30000 + 150000 + 25000);
  });

  it("bez stawki treningowej: liczba jazd, prośba o stawkę treningową, opłata widoczna, bez „Do zapłaty”", () => {
    const settlement = composeRiderSettlement(boarderInput({ rates: [STABLE_120] }), NOW);
    expect(settlement).toMatchObject({
      kind: "training",
      needsRate: true,
      needsRateText: "Ustaw stawkę treningową",
      ridesLine: "Jazdy: 2 jazdy",
      rateSourceText: null,
      due: null,
      dueText: null,
    });
    expect(settlement.needsRateHint).toContain("stawki treningowej");
    expect(settlement.fees[0]?.line).toBe(`Opłata za pensjonat — Hrabia: ${zl("1 500,00 zł")}`);
  });

  it("bez opłaty konia: pozycja bez kwoty, prośba o opłatę, bez „Do zapłaty”", () => {
    const settlement = composeRiderSettlement(
      boarderInput({
        boardingHorses: [HRABIA, horse(8, "Wicher", [{ arrivalDay: "2026-09-01", departureDay: null }])],
      }),
      NOW,
    );
    expect(settlement.fees).toEqual([
      expect.objectContaining({ horseName: "Hrabia", amount: 150000 }),
      {
        horseId: 8,
        horseName: "Wicher",
        amount: null,
        amountText: null,
        line: "Opłata za pensjonat — Wicher: brak kwoty",
      },
    ]);
    expect(settlement).toMatchObject({ needsRate: false, needsFee: true, due: null, dueText: null });
    expect(settlement.ridesAmount).toBe(30000);
  });

  it("miesiąc bez jazd z pobytem konia: opłata, koszty i „Do zapłaty”", () => {
    const settlement = composeRiderSettlement(
      boarderInput({ bookings: [], costs: [cost(1, 25000, "Kowal", "kasia")] }),
      NOW,
    );
    expect(settlement).toMatchObject({ kind: "training", rides: 0, due: 175000 });
    expect(settlement.ridesLine).toBe(`Jazdy: 0 × ${zl("150,00 zł")} = ${zl("0,00 zł")}`);
    expect(settlement.emptyText).toBe("W październiku 2026 nie było jazd.");
  });

  it("od miesiąca po wyjeździe ostatniego konia jeździec jest rekreacyjny: stawka ośrodka, bez opłat", () => {
    const settlement = composeRiderSettlement(
      boarderInput({
        boardingHorses: [horse(7, "Hrabia", [{ arrivalDay: "2026-08-10", departureDay: "2026-09-30" }])],
      }),
      NOW,
    );
    expect(settlement).toMatchObject({ kind: "recreation", fees: [], due: 24000, needsFee: false });
    expect(settlement.rateSourceText).toBe("stawka ośrodka");
  });

  it("jeździec rekreacyjny: bez pozycji opłat, prośba o stawkę ośrodka jak dotąd", () => {
    const settlement = composeRiderSettlement(input({ rates: [], bookings: [ride("2026-10-02")] }), NOW);
    expect(settlement).toMatchObject({
      kind: "recreation",
      fees: [],
      needsFee: false,
      needsRateText: "Ustaw stawkę ośrodka",
      needsRateHint: "Kwoty pojawią się po ustawieniu stawki ośrodka na stronie „Rozliczenia”.",
    });
  });
});

describe("composeRiderSettlementPage — pensjonariusz", () => {
  const monthHref = (month: string) => `/osrodek/rozliczenia/kasia?miesiac=${month}`;
  const pdfHref = "/osrodek/rozliczenia/kasia/pdf?miesiac=2026-10";

  it("miesiąc bez jazd z opłatą: PDF dostępny, bez kalendarza i listy jazd", () => {
    const view = composeRiderSettlementPage({ ...boarderInput({ bookings: [] }), monthHref, pdfHref }, NOW);
    expect(view.pdfHref).toBe(pdfHref);
    expect(view.calendar).toBeNull();
    expect(view.ridesToggle).toBeNull();
  });

  it("bez opłaty konia PDF nie jest dostępny", () => {
    const view = composeRiderSettlementPage({ ...boarderInput({ boardingFees: [] }), monthHref, pdfHref }, NOW);
    expect(view.pdfHref).toBeNull();
  });
});
