import { describe, expect, it } from "vitest";
import { defaultStatsPeriod, resolveStatsPeriod } from "@/lib/stats/period";

const TODAY = "2026-11-10";
const DEFAULT = { from: "2026-11-01", to: "2026-11-10" };

describe("defaultStatsPeriod", () => {
  it("to bieżący miesiąc od 1. dnia do dziś", () => {
    expect(defaultStatsPeriod(TODAY)).toEqual(DEFAULT);
  });

  it("pierwszego dnia miesiąca okres ma jeden dzień", () => {
    expect(defaultStatsPeriod("2026-12-01")).toEqual({ from: "2026-12-01", to: "2026-12-01" });
  });
});

describe("resolveStatsPeriod", () => {
  it("poprawny zakres z adresu jest okresem, bez limitu długości", () => {
    expect(resolveStatsPeriod("2020-01-01", "2026-12-31", TODAY)).toEqual({
      period: { from: "2020-01-01", to: "2026-12-31" },
      reversed: false,
    });
  });

  it("okres jednodniowy jest poprawny", () => {
    expect(resolveStatsPeriod("2026-11-05", "2026-11-05", TODAY)).toEqual({
      period: { from: "2026-11-05", to: "2026-11-05" },
      reversed: false,
    });
  });

  it.each([
    ["brak obu parametrów", null, null],
    ["brak „do”", "2026-10-01", null],
    ["brak „od”", null, "2026-10-31"],
    ["pusty ciąg", "", ""],
    ["nie-data", "wczoraj", "2026-10-31"],
    ["data spoza kalendarza", "2026-02-30", "2026-03-10"],
    ["zły format", "01.10.2026", "31.10.2026"],
  ])("okres domyślny, gdy: %s", (_label, from, to) => {
    expect(resolveStatsPeriod(from, to, TODAY)).toEqual({ period: DEFAULT, reversed: false });
  });

  it("„od” późniejsze niż „do” zachowuje wpisane daty i zgłasza odwrócony zakres", () => {
    expect(resolveStatsPeriod("2026-11-09", "2026-11-03", TODAY)).toEqual({
      period: { from: "2026-11-09", to: "2026-11-03" },
      reversed: true,
    });
  });
});
