import { describe, expect, it } from "vitest";
import { computeStableStats, type StatsBooking, type StatsInput } from "@/lib/stats/stats";

const BELLA = 1;
const KASZTAN = 2;
const ANNA = "rider-anna";
const PIOTR = "rider-piotr";

/** 10 listopada 2026, 14:30 w Warszawie — godzina 13 już się skończyła, 14 trwa. */
const NOW = new Date("2026-11-10T13:30:00Z");

function booking(iso: string, hour: number, riderId: string, overrides: Partial<StatsBooking> = {}): StatsBooking {
  return { day: iso, horseId: BELLA, hour, status: "active", riderId, ...overrides };
}

function input(overrides: Partial<StatsInput> = {}): StatsInput {
  return {
    period: { from: "2026-11-01", to: "2026-11-10" },
    days: [],
    bookings: [],
    riders: [
      { id: ANNA, name: "Anna Kowalska" },
      { id: PIOTR, name: "Piotr Nowak" },
    ],
    horses: [
      { id: BELLA, name: "Bella" },
      { id: KASZTAN, name: "Kasztan" },
    ],
    ...overrides,
  };
}

describe("computeStableStats — tabela jeźdźców", () => {
  it("liczy jazdy, godziny jazd i odwołania każdego jeźdźca", () => {
    const stats = computeStableStats(
      input({
        bookings: [
          booking("2026-11-03", 10, ANNA),
          booking("2026-11-04", 10, ANNA),
          booking("2026-11-05", 10, ANNA, { status: "cancelled" }),
          booking("2026-11-03", 11, PIOTR),
          booking("2026-11-04", 11, PIOTR, { status: "cancelled" }),
          booking("2026-11-05", 11, PIOTR, { status: "cancelled" }),
        ],
      }),
      NOW,
    );

    expect(stats.riders.map(({ horses: _horses, ...row }) => row)).toEqual([
      { riderId: ANNA, name: "Anna Kowalska", rides: 2, rideHours: 2, cancellations: 1 },
      { riderId: PIOTR, name: "Piotr Nowak", rides: 1, rideHours: 1, cancellations: 2 },
    ]);
  });

  it("rozbija jazdy jeźdźca na konie, od konia najczęściej dosiadanego", () => {
    const stats = computeStableStats(
      input({
        bookings: [
          booking("2026-11-03", 10, ANNA, { horseId: BELLA }),
          booking("2026-11-04", 10, ANNA, { horseId: KASZTAN }),
          booking("2026-11-05", 10, ANNA, { horseId: KASZTAN }),
          // Odwołanie nie jest jazdą na koniu.
          booking("2026-11-06", 10, ANNA, { horseId: BELLA, status: "cancelled" }),
          booking("2026-11-06", 11, PIOTR, { horseId: BELLA }),
        ],
      }),
      NOW,
    );

    expect(stats.riders.map((row) => [row.name, row.horses])).toEqual([
      [
        "Anna Kowalska",
        [
          { horseId: KASZTAN, horseName: "Kasztan", rides: 2 },
          { horseId: BELLA, horseName: "Bella", rides: 1 },
        ],
      ],
      ["Piotr Nowak", [{ horseId: BELLA, horseName: "Bella", rides: 1 }]],
    ]);
  });

  it("sortuje od najaktywniejszego jeźdźca, a remis rozstrzyga nazwą", () => {
    const stats = computeStableStats(
      input({
        riders: [
          { id: "r-z", name: "Zofia Lis" },
          { id: "r-a", name: "Adam Bąk" },
          { id: "r-c", name: "Celina Wilk" },
        ],
        bookings: [
          booking("2026-11-03", 10, "r-z"),
          booking("2026-11-03", 11, "r-a"),
          booking("2026-11-04", 10, "r-c"),
          booking("2026-11-04", 11, "r-c"),
        ],
      }),
      NOW,
    );

    expect(stats.riders.map((row) => row.name)).toEqual(["Celina Wilk", "Adam Bąk", "Zofia Lis"]);
  });

  it("jeździec z samymi odwołaniami jest widoczny z zerem jazd, na końcu tabeli", () => {
    const stats = computeStableStats(
      input({
        bookings: [
          booking("2026-11-03", 10, ANNA, { status: "cancelled" }),
          booking("2026-11-04", 10, ANNA, { status: "cancelled" }),
          booking("2026-11-03", 11, PIOTR),
        ],
      }),
      NOW,
    );

    expect(stats.riders).toEqual([
      expect.objectContaining({ riderId: PIOTR, rides: 1 }),
      { riderId: ANNA, name: "Anna Kowalska", rides: 0, rideHours: 0, cancellations: 2, horses: [] },
    ]);
  });

  it("dwie osoby o tej samej nazwie to osobne wiersze — rozróżnia konto, nie nazwa", () => {
    const stats = computeStableStats(
      input({
        riders: [
          { id: "konto-1", name: "Jan Kowalski" },
          { id: "konto-2", name: "Jan Kowalski" },
        ],
        bookings: [
          booking("2026-11-03", 10, "konto-1"),
          booking("2026-11-04", 10, "konto-1"),
          booking("2026-11-03", 11, "konto-2", { horseId: KASZTAN }),
          booking("2026-11-05", 11, "konto-2", { status: "cancelled" }),
        ],
      }),
      NOW,
    );

    expect(stats.riders).toEqual([
      {
        riderId: "konto-1",
        name: "Jan Kowalski",
        rides: 2,
        rideHours: 2,
        cancellations: 0,
        horses: [{ horseId: BELLA, horseName: "Bella", rides: 2 }],
      },
      {
        riderId: "konto-2",
        name: "Jan Kowalski",
        rides: 1,
        rideHours: 1,
        cancellations: 1,
        horses: [{ horseId: KASZTAN, horseName: "Kasztan", rides: 1 }],
      },
    ]);
  });

  it("pomija zapisy spoza okresu oraz te, których godzina jeszcze się nie skończyła", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-05", to: "2026-11-30" },
        bookings: [
          booking("2026-11-04", 10, ANNA),
          booking("2026-11-05", 10, ANNA),
          // Dziś o 14:30: godzina 14 trwa, jutro nie nadeszło.
          booking("2026-11-10", 14, ANNA),
          booking("2026-11-10", 14, PIOTR, { horseId: KASZTAN, status: "cancelled" }),
          booking("2026-11-11", 10, PIOTR),
        ],
      }),
      NOW,
    );

    expect(stats.riders).toEqual([
      {
        riderId: ANNA,
        name: "Anna Kowalska",
        rides: 1,
        rideHours: 1,
        cancellations: 0,
        horses: [{ horseId: BELLA, horseName: "Bella", rides: 1 }],
      },
    ]);
  });

  it("sumy z tabeli zgadzają się z podsumowaniem okresu", () => {
    const stats = computeStableStats(
      input({
        bookings: [
          booking("2026-11-03", 10, ANNA),
          booking("2026-11-03", 11, ANNA, { horseId: KASZTAN }),
          booking("2026-11-04", 10, ANNA, { status: "cancelled" }),
          booking("2026-11-04", 11, PIOTR),
          booking("2026-11-05", 10, PIOTR, { status: "cancelled" }),
          booking("2026-11-05", 11, PIOTR, { status: "cancelled" }),
        ],
      }),
      NOW,
    );

    // Wartości wypisane wprost z danych powyżej: 3 jazdy, 3 odwołania.
    expect(stats.summary).toMatchObject({ rides: 3, rideHours: 3, cancellations: 3 });
    expect(stats.riders.map((row) => row.rides)).toEqual([2, 1]);
    expect(stats.riders.map((row) => row.rideHours)).toEqual([2, 1]);
    expect(stats.riders.map((row) => row.cancellations)).toEqual([1, 2]);
  });

  it("jeździec bez nazwy w profilu dostaje tekst zastępczy, a nieznany koń — identyfikator", () => {
    const stats = computeStableStats(
      input({
        riders: [{ id: ANNA, name: null }],
        horses: [],
        bookings: [booking("2026-11-03", 10, ANNA, { horseId: 7 })],
      }),
      NOW,
    );

    expect(stats.riders).toEqual([
      expect.objectContaining({ name: "(bez nazwiska)", horses: [{ horseId: 7, horseName: "(koń #7)", rides: 1 }] }),
    ]);
  });

  it("okres bez jazd i odwołań ma pustą tabelę", () => {
    expect(computeStableStats(input(), NOW).riders).toEqual([]);
  });
});
