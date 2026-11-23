import { describe, expect, it } from "vitest";
import { firstErrorMessage } from "@/lib/auth/schemas";
import {
  BOARDING_TEXTS,
  boardingFeeIdSchema,
  boardingFeeSchema,
  boardingHorseSchema,
  departureSchema,
  newStaySchema,
} from "@/lib/boarding/schemas";

// Oracle: test-plan §6.4 — walidacja przed pierwszą mutacją; brak albo błędne pole to komunikat tego
// pola po polsku, nie odmowa bazy.
function message(result: { success: boolean; error?: Parameters<typeof firstErrorMessage>[0] }): string | null {
  return result.success || !result.error ? null : firstErrorMessage(result.error);
}

describe("boardingHorseSchema — dodanie konia pensjonatowego", () => {
  it("przyjmuje imię, adres e-mail pensjonariusza i dzień przyjazdu, przycina i zmniejsza litery adresu", () => {
    expect(
      boardingHorseSchema.parse({ name: "  Hrabia ", email: " Katarzyna.Zajac@Example.com ", arrival: "2026-11-03" }),
    ).toEqual({ name: "Hrabia", email: "katarzyna.zajac@example.com", arrival: "2026-11-03" });
  });

  it.each([
    [{ name: "  ", email: "a@example.com", arrival: "2026-11-03" }, BOARDING_TEXTS.nameMissing],
    [{ name: "Hrabia", email: "", arrival: "2026-11-03" }, BOARDING_TEXTS.emailInvalid],
    [{ name: "Hrabia", email: "nie-adres", arrival: "2026-11-03" }, BOARDING_TEXTS.emailInvalid],
    [{ name: "Hrabia", email: "a@example.com", arrival: "" }, BOARDING_TEXTS.arrivalMissing],
    [{ name: "Hrabia", email: "a@example.com", arrival: "2026-02-30" }, BOARDING_TEXTS.arrivalMissing],
  ])("odrzuca %o komunikatem pola", (input, expected) => {
    expect(message(boardingHorseSchema.safeParse(input))).toBe(expected);
  });
});

describe("newStaySchema — nowy pobyt konia, który wrócił", () => {
  it("przyjmuje konia i dzień przyjazdu", () => {
    expect(newStaySchema.parse({ horseId: "12", arrival: "2026-11-20" })).toEqual({
      horseId: 12,
      arrival: "2026-11-20",
    });
  });

  it.each([
    [{ horseId: "", arrival: "2026-11-20" }, BOARDING_TEXTS.formInvalid],
    [{ horseId: "0", arrival: "2026-11-20" }, BOARDING_TEXTS.formInvalid],
    [{ horseId: "x", arrival: "2026-11-20" }, BOARDING_TEXTS.formInvalid],
    [{ horseId: "12", arrival: "" }, BOARDING_TEXTS.arrivalMissing],
  ])("odrzuca %o komunikatem pola", (input, expected) => {
    expect(message(newStaySchema.safeParse(input))).toBe(expected);
  });
});

describe("departureSchema — dzień wyjazdu", () => {
  it("przyjmuje pobyt i dzień wyjazdu", () => {
    expect(departureSchema.parse({ stayId: "7", departure: "2026-11-22" })).toEqual({
      stayId: 7,
      departure: "2026-11-22",
    });
  });

  it.each([
    [{ stayId: "", departure: "2026-11-22" }, BOARDING_TEXTS.formInvalid],
    [{ stayId: "7", departure: "" }, BOARDING_TEXTS.departureMissing],
    [{ stayId: "7", departure: "22.11.2026" }, BOARDING_TEXTS.departureMissing],
  ])("odrzuca %o komunikatem pola", (input, expected) => {
    expect(message(departureSchema.safeParse(input))).toBe(expected);
  });
});

// Oracle: AC #117 — opłata za pensjonat: kwota wzorem stawki (0,00–100 000,00 zł, grosze), „od tego / od
// następnego miesiąca”, koń z ukrytego pola; walidacja przed mutacją (test-plan §6.4).
describe("boardingFeeSchema — opłata za pensjonat konia", () => {
  it("koń, kwota w groszach i miesiąc „od”", () => {
    expect(boardingFeeSchema.safeParse({ horseId: "7", amount: "1500,50", from: "nastepny" }).data).toEqual({
      horseId: 7,
      amount: 150050,
      from: "nastepny",
    });
  });

  it.each([
    [{ horseId: "7", amount: "", from: "biezacy" }, "Podaj kwotę"],
    [{ horseId: "7", amount: "100000,01", from: "biezacy" }, "Opłata za pensjonat może wynosić najwyżej 100 000,00 zł"],
    [{ horseId: "7", amount: "10", from: "" }, "Wybierz, od kiedy obowiązuje opłata"],
    [{ horseId: "x", amount: "10", from: "biezacy" }, "Nieprawidłowe dane formularza"],
  ])("odrzuca %o: %s", (form, message) => {
    const result = boardingFeeSchema.safeParse(form);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstErrorMessage(result.error).replaceAll(" ", " ")).toBe(message);
    }
  });

  it("usunięcie zaplanowanej zmiany: identyfikator zmiany", () => {
    expect(boardingFeeIdSchema.safeParse({ feeId: "3" }).data).toEqual({ feeId: 3 });
    expect(boardingFeeIdSchema.safeParse({ feeId: "0" }).success).toBe(false);
  });
});
