import { describe, expect, it } from "vitest";
import { bucketLabels } from "@/lib/stats/time-series-labels";

describe("bucketLabels", () => {
  it("dzień: krótko dzień i miesiąc, w pełni data słownie", () => {
    expect(bucketLabels({ from: "2026-11-09", to: "2026-11-09", rideHours: 0 }, "day")).toEqual({
      short: "9.11",
      long: "9 listopada 2026",
    });
  });

  it("tydzień: krótko pierwszy dzień, w pełni zakres dat", () => {
    expect(bucketLabels({ from: "2026-10-26", to: "2026-11-01", rideHours: 0 }, "week")).toEqual({
      short: "26.10",
      long: "26 października 2026 – 1 listopada 2026",
    });
  });

  it("tydzień przycięty do jednego dnia jest opisany jak dzień", () => {
    expect(bucketLabels({ from: "2026-11-02", to: "2026-11-02", rideHours: 0 }, "week").long).toBe("2 listopada 2026");
  });

  it("miesiąc: krótko numer miesiąca z rokiem, w pełni nazwa miesiąca z rokiem", () => {
    expect(bucketLabels({ from: "2025-12-01", to: "2025-12-31", rideHours: 0 }, "month")).toEqual({
      short: "12.2025",
      long: "grudzień 2025",
    });
  });
});
