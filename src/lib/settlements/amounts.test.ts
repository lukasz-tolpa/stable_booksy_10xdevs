import { describe, expect, it } from "vitest";
import { parseAmount, RATE_AMOUNT } from "@/lib/settlements/amounts";

// Oracle: AC #94 — pole przyjmuje „120”, „120,5”, „120,50”, „120.50”; spec #93 — spacje jako separator
// tysięcy; stawka 0,00–10 000,00 zł; więcej niż dwa miejsca po przecinku, wartość ujemna albo ponad
// limit — polski komunikat.
describe("parseAmount — odczyt kwoty z pola formularza na grosze", () => {
  it.each([
    ["120", 12000],
    ["120,5", 12050],
    ["120,50", 12050],
    ["120.50", 12050],
    ["0", 0],
    ["0,01", 1],
    ["  95,9 ", 9590],
    ["1 250,00", 125000],
    ["1\u00a0250", 125000],
    ["10 000,00", 1000000],
  ])("„%s” to %i groszy", (raw, grosze) => {
    expect(parseAmount(raw, RATE_AMOUNT)).toEqual({ ok: true, grosze });
  });

  it.each([
    ["", "Podaj kwotę"],
    ["   ", "Podaj kwotę"],
    ["120,505", "Kwota może mieć najwyżej dwa miejsca po przecinku"],
    ["0.001", "Kwota może mieć najwyżej dwa miejsca po przecinku"],
    ["-5", "Kwota nie może być ujemna"],
    ["-0,50", "Kwota nie może być ujemna"],
    ["10 000,01", "Stawka może wynosić najwyżej 10\u00a0000,00\u00a0zł"],
    ["99999999999999999999", "Stawka może wynosić najwyżej 10\u00a0000,00\u00a0zł"],
    ["abc", "Podaj kwotę w złotych, np. 120 albo 120,50"],
    ["12 0", "Podaj kwotę w złotych, np. 120 albo 120,50"],
    ["120,", "Podaj kwotę w złotych, np. 120 albo 120,50"],
    [",50", "Podaj kwotę w złotych, np. 120 albo 120,50"],
    ["1e3", "Podaj kwotę w złotych, np. 120 albo 120,50"],
    ["120 zł", "Podaj kwotę w złotych, np. 120 albo 120,50"],
  ])("„%s” odrzucone: %s", (raw, message) => {
    expect(parseAmount(raw, RATE_AMOUNT)).toEqual({ ok: false, message });
  });

  it("dolna granica większa od zera ma własny komunikat", () => {
    const limits = { name: "Koszt", min: 1, max: 10_000_000 };
    expect(parseAmount("0", limits)).toEqual({ ok: false, message: "Koszt musi wynosić co najmniej 0,01\u00a0zł" });
    expect(parseAmount("0,01", limits)).toEqual({ ok: true, grosze: 1 });
  });
});
