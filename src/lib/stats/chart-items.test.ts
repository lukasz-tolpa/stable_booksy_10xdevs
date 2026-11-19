import { describe, expect, it } from "vitest";
import { rideHoursBars } from "@/lib/stats/chart-items";

describe("rideHoursBars", () => {
  it("słupek na każdy przedział serii godzin jazd: krótka etykieta, pełna data i godziny", () => {
    const bars = rideHoursBars({
      granularity: "day",
      buckets: [
        { from: "2026-11-09", to: "2026-11-09", rideHours: 0 },
        { from: "2026-11-10", to: "2026-11-10", rideHours: 3 },
      ],
    });

    expect(bars).toEqual([
      { label: "9.11", longLabel: "9 listopada 2026", value: 0, valueText: "0 h" },
      { label: "10.11", longLabel: "10 listopada 2026", value: 3, valueText: "3 h" },
    ]);
  });
});
