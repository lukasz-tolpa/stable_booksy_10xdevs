import { describe, expect, it } from "vitest";
import { composeInstructorMonthSummary, type InstructorMonthSummaryInput } from "@/lib/month-summary/instructor";
import { resolveSummaryMonth } from "@/lib/month-summary/month";
import type { InstructorSummaryRow } from "@/lib/my-slots/queries";

/** 20 listopada 2026, 14:30 w Warszawie. */
const NOW = new Date("2026-11-20T13:30:00Z");
const TODAY = "2026-11-20";

function row(day: string, hour: number, overrides: Partial<InstructorSummaryRow> = {}): InstructorSummaryRow {
  return {
    day,
    hour,
    riderKey: "anna",
    riderName: "Anna Kowalska",
    horseName: "Bella",
    anonymised: false,
    ...overrides,
  };
}

function input(overrides: Partial<InstructorMonthSummaryInput> = {}): InstructorMonthSummaryInput {
  return {
    month: resolveSummaryMonth(null, TODAY),
    instructor: { id: 1, name: "Joanna Wrona" },
    bookings: [],
    ...overrides,
  };
}

describe("composeInstructorMonthSummary — podsumowanie miesiąca u instruktora z kontem", () => {
  it("jazda ma datę bez linku, godzinę i konia — bez kolumny instruktora", () => {
    const view = composeInstructorMonthSummary(input({ bookings: [row("2026-11-06", 10)] }), NOW);

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
            dayHref: null,
            hour: "10:00",
            instructorName: null,
            horseName: "Bella",
            withoutHorse: false,
          },
        ],
      },
    ]);
  });

  it("jeźdźcy o tej samej nazwie i kilku bez nazwy to osobne wiersze — po kluczu, nie po nazwie", () => {
    const view = composeInstructorMonthSummary(
      input({
        bookings: [
          row("2026-11-03", 10, { riderKey: "a", riderName: "Jan Nowak" }),
          row("2026-11-04", 10, { riderKey: "b", riderName: "Jan Nowak" }),
          row("2026-11-05", 10, { riderKey: "c", riderName: null, horseName: null }),
          row("2026-11-06", 10, { riderKey: "d", riderName: null }),
        ],
      }),
      NOW,
    );

    expect(view.list.rows.map((rider) => [rider.name, rider.rides])).toEqual([
      ["(bez nazwiska)", 1],
      ["(bez nazwiska)", 1],
      ["Jan Nowak", 1],
      ["Jan Nowak", 1],
    ]);
    expect(view.list.totalText).toBe("4 jazdy · 4 jeźdźców");
    expect(view.list.rows.flatMap((rider) => rider.list).find((ride) => ride.withoutHorse)?.horseName).toBe(
      "bez konia",
    );
  });

  it("jazdy jeźdźców zanonimizowanych to jeden wiersz „Usunięci jeźdźcy” na końcu, bez dat", () => {
    const view = composeInstructorMonthSummary(
      input({
        bookings: [
          row("2026-11-03", 10, { riderKey: null, riderName: null, anonymised: true }),
          row("2026-11-04", 11, { riderKey: null, riderName: null, anonymised: true }),
          row("2026-11-05", 10),
        ],
      }),
      NOW,
    );

    expect(view.list.rows.map((rider) => [rider.name, rider.ridesText, rider.list.length])).toEqual([
      ["Anna Kowalska", "1 jazda", 1],
      ["Usunięci jeźdźcy", "2 jazdy", 0],
    ]);
    expect(view.list.totalText).toBe("3 jazdy · 1 jeździec");
  });

  it("w bieżącym miesiącu liczą się jazdy do teraz — trwający i przyszły slot nie, poprzedni miesiąc nie", () => {
    const view = composeInstructorMonthSummary(
      input({
        bookings: [row("2026-11-20", 13), row("2026-11-20", 14), row("2026-11-21", 10), row("2026-10-31", 10)],
      }),
      NOW,
    );

    expect(view.list.rows.flatMap((rider) => rider.list.map((ride) => `${ride.day} ${ride.hour}`))).toEqual([
      "2026-11-20 13:00",
    ]);
  });

  it("strzałki prowadzą do podsumowania instruktora, pusty miesiąc mówi o jego slotach", () => {
    const view = composeInstructorMonthSummary(input({ month: resolveSummaryMonth("2026-10", TODAY) }), NOW);

    expect(view.nav).toEqual({
      label: "październik 2026",
      previousHref: "/instruktor/podsumowanie?miesiac=2026-09",
      nextHref: "/instruktor/podsumowanie?miesiac=2026-11",
    });
    expect(view.isEmpty).toBe(true);
    expect(view.emptyText).toBe("W październiku 2026 nie było jazd na Twoich slotach.");
  });
});
