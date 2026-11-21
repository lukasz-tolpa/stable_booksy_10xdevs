import { describe, expect, it } from "vitest";
import type { SummaryBooking } from "@/lib/month-summary/summary";
import { resolveSummaryMonth } from "@/lib/month-summary/month";
import type { RateChange } from "@/lib/settlements/rates";
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

const STABLE_120: RateChange = { id: 1, riderKey: null, fromMonth: "2026-10", amount: 12000 };

function input(overrides: Partial<RiderSettlementInput> = {}): RiderSettlementInput {
  return {
    month: OCTOBER,
    rider: { key: "anna", name: "Anna Kowalska" },
    bookings: [],
    rates: [STABLE_120],
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
    const rates = [STABLE_120, { id: 2, riderKey: null, fromMonth: "2026-11", amount: 15000 }];
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
      ridesLine: null,
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

describe("composeRiderSettlementPage — strona rozliczenia jeźdźca", () => {
  const monthHref = (month: string) => `/osrodek/rozliczenia/anna?miesiac=${month}`;

  it("strzałki miesięcy prowadzą do rozliczenia tego samego jeźdźca", () => {
    const view = composeRiderSettlementPage({ ...input({ bookings: [ride("2026-10-02")] }), monthHref }, NOW);
    expect(view.nav).toEqual({
      label: "październik 2026",
      previousHref: "/osrodek/rozliczenia/anna?miesiac=2026-09",
      nextHref: "/osrodek/rozliczenia/anna?miesiac=2026-11",
    });
    expect(view.settlement.rides).toBe(1);
    expect(view.isEmpty).toBe(false);
  });

  it("miesiąc bez jazd jeźdźca to spokojny stan pusty zamiast listy jazd", () => {
    const view = composeRiderSettlementPage({ ...input(), monthHref }, NOW);
    expect(view.isEmpty).toBe(true);
    expect(view.emptyText).toBe("W październiku 2026 nie było jazd.");
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
        rates: [STABLE_120, { id: 2, riderKey: "anna", fromMonth: "2026-11", amount: 9050 }],
      }),
      NOW,
    );
    expect(settlement.ridesLine).toBe(`Jazdy: 2 × ${zl("90,50 zł")} = ${zl("181,00 zł")}`);
    expect(settlement.rateSourceText).toBe("stawka indywidualna");
    expect(settlement).toMatchObject({ due: 18100, needsRate: false });
  });

  it("stawka indywidualna innego jeźdźca nie zmienia rozliczenia", () => {
    const settlement = composeRiderSettlement(
      input({
        month: NOVEMBER,
        bookings,
        rates: [STABLE_120, { id: 2, riderKey: "piotr", fromMonth: "2026-11", amount: 0 }],
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
          { id: 2, riderKey: "anna", fromMonth: "2026-10", amount: 0 },
          { id: 3, riderKey: "anna", fromMonth: "2026-11", amount: null },
        ],
      }),
      NOW,
    );
    expect(settlement.rateSourceText).toBe("stawka ośrodka");
    expect(settlement.due).toBe(24000);
  });
});
