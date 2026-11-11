import { describe, expect, it } from "vitest";
import { formatHours, formatNumber } from "@/lib/format";

// Polski zapis grupuje tysiące twardą spacją (U+00A0) dopiero od pięciu cyfr.
describe("formatNumber", () => {
  it("zapisuje liczbę po polsku", () => {
    expect(formatNumber(7)).toBe("7");
    expect(formatNumber(12345)).toBe("12 345");
    expect(formatNumber(1.5)).toBe("1,5");
  });
});

describe("formatHours", () => {
  it("dokleja jednostkę godzin do liczby w zapisie polskim", () => {
    expect(formatHours(0)).toBe("0 h");
    expect(formatHours(12345)).toBe("12 345 h");
  });
});
