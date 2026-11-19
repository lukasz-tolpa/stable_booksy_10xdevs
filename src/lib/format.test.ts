import { describe, expect, it } from "vitest";
import {
  formatFreeSeats,
  formatHours,
  formatLongDate,
  formatLongDateWithYear,
  formatNumber,
  formatTakenSeats,
} from "@/lib/format";

// Polski zapis grupuje tysiące twardą spacją (U+00A0) dopiero od pięciu cyfr.
describe("formatNumber", () => {
  it("zapisuje liczbę po polsku", () => {
    expect(formatNumber(7)).toBe("7");
    expect(formatNumber(12345)).toBe("12 345");
    expect(formatNumber(1.5)).toBe("1,5");
  });
});

describe("formatFreeSeats", () => {
  // Oracle: AC #41 — „2 z 4 wolne".
  it("zapisuje wolne miejsca slotu wobec limitu", () => {
    expect(formatFreeSeats(2, 4)).toBe("2 z 4 wolne");
    expect(formatFreeSeats(0, 1)).toBe("0 z 1 wolne");
  });
});

describe("formatTakenSeats", () => {
  // Oracle: #72 — „liczba zajętych miejsc / limit” przy slocie instruktora.
  it("zapisuje zajęte miejsca slotu wobec limitu", () => {
    expect(formatTakenSeats(1, 2)).toBe("zajęte 1 z 2");
    expect(formatTakenSeats(0, 1)).toBe("zajęte 0 z 1");
  });
});

describe("formatLongDate", () => {
  it("zapisuje dzień grafiku z dniem tygodnia, bez roku", () => {
    expect(formatLongDate("2026-11-18")).toBe("środa, 18 listopada");
    expect(formatLongDate("2026-03-01")).toBe("niedziela, 1 marca");
  });
});

describe("formatLongDateWithYear", () => {
  it("zapisuje dzień nawigacji dniami z dniem tygodnia i rokiem", () => {
    expect(formatLongDateWithYear("2026-11-18")).toBe("środa, 18 listopada 2026");
    expect(formatLongDateWithYear("2027-01-01")).toBe("piątek, 1 stycznia 2027");
  });
});

describe("formatHours", () => {
  it("dokleja jednostkę godzin do liczby w zapisie polskim", () => {
    expect(formatHours(0)).toBe("0 h");
    expect(formatHours(12345)).toBe("12 345 h");
  });
});
