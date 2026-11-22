import { describe, expect, it } from "vitest";
import { resolveSummaryMonth, shiftMonth } from "@/lib/month-summary/month";
import type { SummaryBooking } from "@/lib/month-summary/summary";
import { currentMonth, todayIso } from "@/lib/schedule/dates";
import type { ExtraCost } from "@/lib/settlements/costs";
import { composeSettlementDocument, isSettlementPdfAvailable } from "@/lib/settlements/document";
import type { RateChange } from "@/lib/settlements/rates";
import { composeRiderSettlement, type RiderSettlement, type RiderSettlementInput } from "@/lib/settlements/rider";

/** 21 listopada 2026, 14:05 w Warszawie. */
const NOW = new Date("2026-11-21T13:05:00Z");
/** Kwoty mają twarde spacje — w oczekiwaniach piszemy zwykłe. */
const zl = (text: string) => text.replaceAll(" ", " ");

const THIS_MONTH = currentMonth(NOW);
const LAST_MONTH = shiftMonth(THIS_MONTH, -1);
const STABLE = { name: "Stadnina Pod Dębem", city: "Kraków" };
const STABLE_120: RateChange = { id: 1, riderKey: null, fromMonth: LAST_MONTH, amount: 12000 };

function ride(day: string, overrides: Partial<SummaryBooking> = {}): SummaryBooking {
  return {
    day,
    hour: 10,
    status: "active",
    riderKey: "anna",
    riderName: "Anna Kowalska",
    instructor: { id: 1, name: "Marek Dębowski" },
    horseName: "Iskra",
    ...overrides,
  };
}

function cost(id: number, name: string, amount: number): ExtraCost {
  return { id, riderKey: "anna", riderName: "Anna Kowalska", name, amount };
}

/** Rozliczenie z istniejącego modelu widoku — tak jak w punkcie końcowym (`dayHref: null`). */
function settlement(month: string, overrides: Partial<RiderSettlementInput> = {}, now: Date = NOW): RiderSettlement {
  return composeRiderSettlement(
    {
      month: resolveSummaryMonth(month, todayIso(now)),
      rider: { key: "anna", name: "Anna Kowalska" },
      bookings: [ride(`${month}-02`), ride(`${month}-09`, { hour: 12 })],
      rates: [STABLE_120],
      costs: [],
      dayHref: null,
      ...overrides,
    },
    now,
  );
}

function priced(source: RiderSettlement, now: Date = NOW) {
  if (!isSettlementPdfAvailable(source, now)) {
    throw new Error("Rozliczenie bez PDF w teście treści dokumentu");
  }
  return source;
}

function documentFor(month: string, overrides: Partial<RiderSettlementInput> = {}, now: Date = NOW) {
  return composeSettlementDocument({ settlement: priced(settlement(month, overrides, now), now), stable: STABLE }, now);
}

// Oracle: AC #101 — treść PDF: „Rozliczenie za <miesiąc rok>”, „stan na <dzień miesiąc rok>” tylko
// w bieżącym miesiącu (Europe/Warsaw), ośrodek z miastem, jeździec jak na stronie.
describe("composeSettlementDocument — nagłówek", () => {
  it("tytuł z miesiącem rozliczenia; zakończony miesiąc bez dopisku „stan na”", () => {
    const document = documentFor(LAST_MONTH);

    expect(document.title).toBe("Rozliczenie za październik 2026");
    expect(document.asOf).toBeNull();
  });

  it("bieżący miesiąc ma dopisek „stan na” z dzisiejszą datą", () => {
    expect(documentFor(THIS_MONTH).asOf).toBe("stan na 21 listopada 2026");
  });
});

describe("composeSettlementDocument — ośrodek, jeździec i jazdy", () => {
  it("nagłówek: ośrodek z miastem i jeździec", () => {
    expect(documentFor(LAST_MONTH).header).toEqual([
      { label: "Ośrodek", value: "Stadnina Pod Dębem, Kraków" },
      { label: "Jeździec", value: "Anna Kowalska" },
    ]);
  });

  it("jeździec bez imienia i nazwiska — jak na stronie: „(bez nazwiska)”", () => {
    const document = documentFor(LAST_MONTH, { rider: { key: "anna", name: null } });
    expect(document.header[1]).toEqual({ label: "Jeździec", value: "(bez nazwiska)" });
  });

  it("tabela jazd: chronologicznie, bez odwołanych, „—” zamiast konia przy jeździe bez konia", () => {
    const document = documentFor(LAST_MONTH, {
      bookings: [
        ride(`${LAST_MONTH}-16`, { horseName: null, instructor: { id: 2, name: "Joanna Wrona" } }),
        ride(`${LAST_MONTH}-09`, { status: "cancelled" }),
        ride(`${LAST_MONTH}-02`, { hour: 12 }),
        ride(`${LAST_MONTH}-02`, { hour: 9 }),
      ],
    });

    expect(document.rides.columns).toEqual(["Data", "Godzina", "Instruktor", "Koń"]);
    expect(document.rides.rows).toEqual([
      ["pt., 2 paź", "9:00", "Marek Dębowski", "Iskra"],
      ["pt., 2 paź", "12:00", "Marek Dębowski", "Iskra"],
      ["pt., 16 paź", "10:00", "Joanna Wrona", "—"],
    ]);
    expect(document.rides.emptyText).toBeNull();
  });
});

// Oracle: AC #101 — „Jazdy: N × stawka = kwota” ze źródłem stawki, koszty dodatkowe (nazwa, kwota),
// „Do zapłaty”, stopka „Wygenerowano DD.MM.RRRR, GG:MM” w czasie warszawskim; kwoty jak w aplikacji.
describe("composeSettlementDocument — kwoty i stopka", () => {
  it("jazdy razy stawka ośrodka, koszty dodatkowe i „Do zapłaty”", () => {
    const document = documentFor(LAST_MONTH, {
      costs: [cost(1, "Pensjonat konia", 115000), cost(2, "Wypożyczenie kasku", 1550)],
    });

    expect(document.ridesLine).toBe(`Jazdy: 2 × ${zl("120,00 zł")} = ${zl("240,00 zł")}`);
    expect(document.rateSourceText).toBe("stawka ośrodka");
    expect(document.costs).toEqual({
      heading: "Koszty dodatkowe",
      columns: ["Nazwa", "Kwota"],
      rows: [
        ["Pensjonat konia", zl("1 150,00 zł")],
        ["Wypożyczenie kasku", zl("15,50 zł")],
      ],
      emptyText: null,
    });
    expect(document.due).toEqual({ label: "Do zapłaty", value: zl("1 405,50 zł") });
  });

  it("stawka indywidualna jeźdźca — dopisek „stawka indywidualna”", () => {
    const document = documentFor(LAST_MONTH, {
      rates: [STABLE_120, { id: 2, riderKey: "anna", fromMonth: LAST_MONTH, amount: 9000 }],
    });

    expect(document.ridesLine).toBe(`Jazdy: 2 × ${zl("90,00 zł")} = ${zl("180,00 zł")}`);
    expect(document.rateSourceText).toBe("stawka indywidualna");
    expect(document.due.value).toBe(zl("180,00 zł"));
  });

  it("bez kosztów dodatkowych — tekst jak na stronie zamiast tabeli kosztów", () => {
    const { costs } = documentFor(LAST_MONTH);
    expect(costs.rows).toEqual([]);
    expect(costs.emptyText).toBe("W tym miesiącu nie ma kosztów dodatkowych.");
  });

  it("same koszty dodatkowe: „Jazdy: 0 × stawka = 0,00 zł”, zamiast tabeli jazd tekst o braku jazd", () => {
    const document = documentFor(LAST_MONTH, { bookings: [], costs: [cost(1, "Pensjonat konia", 50000)] });

    expect(document.ridesLine).toBe(`Jazdy: 0 × ${zl("120,00 zł")} = ${zl("0,00 zł")}`);
    expect(document.rides.rows).toEqual([]);
    expect(document.rides.emptyText).toBe("W październiku 2026 nie było jazd.");
    expect(document.due.value).toBe(zl("500,00 zł"));
  });

  it("stopka z datą i godziną wygenerowania w czasie warszawskim", () => {
    expect(documentFor(LAST_MONTH).footer).toBe("Wygenerowano 21.11.2026, 14:05");
  });

  it("tuż po północy UTC stopka i „stan na” mają już warszawski dzień i godzinę", () => {
    /** 30 listopada 2026, 23:30 UTC = 1 grudnia, 00:30 w Warszawie. */
    const midnight = new Date("2026-11-30T23:30:00Z");
    const month = currentMonth(midnight);
    // Pierwszy dzień miesiąca: jazd jeszcze nie ma, PDF jest dzięki kosztowi dodatkowemu.
    const document = documentFor(
      month,
      { rates: [{ ...STABLE_120, fromMonth: shiftMonth(month, -2) }], costs: [cost(1, "Pensjonat konia", 50000)] },
      midnight,
    );

    expect(month).toBe("2026-12");
    expect(document.title).toBe("Rozliczenie za grudzień 2026");
    expect(document.asOf).toBe("stan na 1 grudnia 2026");
    expect(document.footer).toBe("Wygenerowano 01.12.2026, 00:30");
  });
});

// Oracle: AC #101 — PDF dostępny, gdy rozliczenie pokazuje „Do zapłaty” (jest stawka ośrodka), w miesiącu
// jest co najmniej jedna jazda albo koszt dodatkowy, a miesiąc nie jest przyszły.
describe("isSettlementPdfAvailable — kiedy PDF jest dostępny", () => {
  it("zwykły przypadek: stawka ośrodka i jazdy w minionym miesiącu", () => {
    expect(isSettlementPdfAvailable(settlement(LAST_MONTH), NOW)).toBe(true);
  });

  it("bieżący miesiąc z jazdami do teraz", () => {
    expect(isSettlementPdfAvailable(settlement(THIS_MONTH), NOW)).toBe(true);
  });

  it("ośrodek bez stawki — niedostępny, także przy stawce indywidualnej jeźdźca", () => {
    expect(isSettlementPdfAvailable(settlement(LAST_MONTH, { rates: [] }), NOW)).toBe(false);
    expect(
      isSettlementPdfAvailable(
        settlement(LAST_MONTH, { rates: [{ id: 2, riderKey: "anna", fromMonth: LAST_MONTH, amount: 9000 }] }),
        NOW,
      ),
    ).toBe(false);
  });

  it("miesiąc bez jazd i bez kosztów dodatkowych — niedostępny", () => {
    expect(isSettlementPdfAvailable(settlement(LAST_MONTH, { bookings: [] }), NOW)).toBe(false);
  });

  it("same koszty dodatkowe bez jazd — dostępny", () => {
    expect(
      isSettlementPdfAvailable(
        settlement(LAST_MONTH, { bookings: [], costs: [cost(1, "Pensjonat konia", 50000)] }),
        NOW,
      ),
    ).toBe(true);
  });

  it("przyszły miesiąc — niedostępny, nawet z kosztem dodatkowym", () => {
    const next = shiftMonth(THIS_MONTH, 1);
    const future = settlement(next, {
      month: resolveSummaryMonth(next, `${next}-15`),
      costs: [cost(1, "Pensjonat konia", 50000)],
    });

    expect(future.month).toBe(next);
    expect(future.dueText).not.toBeNull();
    expect(isSettlementPdfAvailable(future, NOW)).toBe(false);
  });
});

// Oracle: AC #101 — `rozliczenie-RRRR-MM-<slug>.pdf`: transliteracja (ł, ż, ó, ü, é → ASCII), spacje → „-”,
// bez podwójnych i skrajnych myślników; brak imienia i nazwiska (lub pusty slug) → `jezdziec`.
describe("composeSettlementDocument — nazwa pliku", () => {
  const fileNameOf = (name: string | null) => documentFor(LAST_MONTH, { rider: { key: "anna", name } }).fileName;

  it("miesiąc rozliczenia i imię z nazwiskiem jeźdźca", () => {
    expect(fileNameOf("Anna Kowalska")).toBe(`rozliczenie-${LAST_MONTH}-anna-kowalska.pdf`);
  });

  it("polskie i inne łacińskie litery z diakrytykami zamienione na ASCII", () => {
    expect(fileNameOf("Łukasz Żółć")).toBe(`rozliczenie-${LAST_MONTH}-lukasz-zolc.pdf`);
    expect(fileNameOf("Jürgen Müller-Lüdenscheidt")).toBe(`rozliczenie-${LAST_MONTH}-jurgen-muller-ludenscheidt.pdf`);
    expect(fileNameOf("Éloïse Ørsted")).toBe(`rozliczenie-${LAST_MONTH}-eloise-orsted.pdf`);
  });

  it("wielokrotne spacje i inne znaki dają jeden myślnik, bez myślników na brzegach", () => {
    expect(fileNameOf("  Jan   Maria -- O'Neill (junior) ")).toBe(
      `rozliczenie-${LAST_MONTH}-jan-maria-o-neill-junior.pdf`,
    );
  });

  it("bez imienia i nazwiska albo z samymi znakami spoza alfabetu — `jezdziec`", () => {
    expect(fileNameOf(null)).toBe(`rozliczenie-${LAST_MONTH}-jezdziec.pdf`);
    expect(fileNameOf("???")).toBe(`rozliczenie-${LAST_MONTH}-jezdziec.pdf`);
  });
});
