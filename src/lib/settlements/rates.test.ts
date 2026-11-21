import { describe, expect, it } from "vitest";
import { stableRateFor, stableRateSchedule, type RateChange } from "@/lib/settlements/rates";

let nextId = 1;
function change(fromMonth: string, amount: number | null, riderKey: string | null = null): RateChange {
  return { id: nextId++, riderKey, fromMonth, amount };
}

// Oracle: GLOSSARY „Stawka”, AC #94 — obowiązuje najpóźniejsza zmiana „od” ≤ miesiąc, a gdy żadnej —
// pierwsza stawka ośrodka (wstecz); kolejne zmiany nie przeliczają minionych miesięcy.
describe("stableRateFor — obowiązująca stawka ośrodka w miesiącu", () => {
  it("bez żadnej stawki ośrodka nie ma stawki", () => {
    expect(stableRateFor([], "2026-11")).toBeNull();
  });

  it("pierwsza stawka ośrodka obowiązuje też we wszystkich wcześniejszych miesiącach", () => {
    const changes = [change("2026-11", 12000)];
    expect(stableRateFor(changes, "2025-03")).toEqual({ amount: 12000, source: "stable" });
    expect(stableRateFor(changes, "2026-10")).toEqual({ amount: 12000, source: "stable" });
    expect(stableRateFor(changes, "2026-11")).toEqual({ amount: 12000, source: "stable" });
  });

  it("zmiana od miesiąca obowiązuje od niego dalej, a miniony miesiąc zostaje przy poprzedniej stawce", () => {
    const changes = [change("2027-01", 14000), change("2026-10", 12000)];
    expect(stableRateFor(changes, "2026-09")?.amount).toBe(12000);
    expect(stableRateFor(changes, "2026-12")?.amount).toBe(12000);
    expect(stableRateFor(changes, "2027-01")?.amount).toBe(14000);
    expect(stableRateFor(changes, "2027-05")?.amount).toBe(14000);
  });

  it("najpóźniejsza zmiana nie późniejsza niż miesiąc wygrywa", () => {
    const changes = [change("2026-08", 10000), change("2026-11", 13000), change("2026-10", 12000)];
    expect(stableRateFor(changes, "2026-10")?.amount).toBe(12000);
    expect(stableRateFor(changes, "2026-11")?.amount).toBe(13000);
  });

  it("stawka 0,00 zł to stawka, nie jej brak", () => {
    expect(stableRateFor([change("2026-11", 0)], "2026-11")).toEqual({ amount: 0, source: "stable" });
  });

  it("stawki indywidualne jeźdźców nie są stawką ośrodka", () => {
    const changes = [change("2026-10", 9000, "anna"), change("2026-11", 12000)];
    expect(stableRateFor(changes, "2026-10")?.amount).toBe(12000);
    expect(stableRateFor([change("2026-10", 9000, "anna")], "2026-10")).toBeNull();
  });
});

describe("stableRateSchedule — stawka ośrodka dziś i zaplanowana zmiana", () => {
  it("bez stawki ośrodka nie ma ani bieżącej, ani zaplanowanej", () => {
    expect(stableRateSchedule([change("2026-12", 9000, "anna")], "2026-11")).toEqual({
      current: null,
      planned: null,
    });
  });

  it("zaplanowana zmiana od następnego miesiąca nie działa w bieżącym", () => {
    const planned = change("2026-12", 14000);
    const schedule = stableRateSchedule([change("2026-09", 12000), planned], "2026-11");
    expect(schedule).toEqual({
      current: 12000,
      planned: { id: planned.id, fromMonth: "2026-12", amount: 14000 },
    });
  });

  it("zmiana od bieżącego miesiąca jest bieżącą stawką, nie zaplanowaną", () => {
    expect(stableRateSchedule([change("2026-09", 12000), change("2026-11", 13000)], "2026-11")).toEqual({
      current: 13000,
      planned: null,
    });
  });

  it("pierwsza stawka zaplanowana od następnego miesiąca obowiązuje wstecz także w bieżącym", () => {
    const planned = change("2026-12", 14000);
    expect(stableRateSchedule([planned], "2026-11")).toEqual({
      current: 14000,
      planned: { id: planned.id, fromMonth: "2026-12", amount: 14000 },
    });
  });
});
