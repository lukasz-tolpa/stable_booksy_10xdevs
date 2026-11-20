import { describe, expect, it } from "vitest";
import { resolveSummaryMonth } from "@/lib/month-summary/month";
import { composeMonthSummary, type MonthSummaryInput, type SummaryBooking } from "@/lib/month-summary/summary";

/** 10 listopada 2026, 14:30 w Warszawie (CET, UTC+1) — godzina 13 już się skończyła, 14 trwa. */
const NOW = new Date("2026-11-10T13:30:00Z");
const TODAY = "2026-11-10";

const JOANNA = { id: 1, name: "Joanna Wrona" };
const KAROL = { id: 2, name: "Karol Jasny" };

function booking(day: string, hour: number, overrides: Partial<SummaryBooking> = {}): SummaryBooking {
  return {
    day,
    hour,
    status: "active",
    riderKey: "anna",
    riderName: "Anna Kowalska",
    instructor: JOANNA,
    horseName: "Bella",
    ...overrides,
  };
}

function input(bookings: SummaryBooking[], overrides: Partial<MonthSummaryInput> = {}): MonthSummaryInput {
  return {
    month: resolveSummaryMonth(null, TODAY),
    bookings,
    viewer: "owner",
    monthHref: (month) => `/podsumowanie?miesiac=${month}`,
    dayHref: (day) => `/zapisy?dzien=${day}`,
    ...overrides,
  };
}

function summary(bookings: SummaryBooking[], overrides: Partial<MonthSummaryInput> = {}) {
  return composeMonthSummary(input(bookings, overrides), NOW);
}

describe("composeMonthSummary — co jest jazdą", () => {
  it("liczy aktywny zapis po końcu slotu, a pomija trwający, przyszły i odwołany", () => {
    const view = summary([
      booking("2026-11-03", 10),
      booking("2026-11-10", 13),
      booking("2026-11-10", 14),
      booking("2026-11-12", 10),
      booking("2026-11-04", 10, { status: "cancelled" }),
    ]);

    expect(view.list.rides).toBe(2);
    expect(view.list.rows[0]?.list.map((ride) => ride.day)).toEqual(["2026-11-03", "2026-11-10"]);
  });

  it("pomija zapisy spoza miesiąca", () => {
    const view = summary([booking("2026-10-31", 10), booking("2026-11-01", 10), booking("2026-12-01", 10)], {
      month: resolveSummaryMonth("2026-11", "2026-12-15"),
    });

    expect(view.list.rows[0]?.list.map((ride) => ride.day)).toEqual(["2026-11-01"]);
  });
});

describe("composeMonthSummary — jeźdźcy", () => {
  it("grupuje po koncie: dwóch jeźdźców o tej samej nazwie to dwa wiersze, kilku bez nazwy też", () => {
    const view = summary([
      booking("2026-11-02", 10, { riderKey: "anna-1", riderName: "Anna Nowak" }),
      booking("2026-11-02", 11, { riderKey: "anna-2", riderName: "Anna Nowak" }),
      booking("2026-11-03", 10, { riderKey: "bez-1", riderName: null }),
      booking("2026-11-03", 11, { riderKey: "bez-2", riderName: null }),
      booking("2026-11-04", 11, { riderKey: "bez-2", riderName: null }),
    ]);

    expect(view.list.rows.map((row) => [row.name, row.rides])).toEqual([
      ["(bez nazwiska)", 1],
      ["(bez nazwiska)", 2],
      ["Anna Nowak", 1],
      ["Anna Nowak", 1],
    ]);
    expect(view.list.riders).toBe(4);
  });

  it("układa jeźdźców alfabetycznie po polsku, a jazdy jeźdźca chronologicznie", () => {
    const view = summary([
      booking("2026-11-05", 12, { riderKey: "zenon", riderName: "Zenon Żak" }),
      booking("2026-11-05", 10, { riderKey: "lukasz", riderName: "Łukasz Lis" }),
      booking("2026-11-06", 11, { riderKey: "anna", riderName: "Anna Kowalska" }),
      booking("2026-11-02", 15, { riderKey: "anna", riderName: "Anna Kowalska" }),
      booking("2026-11-06", 10, { riderKey: "anna", riderName: "Anna Kowalska" }),
      booking("2026-11-05", 11, { riderKey: "leszek", riderName: "Leszek Mak" }),
    ]);

    expect(view.list.rows.map((row) => row.name)).toEqual(["Anna Kowalska", "Leszek Mak", "Łukasz Lis", "Zenon Żak"]);
    expect(view.list.rows[0]?.list.map((ride) => [ride.date, ride.hour])).toEqual([
      ["pon., 2 lis", "15:00"],
      ["pt., 6 lis", "10:00"],
      ["pt., 6 lis", "11:00"],
    ]);
  });

  it("liczba jazd jeźdźca równa się długości jego listy jazd, a suma — liczbie jazd miesiąca", () => {
    const view = summary([
      booking("2026-11-02", 10),
      booking("2026-11-03", 10),
      booking("2026-11-03", 11, { riderKey: "piotr", riderName: "Piotr Nowak" }),
    ]);

    expect(view.list.rows.map((row) => [row.name, row.rides, row.list.length, row.ridesText])).toEqual([
      ["Anna Kowalska", 2, 2, "2 jazdy"],
      ["Piotr Nowak", 1, 1, "1 jazda"],
    ]);
    expect(view.list.totalText).toBe("3 jazdy · 2 jeźdźców");
  });

  it("jazda podaje datę, godzinę, instruktora i konia albo „bez konia”", () => {
    const view = summary([booking("2026-11-06", 10, { instructor: KAROL, horseName: null })]);

    expect(view.list.rows[0]?.list).toEqual([
      {
        day: "2026-11-06",
        date: "pt., 6 lis",
        dayHref: "/zapisy?dzien=2026-11-06",
        hour: "10:00",
        instructorName: "Karol Jasny",
        horseName: "bez konia",
        withoutHorse: true,
      },
    ]);
  });

  it("bez adresu dnia data jazdy nie jest linkiem, a w widoku instruktora nie ma instruktora przy jeździe", () => {
    const view = summary([booking("2026-11-06", 10)], { dayHref: null, viewer: "instructor" });

    expect(view.list.rows[0]?.list[0]).toMatchObject({ dayHref: null, instructorName: null, horseName: "Bella" });
  });

  it("jazdy usuniętych jeźdźców to jeden wiersz „Usunięci jeźdźcy” na końcu, z samą liczbą, bez dat", () => {
    const view = summary([
      booking("2026-11-02", 10, { riderKey: null, riderName: null }),
      booking("2026-11-03", 10, { riderKey: "zenon", riderName: "Zenon Żak" }),
      booking("2026-11-04", 10, { riderKey: null, riderName: null }),
    ]);

    expect(view.list.rows.map((row) => [row.riderKey, row.name, row.rides, row.list])).toEqual([
      ["zenon", "Zenon Żak", 1, expect.any(Array)],
      [null, "Usunięci jeźdźcy", 2, []],
    ]);
    // Wiersz zbiorczy to nie jeździec — suma jeźdźców liczy konta, jazdy liczą wszystkie.
    expect(view.list.totalText).toBe("3 jazdy · 1 jeździec");
  });
});

describe("composeMonthSummary — miesiąc i stan pusty", () => {
  it("przełącznik miesięcy: etykieta, poprzedni miesiąc i brak następnego w bieżącym", () => {
    expect(summary([]).nav).toEqual({
      label: "listopad 2026",
      previousHref: "/podsumowanie?miesiac=2026-10",
      nextHref: null,
    });
  });

  it("w minionym miesiącu jest strzałka na następny", () => {
    const view = summary([], { month: resolveSummaryMonth("2026-10", TODAY) });

    expect(view.nav).toEqual({
      label: "październik 2026",
      previousHref: "/podsumowanie?miesiac=2026-09",
      nextHref: "/podsumowanie?miesiac=2026-11",
    });
  });

  it("miesiąc bez jazd jest pusty, z tekstem roli w miejscowniku", () => {
    const month = resolveSummaryMonth("2026-10", TODAY);
    const cancelledOnly = [booking("2026-10-05", 10, { status: "cancelled" })];

    expect(summary(cancelledOnly, { month })).toMatchObject({
      isEmpty: true,
      emptyText: "W październiku 2026 nie było jazd.",
    });
    expect(summary([], { month, viewer: "instructor" }).emptyText).toBe(
      "W październiku 2026 nie było jazd na Twoich slotach.",
    );
    expect(summary([], { month, viewer: "rider" }).emptyText).toBe("W październiku 2026 nie jeździłeś.");
  });

  it("we wrześniu stan pusty zaczyna się od „We”", () => {
    const month = resolveSummaryMonth("2026-09", TODAY);
    expect(summary([], { month }).emptyText).toBe("We wrześniu 2026 nie było jazd.");
  });

  it("miesiąc z jazdą nie jest pusty", () => {
    expect(summary([booking("2026-11-02", 10)]).isEmpty).toBe(false);
  });
});
