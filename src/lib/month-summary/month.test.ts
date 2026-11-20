import { describe, expect, it } from "vitest";
import { monthSearch, resolveSummaryMonth } from "@/lib/month-summary/month";

// Piątek 20 listopada 2026 — „dziś” w strefie ośrodka.
const TODAY = "2026-11-20";

describe("resolveSummaryMonth — miesiąc z adresu (`?miesiac=RRRR-MM`)", () => {
  it("bez parametru daje bieżący miesiąc od 1. do ostatniego dnia, bez następnego", () => {
    expect(resolveSummaryMonth(null, TODAY)).toEqual({
      month: "2026-11",
      from: "2026-11-01",
      to: "2026-11-30",
      previous: "2026-10",
      next: null,
      isCurrent: true,
    });
  });

  it("błędna wartość daje bieżący miesiąc", () => {
    for (const raw of ["", "2026-13", "2026-00", "2026-1", "listopad", "2026-11-05", "abcd-ef"]) {
      expect(resolveSummaryMonth(raw, TODAY).month, raw).toBe("2026-11");
    }
  });

  it("przyszły miesiąc daje bieżący — przyszłe miesiące nie mają jazd", () => {
    expect(resolveSummaryMonth("2026-12", TODAY).month).toBe("2026-11");
  });

  it("miniony miesiąc ma granice, poprzedni i następny", () => {
    expect(resolveSummaryMonth("2026-10", TODAY)).toEqual({
      month: "2026-10",
      from: "2026-10-01",
      to: "2026-10-31",
      previous: "2026-09",
      next: "2026-11",
      isCurrent: false,
    });
  });

  it("luty kończy się 28., a w roku przestępnym 29.", () => {
    expect(resolveSummaryMonth("2026-02", TODAY).to).toBe("2026-02-28");
    expect(resolveSummaryMonth("2024-02", TODAY).to).toBe("2024-02-29");
  });

  it("przejście roku: przed styczniem jest grudzień poprzedniego roku, po grudniu — styczeń", () => {
    expect(resolveSummaryMonth("2026-01", TODAY).previous).toBe("2025-12");
    expect(resolveSummaryMonth("2025-12", TODAY).next).toBe("2026-01");
  });

  it("w styczniu bieżącym miesiącem jest styczeń, a poprzednim grudzień", () => {
    expect(resolveSummaryMonth(null, "2027-01-03")).toMatchObject({
      month: "2027-01",
      previous: "2026-12",
      next: null,
    });
  });

  it("wstecz bez limitu", () => {
    expect(resolveSummaryMonth("1999-03", TODAY)).toMatchObject({ month: "1999-03", next: "1999-04" });
  });
});

describe("monthSearch", () => {
  it("zapisuje miesiąc w parametrze adresu", () => {
    expect(monthSearch("2026-10")).toBe("?miesiac=2026-10");
  });
});
