import { describe, expect, it } from "vitest";
import { resolveSummaryMonth } from "@/lib/month-summary/month";
import { composeOwnerMonthSummary, type OwnerMonthSummaryInput } from "@/lib/month-summary/owner";
import type { StatsBooking } from "@/lib/stats/stats";

/** 20 listopada 2026, 14:30 w Warszawie. */
const NOW = new Date("2026-11-20T13:30:00Z");
const TODAY = "2026-11-20";

const BELLA = 1;
const JOANNA = 1;
const KAROL = 2;

function booking(day: string, hour: number, overrides: Partial<StatsBooking> = {}): StatsBooking {
  return {
    day,
    hour,
    instructorId: JOANNA,
    horseId: BELLA,
    status: "active",
    riderId: "anna",
    cancelledBy: null,
    ...overrides,
  };
}

function input(overrides: Partial<OwnerMonthSummaryInput> = {}): OwnerMonthSummaryInput {
  return {
    month: resolveSummaryMonth(null, TODAY),
    bookings: [],
    riders: [
      { id: "anna", name: "Anna Kowalska" },
      { id: "bez-nazwy", name: null },
    ],
    horses: [{ id: BELLA, name: "Bella" }],
    instructors: [
      { id: JOANNA, name: "Joanna Wrona" },
      { id: KAROL, name: "Karol Jasny" },
    ],
    ...overrides,
  };
}

describe("composeOwnerMonthSummary — podsumowanie miesiąca u właściciela", () => {
  it("jazda ma datę z linkiem do Zapisów tego dnia, godzinę, instruktora i konia", () => {
    const view = composeOwnerMonthSummary(input({ bookings: [booking("2026-11-06", 10)] }), NOW);

    expect(view.list.rows).toEqual([
      {
        riderKey: "anna",
        name: "Anna Kowalska",
        rides: 1,
        ridesText: "1 jazda",
        list: [
          {
            day: "2026-11-06",
            date: "pt., 6 lis",
            dayHref: "/osrodek/zapisy?dzien=2026-11-06",
            hour: "10:00",
            instructorName: "Joanna Wrona",
            horseName: "Bella",
            withoutHorse: false,
          },
        ],
      },
    ]);
  });

  it("jeździec bez nazwy to „(bez nazwiska)”, jazda bez konia — „bez konia”", () => {
    const view = composeOwnerMonthSummary(
      input({ bookings: [booking("2026-11-06", 10, { riderId: "bez-nazwy", horseId: null, instructorId: KAROL })] }),
      NOW,
    );

    expect(view.list.rows[0]).toMatchObject({ name: "(bez nazwiska)" });
    expect(view.list.rows[0]?.list[0]).toMatchObject({ instructorName: "Karol Jasny", horseName: "bez konia" });
  });

  it("koń i instruktor spoza list ośrodka dostają nazwę zastępczą zamiast wywrócić listę", () => {
    const view = composeOwnerMonthSummary(
      input({ bookings: [booking("2026-11-06", 10, { horseId: 9, instructorId: 8 })] }),
      NOW,
    );

    expect(view.list.rows[0]?.list[0]).toMatchObject({ instructorName: "(instruktor #8)", horseName: "(koń #9)" });
  });

  it("jazdy usuniętych jeźdźców to wiersz „Usunięci jeźdźcy” bez dat, a odwołania się nie liczą", () => {
    const view = composeOwnerMonthSummary(
      input({
        bookings: [
          booking("2026-11-06", 10, { riderId: null }),
          booking("2026-11-06", 11),
          booking("2026-11-07", 11, { status: "cancelled", cancelledBy: "stable", horseId: null }),
        ],
      }),
      NOW,
    );

    expect(view.list.rows.map((row) => [row.name, row.rides, row.list.length])).toEqual([
      ["Anna Kowalska", 1, 1],
      ["Usunięci jeźdźcy", 1, 0],
    ]);
    expect(view.list.totalText).toBe("2 jazdy · 1 jeździec");
  });

  it("przełącznik miesięcy prowadzi po stronie podsumowania właściciela", () => {
    const view = composeOwnerMonthSummary(input({ month: resolveSummaryMonth("2026-10", TODAY) }), NOW);

    expect(view.nav).toEqual({
      label: "październik 2026",
      previousHref: "/osrodek/podsumowanie?miesiac=2026-09",
      nextHref: "/osrodek/podsumowanie?miesiac=2026-11",
    });
    expect(view).toMatchObject({ isEmpty: true, emptyText: "W październiku 2026 nie było jazd." });
  });
});

describe("composeOwnerMonthSummary — filtr instruktora", () => {
  const OWNER = 3;
  const RETIRED = 4;
  const IDLE = 5;

  const instructors = [
    { id: JOANNA, name: "Joanna Wrona" },
    { id: KAROL, name: "Karol Jasny" },
    { id: OWNER, name: "Marek Dębowski" },
    { id: RETIRED, name: "Adam Zdezaktywowany" },
    { id: IDLE, name: "Bogna Bez Jazd" },
  ];

  const bookings = [
    booking("2026-11-03", 10, { instructorId: JOANNA }),
    booking("2026-11-04", 10, { instructorId: JOANNA, riderId: "bez-nazwy" }),
    booking("2026-11-05", 12, { instructorId: OWNER }),
    booking("2026-11-06", 9, { instructorId: RETIRED, riderId: null }),
    // Bez jazd w miesiącu: odwołanie, slot jeszcze trwający, zapis z innego miesiąca.
    booking("2026-11-07", 10, { instructorId: IDLE, status: "cancelled", cancelledBy: "rider" }),
    booking("2026-11-20", 14, { instructorId: KAROL }),
    booking("2026-10-30", 10, { instructorId: IDLE }),
  ];

  it("lista to „Wszyscy instruktorzy” i każdy instruktor z jazdami w miesiącu — także zdezaktywowany i właściciel — alfabetycznie", () => {
    const view = composeOwnerMonthSummary(input({ bookings, instructors }), NOW);

    expect(view.filter?.options).toEqual([
      { value: "", label: "Wszyscy instruktorzy", selected: true },
      { value: String(RETIRED), label: "Adam Zdezaktywowany", selected: false },
      { value: String(JOANNA), label: "Joanna Wrona", selected: false },
      { value: String(OWNER), label: "Marek Dębowski", selected: false },
    ]);
    expect(view.list.totalText).toBe("4 jazdy · 2 jeźdźców");
  });

  it("wybrany instruktor zawęża sumę, jeźdźców i ich jazdy do swoich slotów, a strzałki miesiąca go zachowują", () => {
    const view = composeOwnerMonthSummary(
      input({ bookings, instructors, month: resolveSummaryMonth("2026-11", TODAY), instructorParam: String(JOANNA) }),
      NOW,
    );

    expect(view.filter?.options.filter((option) => option.selected)).toEqual([
      { value: String(JOANNA), label: "Joanna Wrona", selected: true },
    ]);
    expect(view.list.totalText).toBe("2 jazdy · 2 jeźdźców");
    expect(view.list.rows.map((row) => [row.name, row.list.map((ride) => ride.instructorName)])).toEqual([
      ["(bez nazwiska)", ["Joanna Wrona"]],
      ["Anna Kowalska", ["Joanna Wrona"]],
    ]);
    expect(view.nav.previousHref).toBe("/osrodek/podsumowanie?miesiac=2026-10&instruktor=1");
  });

  it("nieznany instruktor w adresie, instruktor bez jazd w miesiącu i śmieci dają „Wszyscy instruktorzy”", () => {
    for (const instructorParam of ["99", String(IDLE), String(KAROL), "1abc", "", null]) {
      const view = composeOwnerMonthSummary(input({ bookings, instructors, instructorParam }), NOW);

      expect(view.filter?.options.find((option) => option.selected)?.label, String(instructorParam)).toBe(
        "Wszyscy instruktorzy",
      );
      expect(view.list.totalText).toBe("4 jazdy · 2 jeźdźców");
      expect(view.nav.previousHref).toBe("/osrodek/podsumowanie?miesiac=2026-10");
    }
  });

  it("miesiąc bez jazd nie ma filtra — byłby w nim sam „Wszyscy instruktorzy”", () => {
    const view = composeOwnerMonthSummary(
      input({ bookings, instructors, month: resolveSummaryMonth("2026-08", TODAY), instructorParam: String(JOANNA) }),
      NOW,
    );

    expect(view.filter).toBeNull();
    expect(view).toMatchObject({ isEmpty: true, emptyText: "W sierpniu 2026 nie było jazd." });
  });
});
