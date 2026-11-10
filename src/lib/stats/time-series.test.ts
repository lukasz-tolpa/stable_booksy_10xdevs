import { describe, expect, it } from "vitest";
import { computeStableStats, type StatsBooking, type StatsInput } from "@/lib/stats/stats";

/** 10 listopada 2026, 14:30 w Warszawie — wszystko przed tym dniem już się odbyło. */
const NOW = new Date("2026-11-10T13:30:00Z");

function booking(iso: string, hour: number, overrides: Partial<StatsBooking> = {}): StatsBooking {
  return { day: iso, horseId: 1, hour, status: "active", riderId: "rider-1", ...overrides };
}

function input(overrides: Partial<StatsInput> = {}): StatsInput {
  return {
    period: { from: "2026-11-01", to: "2026-11-10" },
    days: [],
    bookings: [],
    riders: [],
    horses: [],
    ...overrides,
  };
}

function series(overrides: Partial<StatsInput> = {}, now: Date = NOW) {
  return computeStableStats(input(overrides), now).rideHoursOverTime;
}

describe("computeStableStats — godziny jazd w czasie", () => {
  it("krótki okres ma przedział na każdy dzień, także bez jazd", () => {
    const result = series({
      period: { from: "2026-11-03", to: "2026-11-06" },
      bookings: [booking("2026-11-03", 10), booking("2026-11-03", 11), booking("2026-11-05", 10)],
    });

    expect(result).toEqual({
      granularity: "day",
      buckets: [
        { from: "2026-11-03", to: "2026-11-03", rideHours: 2 },
        { from: "2026-11-04", to: "2026-11-04", rideHours: 0 },
        { from: "2026-11-05", to: "2026-11-05", rideHours: 1 },
        { from: "2026-11-06", to: "2026-11-06", rideHours: 0 },
      ],
    });
  });

  it("do serii wchodzą tylko jazdy: bez odwołań, godzin trwających i przyszłych", () => {
    const result = series({
      period: { from: "2026-11-09", to: "2026-11-11" },
      bookings: [
        booking("2026-11-09", 10),
        booking("2026-11-09", 11, { status: "cancelled" }),
        booking("2026-11-10", 13),
        booking("2026-11-10", 14),
        booking("2026-11-11", 10),
      ],
    });

    expect(result.buckets.map((bucket) => bucket.rideHours)).toEqual([1, 1, 0]);
  });

  it.each([
    ["31 dni — dni", "2026-10-01", "2026-10-31", "day", 31],
    ["32 dni — tygodnie", "2026-10-01", "2026-11-01", "week", 5],
    ["184 dni — tygodnie", "2026-05-01", "2026-10-31", "week", 27],
    ["185 dni — miesiące", "2026-05-01", "2026-11-01", "month", 7],
  ])("podziałka dobiera się z długości okresu: %s", (_label, from, to, granularity, bucketCount) => {
    const result = series({ period: { from, to } });

    expect(result.granularity).toBe(granularity);
    expect(result.buckets).toHaveLength(bucketCount);
  });

  it("tygodnie biegną od poniedziałku do niedzieli i są przycięte do krańców okresu", () => {
    // 1 października 2026 to czwartek, 1 listopada — niedziela.
    const result = series({
      period: { from: "2026-10-01", to: "2026-11-01" },
      bookings: [booking("2026-10-04", 10), booking("2026-10-05", 10), booking("2026-10-11", 10)],
    });

    expect(result.buckets).toEqual([
      { from: "2026-10-01", to: "2026-10-04", rideHours: 1 },
      { from: "2026-10-05", to: "2026-10-11", rideHours: 2 },
      { from: "2026-10-12", to: "2026-10-18", rideHours: 0 },
      { from: "2026-10-19", to: "2026-10-25", rideHours: 0 },
      { from: "2026-10-26", to: "2026-11-01", rideHours: 0 },
    ]);
  });

  it("miesiące są kalendarzowe i przycięte do krańców okresu, także przez granicę roku", () => {
    const result = series(
      {
        period: { from: "2025-11-15", to: "2026-06-10" },
        bookings: [booking("2025-11-30", 10), booking("2025-12-01", 10), booking("2026-02-28", 10)],
      },
      NOW,
    );

    expect(result.buckets).toEqual([
      { from: "2025-11-15", to: "2025-11-30", rideHours: 1 },
      { from: "2025-12-01", to: "2025-12-31", rideHours: 1 },
      { from: "2026-01-01", to: "2026-01-31", rideHours: 0 },
      { from: "2026-02-01", to: "2026-02-28", rideHours: 1 },
      { from: "2026-03-01", to: "2026-03-31", rideHours: 0 },
      { from: "2026-04-01", to: "2026-04-30", rideHours: 0 },
      { from: "2026-05-01", to: "2026-05-31", rideHours: 0 },
      { from: "2026-06-01", to: "2026-06-10", rideHours: 0 },
    ]);
  });

  it.each([
    ["dni", "2026-11-01", "2026-11-10"],
    ["tygodnie", "2026-09-01", "2026-11-10"],
    ["miesiące", "2026-01-01", "2026-11-10"],
  ])("suma serii zgadza się z godzinami jazd w podsumowaniu: %s", (_label, from, to) => {
    const stats = computeStableStats(
      input({
        period: { from, to },
        bookings: [
          booking(from, 10),
          booking(from, 11),
          booking("2026-11-02", 10),
          booking("2026-11-09", 10),
          booking("2026-11-09", 11, { status: "cancelled" }),
          booking("2026-11-10", 13),
          booking("2026-11-10", 15),
          booking("2026-12-01", 10),
        ],
      }),
      NOW,
    );

    const total = stats.rideHoursOverTime.buckets.reduce((sum, bucket) => sum + bucket.rideHours, 0);

    expect(total).toBe(5);
    expect(stats.summary.rideHours).toBe(5);
  });
});
