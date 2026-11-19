import { describe, expect, it } from "vitest";
import {
  formatCount,
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

describe("formatCount", () => {
  // Oracle: polska odmiana liczebników (spec #83, US 10) — „1 zapis”, „2 zapisy”, „5 zapisów”.
  const BOOKING = { one: "zapis", few: "zapisy", many: "zapisów" };

  it("odmienia rzeczownik po liczbie: 1 / 2–4 / 5+", () => {
    expect(formatCount(1, BOOKING)).toBe("1 zapis");
    expect(formatCount(2, BOOKING)).toBe("2 zapisy");
    expect(formatCount(4, BOOKING)).toBe("4 zapisy");
    expect(formatCount(5, BOOKING)).toBe("5 zapisów");
    expect(formatCount(0, BOOKING)).toBe("0 zapisów");
  });

  it("nastki 12–14 idą z formą dopełniaczową, a 22 znowu z formą „kilka”", () => {
    expect(formatCount(12, BOOKING)).toBe("12 zapisów");
    expect(formatCount(13, BOOKING)).toBe("13 zapisów");
    expect(formatCount(14, BOOKING)).toBe("14 zapisów");
    expect(formatCount(21, BOOKING)).toBe("21 zapisów");
    expect(formatCount(22, BOOKING)).toBe("22 zapisy");
  });
});
