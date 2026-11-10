import { describe, expect, it } from "vitest";
import { computeStableStats, type StatsBooking, type StatsInput, type StatsScheduleDay } from "@/lib/stats/stats";

const BELLA = 1;
const KASZTAN = 2;

/** 10 listopada 2026, 14:30 w Warszawie (CET, UTC+1) — godzina 13 już się skończyła, 14 trwa. */
const NOW = new Date("2026-11-10T13:30:00Z");

function day(iso: string, overrides: Partial<StatsScheduleDay> = {}): StatsScheduleDay {
  return { day: iso, openHour: 10, closeHour: 12, horseIds: [BELLA, KASZTAN], ...overrides };
}

function booking(iso: string, hour: number, overrides: Partial<StatsBooking> = {}): StatsBooking {
  return { day: iso, horseId: BELLA, hour, status: "active", riderId: "rider-anna", ...overrides };
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

describe("computeStableStats — granica jazdy", () => {
  it("aktywny zapis z minionego dnia jest jazdą", () => {
    const stats = computeStableStats(input({ days: [day("2026-11-05")], bookings: [booking("2026-11-05", 10)] }), NOW);

    expect(stats.summary.rides).toBe(1);
  });

  it("dziś liczy się godzina zakończona, a trwająca i przyszła nie", () => {
    const today = day("2026-11-10", { openHour: 12, closeHour: 17 });
    const bookings = [booking("2026-11-10", 13), booking("2026-11-10", 14), booking("2026-11-10", 15)];

    const stats = computeStableStats(input({ days: [today], bookings }), NOW);

    expect(stats.summary.rides).toBe(1);
  });

  it("godzina kończąca się dokładnie teraz jest już jazdą", () => {
    // 15:00:00 w Warszawie — slot 14:00–15:00 właśnie się skończył.
    const stats = computeStableStats(
      input({ days: [day("2026-11-10", { openHour: 14, closeHour: 16 })], bookings: [booking("2026-11-10", 14)] }),
      new Date("2026-11-10T14:00:00Z"),
    );

    expect(stats.summary.rides).toBe(1);
  });

  it("granica dnia jest liczona w czasie polskim, nie w UTC", () => {
    // 23:30 UTC 9 listopada to już 00:30 10 listopada w Warszawie: cały 9 listopada minął,
    // choć w UTC godzina 23 dopiero trwa.
    const stats = computeStableStats(
      input({
        days: [day("2026-11-09", { openHour: 22, closeHour: 24 })],
        bookings: [booking("2026-11-09", 23)],
      }),
      new Date("2026-11-09T23:30:00Z"),
    );

    expect(stats.summary.rides).toBe(1);
  });

  it("latem (CEST) godzina kończy się o dwie godziny wcześniej w UTC", () => {
    // 09:30 UTC 10 lipca to 11:30 w Warszawie: godzina 10 skończona, 11 trwa.
    const stats = computeStableStats(
      input({
        period: { from: "2026-07-01", to: "2026-07-10" },
        days: [day("2026-07-10")],
        bookings: [booking("2026-07-10", 10), booking("2026-07-10", 11)],
      }),
      new Date("2026-07-10T09:30:00Z"),
    );

    expect(stats.summary.rides).toBe(1);
  });

  it("zapis odwołany nie jest jazdą", () => {
    const stats = computeStableStats(
      input({ days: [day("2026-11-05")], bookings: [booking("2026-11-05", 10, { status: "cancelled" })] }),
      NOW,
    );

    expect(stats.summary.rides).toBe(0);
  });
});

describe("computeStableStats — podsumowanie okresu", () => {
  it("godziny jazd to suma czasu trwania jazd", () => {
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05"), day("2026-11-06")],
        bookings: [
          booking("2026-11-05", 10),
          booking("2026-11-05", 11),
          booking("2026-11-06", 10, { horseId: KASZTAN }),
          booking("2026-11-06", 11, { status: "cancelled" }),
        ],
      }),
      NOW,
    );

    expect(stats.summary.rides).toBe(3);
    expect(stats.summary.rideHours).toBe(3);
  });

  it("odwołanie należy do okresu według terminu zapisu", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-08" },
        days: [day("2026-10-31"), day("2026-11-03"), day("2026-11-09")],
        bookings: [
          booking("2026-10-31", 10, { status: "cancelled" }),
          booking("2026-11-03", 10, { status: "cancelled" }),
          booking("2026-11-03", 11, { status: "cancelled", horseId: KASZTAN }),
          booking("2026-11-09", 10, { status: "cancelled" }),
        ],
      }),
      NOW,
    );

    expect(stats.summary.cancellations).toBe(2);
    expect(stats.summary.rides).toBe(0);
  });

  it("odwołanie liczy się dopiero, gdy godzina jego slotu się skończyła", () => {
    // Dziś o 14:30: godzina 13 zakończona, 14 trwa, 15 i jutro jeszcze nie nadeszły.
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-30" },
        days: [day("2026-11-10", { openHour: 12, closeHour: 17 }), day("2026-11-11")],
        bookings: [
          booking("2026-11-10", 13, { status: "cancelled" }),
          booking("2026-11-10", 14, { status: "cancelled" }),
          booking("2026-11-10", 15, { status: "cancelled" }),
          booking("2026-11-11", 10, { status: "cancelled" }),
        ],
      }),
      NOW,
    );

    expect(stats.summary.cancellations).toBe(1);
  });

  it("okres z samymi odwołaniami na przyszłe godziny jest pusty", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-30" },
        days: [day("2026-11-11")],
        bookings: [booking("2026-11-11", 10, { status: "cancelled" })],
      }),
      NOW,
    );

    expect(stats.isEmpty).toBe(true);
  });

  it("slot odwołany i zajęty ponownie to jedno odwołanie i jedna jazda", () => {
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05", { openHour: 10, closeHour: 11, horseIds: [BELLA] })],
        bookings: [booking("2026-11-05", 10, { status: "cancelled" }), booking("2026-11-05", 10)],
      }),
      NOW,
    );

    expect(stats.summary).toEqual({ rides: 1, rideHours: 1, occupancyPercent: 100, cancellations: 1 });
  });
});

describe("computeStableStats — obłożenie grafiku", () => {
  it("jazdy dzielone przez wystawione sloty: godzina z zakresu pracy × koń przydzielony do dnia", () => {
    // 2 godziny × 2 konie = 4 sloty, 1 jazda.
    const stats = computeStableStats(input({ days: [day("2026-11-05")], bookings: [booking("2026-11-05", 10)] }), NOW);

    expect(stats.summary.occupancyPercent).toBe(25);
  });

  it("do mianownika wchodzą tylko sloty, których godzina już minęła", () => {
    // Wczoraj: 2 godziny × 1 koń = 2 sloty. Dziś o 14:30 z zakresu 12–17 minęły godziny
    // 12 i 13 (2 sloty). Jutro: nic. Razem 4 minione sloty i 3 jazdy.
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-30" },
        days: [
          day("2026-11-09", { horseIds: [BELLA] }),
          day("2026-11-10", { openHour: 12, closeHour: 17, horseIds: [BELLA] }),
          day("2026-11-11", { horseIds: [BELLA] }),
        ],
        bookings: [
          booking("2026-11-09", 10),
          booking("2026-11-09", 11),
          booking("2026-11-10", 13),
          booking("2026-11-10", 15),
          booking("2026-11-11", 10),
        ],
      }),
      NOW,
    );

    expect(stats.summary.occupancyPercent).toBe(75);
  });

  it("dni grafiku spoza okresu nie wchodzą do mianownika", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-05", to: "2026-11-05" },
        days: [day("2026-11-04"), day("2026-11-05", { openHour: 10, closeHour: 11 }), day("2026-11-06")],
        bookings: [booking("2026-11-05", 10)],
      }),
      NOW,
    );

    expect(stats.summary.occupancyPercent).toBe(50);
  });

  it("procent jest zaokrąglany do liczby całkowitej", () => {
    // 1 jazda na 3 sloty (3 godziny × 1 koń).
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05", { openHour: 10, closeHour: 13, horseIds: [BELLA] })],
        bookings: [booking("2026-11-05", 10)],
      }),
      NOW,
    );

    expect(stats.summary.occupancyPercent).toBe(33);
  });

  it("wystawiony grafik bez jazd to 0%, nie brak danych", () => {
    const stats = computeStableStats(input({ days: [day("2026-11-05")] }), NOW);

    expect(stats.summary.occupancyPercent).toBe(0);
  });

  it.each([
    ["brak grafiku w okresie", []],
    ["dzień bez przydzielonych koni", [day("2026-11-05", { horseIds: [] })]],
    ["grafik tylko na dni, które nie nadeszły", [day("2026-11-11")]],
  ])("bez minionych slotów obłożenie to brak danych, nie zero: %s", (_label, days) => {
    const stats = computeStableStats(input({ period: { from: "2026-11-01", to: "2026-11-30" }, days }), NOW);

    expect(stats.summary.occupancyPercent).toBeNull();
  });
});

describe("computeStableStats — okres statystyk", () => {
  it("oba krańce okresu należą do okresu, dni spoza niego nie", () => {
    const bookings = [
      booking("2026-10-31", 10),
      booking("2026-11-01", 10),
      booking("2026-11-08", 10),
      booking("2026-11-09", 10),
    ];

    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-08" },
        days: ["2026-10-31", "2026-11-01", "2026-11-08", "2026-11-09"].map((iso) => day(iso)),
        bookings,
      }),
      NOW,
    );

    expect(stats.summary.rides).toBe(2);
  });

  it("okres bez jazd i odwołań jest pusty", () => {
    // Zapis na przyszłą godzinę nie jest ani jazdą, ani odwołaniem.
    const stats = computeStableStats(
      input({ days: [day("2026-11-10", { openHour: 16, closeHour: 18 })], bookings: [booking("2026-11-10", 16)] }),
      NOW,
    );

    expect(stats.isEmpty).toBe(true);
    expect(stats.summary).toEqual({ rides: 0, rideHours: 0, occupancyPercent: null, cancellations: 0 });
  });

  it("okres z samym odwołaniem nie jest pusty", () => {
    const stats = computeStableStats(
      input({ days: [day("2026-11-05")], bookings: [booking("2026-11-05", 10, { status: "cancelled" })] }),
      NOW,
    );

    expect(stats.isEmpty).toBe(false);
  });

  it("okres sięgający w przyszłość pomija przyszłe zapisy", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-30" },
        days: [day("2026-11-09"), day("2026-11-20")],
        bookings: [booking("2026-11-09", 10), booking("2026-11-20", 10)],
      }),
      NOW,
    );

    expect(stats.summary.rides).toBe(1);
  });
});
