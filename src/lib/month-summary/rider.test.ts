import { describe, expect, it } from "vitest";
import type { RiderBooking } from "@/lib/bookings/queries";
import { resolveSummaryMonth } from "@/lib/month-summary/month";
import { composeRiderMonthSummary, type RiderMonthSummaryInput } from "@/lib/month-summary/rider";

/** 20 listopada 2026, 14:30 w Warszawie (CET, UTC+1) — godzina 13 już się skończyła, 14 trwa. */
const NOW = new Date("2026-11-20T13:30:00Z");
const TODAY = "2026-11-20";

const POD_DEBEM = { stableId: 1, stableName: "Stadnina Pod Dębem" };
const NAD_RZEKA = { stableId: 2, stableName: "Ośrodek Nad Rzeką" };

function booking(day: string, hour: number, overrides: Partial<RiderBooking> = {}): RiderBooking {
  return {
    id: 1,
    day,
    hour,
    ...POD_DEBEM,
    instructorId: 1,
    instructorName: "Joanna Wrona",
    horseName: "Bella",
    status: "active",
    cancelledBy: null,
    ...overrides,
  };
}

function input(bookings: RiderBooking[], overrides: Partial<RiderMonthSummaryInput> = {}): RiderMonthSummaryInput {
  return { month: resolveSummaryMonth(null, TODAY), bookings, ...overrides };
}

describe("composeRiderMonthSummary — podsumowanie miesiąca u jeźdźca", () => {
  it("każdy ośrodek ma nazwę, liczbę jazd i listę jazd z datą, godziną, instruktorem i koniem", () => {
    const view = composeRiderMonthSummary(input([booking("2026-11-06", 10)]), NOW);

    expect(view.stables).toEqual([
      {
        stableId: 1,
        name: "Stadnina Pod Dębem",
        rides: 1,
        ridesText: "1 jazda",
        list: [
          {
            day: "2026-11-06",
            date: "pt., 6 lis",
            dayHref: null,
            hour: "10:00",
            instructorName: "Joanna Wrona",
            horseName: "Bella",
            withoutHorse: false,
          },
        ],
      },
    ]);
    expect(view.isEmpty).toBe(false);
  });

  it("grupuje jazdy po ośrodku (alfabetycznie), jazdy w ośrodku chronologicznie, liczba równa liście", () => {
    const view = composeRiderMonthSummary(
      input([
        booking("2026-11-12", 10),
        booking("2026-11-03", 12, NAD_RZEKA),
        booking("2026-11-03", 9),
        booking("2026-11-03", 11),
      ]),
      NOW,
    );

    expect(view.stables.map((stable) => [stable.name, stable.ridesText])).toEqual([
      ["Ośrodek Nad Rzeką", "1 jazda"],
      ["Stadnina Pod Dębem", "3 jazdy"],
    ]);
    const podDebem = view.stables.find((stable) => stable.stableId === 1);
    expect(podDebem?.list.map((ride) => `${ride.day} ${ride.hour}`)).toEqual([
      "2026-11-03 9:00",
      "2026-11-03 11:00",
      "2026-11-12 10:00",
    ]);
    expect(podDebem?.list).toHaveLength(podDebem?.rides ?? -1);
  });

  it("dwa ośrodki o tej samej nazwie to dwie grupy — rozróżnia je ośrodek, nie nazwa", () => {
    const view = composeRiderMonthSummary(
      input([booking("2026-11-03", 10), booking("2026-11-04", 10, { stableId: 3 })]),
      NOW,
    );

    expect(view.stables.map((stable) => [stable.stableId, stable.rides])).toEqual([
      [1, 1],
      [3, 1],
    ]);
  });

  it("pomija ośrodek, w którym w tym miesiącu nie było jazd — tylko odwołania, nadchodzące albo inny miesiąc", () => {
    const view = composeRiderMonthSummary(
      input([
        booking("2026-11-03", 10),
        booking("2026-11-04", 10, { ...NAD_RZEKA, status: "cancelled", cancelledBy: "rider", horseName: null }),
        booking("2026-11-20", 14, NAD_RZEKA),
        booking("2026-11-24", 10, NAD_RZEKA),
        booking("2026-10-31", 10, NAD_RZEKA),
      ]),
      NOW,
    );

    expect(view.stables.map((stable) => stable.name)).toEqual(["Stadnina Pod Dębem"]);
  });

  it("odwołania i nadchodzące zapisy nie wchodzą do liczby ani do listy; w bieżącym miesiącu jazdy do teraz", () => {
    const view = composeRiderMonthSummary(
      input([
        booking("2026-11-20", 13),
        booking("2026-11-20", 14),
        booking("2026-11-21", 10),
        booking("2026-11-05", 10, { status: "cancelled", cancelledBy: "stable", horseName: null }),
      ]),
      NOW,
    );

    expect(view.stables[0]?.rides).toBe(1);
    expect(view.stables[0]?.list.map((ride) => ride.hour)).toEqual(["13:00"]);
  });

  it("jazda bez konia ma „bez konia”, nieznany instruktor — nazwę zastępczą", () => {
    const view = composeRiderMonthSummary(
      input([booking("2026-11-06", 10, { horseName: null, instructorId: 7, instructorName: null })]),
      NOW,
    );

    expect(view.stables[0]?.list[0]).toMatchObject({ horseName: "bez konia", withoutHorse: true });
    expect(view.stables[0]?.list[0]?.instructorName).toMatch(/7/);
  });

  it("miesiąc bez żadnej jazdy jest pusty, z tekstem jeźdźca", () => {
    const view = composeRiderMonthSummary(
      input([booking("2026-11-03", 10)], { month: resolveSummaryMonth("2026-10", TODAY) }),
      NOW,
    );

    expect(view.stables).toEqual([]);
    expect(view.isEmpty).toBe(true);
    expect(view.emptyText).toBe("W październiku 2026 nie jeździłeś.");
  });

  it("strzałki prowadzą do podsumowania jeźdźca z miesiącem w adresie; › nieaktywna w bieżącym miesiącu", () => {
    const current = composeRiderMonthSummary(input([]), NOW);
    expect(current.nav).toEqual({
      label: "listopad 2026",
      previousHref: "/jezdziec/podsumowanie?miesiac=2026-10",
      nextHref: null,
    });

    const past = composeRiderMonthSummary(input([], { month: resolveSummaryMonth("2026-09", TODAY) }), NOW);
    expect(past.nav.nextHref).toBe("/jezdziec/podsumowanie?miesiac=2026-10");
  });
});

// Oracle: AC #118 — pensjonariusz widzi w swoim podsumowaniu konia przy każdej jeździe (slot treningowy na
// jego koniu pensjonatowym), tak jak jeździec rekreacyjny konia ośrodka.
describe("composeRiderMonthSummary — pensjonariusz (#118)", () => {
  it("każda jazda pensjonariusza ma jego konia", () => {
    const view = composeRiderMonthSummary(
      input([
        booking("2026-11-04", 10, { instructorName: "Marek Dębowski", horseName: "Hrabia" }),
        booking("2026-11-07", 10, { instructorName: "Marek Dębowski", horseName: "Sokół" }),
      ]),
      NOW,
    );
    expect(view.stables[0]?.list.map((ride) => [ride.date, ride.instructorName, ride.horseName])).toEqual([
      ["śr., 4 lis", "Marek Dębowski", "Hrabia"],
      ["sob., 7 lis", "Marek Dębowski", "Sokół"],
    ]);
  });
});
