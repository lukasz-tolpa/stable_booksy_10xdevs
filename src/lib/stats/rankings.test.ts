import { describe, expect, it } from "vitest";
import { computeStableStats, type StatsBooking, type StatsInput } from "@/lib/stats/stats";

const BELLA = 1;
const KASZTAN = 2;
const IGOR = 3;

/** 10 listopada 2026, 14:30 w Warszawie (CET, UTC+1) — godzina 13 już się skończyła, 14 trwa. */
const NOW = new Date("2026-11-10T13:30:00Z");

function booking(iso: string, hour: number, riderId: string, overrides: Partial<StatsBooking> = {}): StatsBooking {
  return { day: iso, horseId: BELLA, hour, status: "active", riderId, ...overrides };
}

function input(overrides: Partial<StatsInput> = {}): StatsInput {
  return {
    period: { from: "2026-11-01", to: "2026-11-10" },
    days: [],
    bookings: [],
    riders: [],
    horses: [
      { id: BELLA, name: "Bella" },
      { id: KASZTAN, name: "Kasztan" },
      { id: IGOR, name: "Igor" },
    ],
    ...overrides,
  };
}

describe("computeStableStats — wykres pierwszej dziesiątki jeźdźców", () => {
  it("pokazuje jeźdźców od największej liczby godzin jazd, z nazwą z profilu", () => {
    const stats = computeStableStats(
      input({
        riders: [
          { id: "rider-anna", name: "Anna Nowak" },
          { id: "rider-piotr", name: "Piotr Kowalski" },
        ],
        bookings: [
          booking("2026-11-05", 10, "rider-anna"),
          booking("2026-11-05", 11, "rider-piotr"),
          booking("2026-11-06", 10, "rider-piotr", { horseId: KASZTAN }),
          booking("2026-11-06", 11, "rider-piotr"),
        ],
      }),
      NOW,
    );

    expect(stats.topRiders).toEqual([
      { riderId: "rider-piotr", name: "Piotr Kowalski", rideHours: 3 },
      { riderId: "rider-anna", name: "Anna Nowak", rideHours: 1 },
    ]);
  });

  it("przy więcej niż dziesięciu jeźdźcach zostawia dziesięciu najaktywniejszych", () => {
    // Dwunastu jeźdźców: rider-01 ma jedną jazdę, rider-02 dwie, …, rider-12 dwanaście.
    const bookings: StatsBooking[] = [];
    for (let rider = 1; rider <= 12; rider++) {
      for (let ride = 0; ride < rider; ride++) {
        bookings.push(booking("2026-11-05", ride, `rider-${String(rider).padStart(2, "0")}`));
      }
    }

    const stats = computeStableStats(input({ bookings }), NOW);

    expect(stats.riders).toHaveLength(12);
    expect(stats.topRiders.map((point) => [point.riderId, point.rideHours])).toEqual([
      ["rider-12", 12],
      ["rider-11", 11],
      ["rider-10", 10],
      ["rider-09", 9],
      ["rider-08", 8],
      ["rider-07", 7],
      ["rider-06", 6],
      ["rider-05", 5],
      ["rider-04", 4],
      ["rider-03", 3],
    ]);
  });

  it("pomija jeźdźca, który w okresie miał same odwołania", () => {
    const stats = computeStableStats(
      input({
        bookings: [
          booking("2026-11-05", 10, "rider-anna"),
          booking("2026-11-05", 11, "rider-piotr", { status: "cancelled" }),
        ],
      }),
      NOW,
    );

    expect(stats.riders.map((row) => row.riderId)).toEqual(["rider-anna", "rider-piotr"]);
    expect(stats.topRiders.map((point) => point.riderId)).toEqual(["rider-anna"]);
  });
});
