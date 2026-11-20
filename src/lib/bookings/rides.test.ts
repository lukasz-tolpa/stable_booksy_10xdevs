import { describe, expect, it } from "vitest";
import { isRide, slotEndedAt } from "@/lib/bookings/rides";

/** 10 listopada 2026, 14:30 w Warszawie (CET, UTC+1) — godzina 13 już się skończyła, 14 trwa. */
const NOW = new Date("2026-11-10T13:30:00Z");

describe("slotEndedAt — koniec slotu w strefie ośrodka", () => {
  const ended = slotEndedAt(NOW);

  it("slot z minionego dnia się skończył, z jutra — nie", () => {
    expect(ended("2026-11-09", 15)).toBe(true);
    expect(ended("2026-11-11", 8)).toBe(false);
  });

  it("dziś skończona jest godzina zakończona, a trwająca i przyszła nie", () => {
    expect(ended("2026-11-10", 13)).toBe(true);
    expect(ended("2026-11-10", 14)).toBe(false);
    expect(ended("2026-11-10", 15)).toBe(false);
  });

  it("slot kończący się dokładnie teraz jest zakończony", () => {
    // 15:00 w Warszawie: godzina 14 skończyła się w tej chwili.
    expect(slotEndedAt(new Date("2026-11-10T14:00:00Z"))("2026-11-10", 14)).toBe(true);
  });
});

describe("isRide — jazda to aktywny zapis po końcu slotu", () => {
  const ended = slotEndedAt(NOW);

  it("aktywny zapis na zakończonym slocie jest jazdą", () => {
    expect(isRide({ day: "2026-11-09", hour: 10, status: "active" }, ended)).toBe(true);
  });

  it("odwołany zapis na zakończonym slocie nie jest jazdą", () => {
    expect(isRide({ day: "2026-11-09", hour: 10, status: "cancelled" }, ended)).toBe(false);
  });

  it("aktywny zapis na trwającym albo przyszłym slocie nie jest jazdą", () => {
    expect(isRide({ day: "2026-11-10", hour: 14, status: "active" }, ended)).toBe(false);
    expect(isRide({ day: "2026-11-12", hour: 10, status: "active" }, ended)).toBe(false);
  });
});
