import { describe, expect, it } from "vitest";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { rateIdSchema, stableRateSchema } from "@/lib/settlements/schemas";

// Oracle: AC #94 — pole kwoty przyjmuje „120”, „120,5”, „120,50”, „120.50”; walidacja przed mutacją
// (test-plan §6.4) — brak albo błędne pole to komunikat tego pola, nigdy odmowa bazy.
describe("stableRateSchema — formularz stawki ośrodka", () => {
  it("zamienia kwotę na grosze i przyjmuje wybór „od tego” albo „od następnego miesiąca”", () => {
    expect(stableRateSchema.safeParse({ amount: "120,50", from: "biezacy" })).toEqual({
      success: true,
      data: { amount: 12050, from: "biezacy" },
    });
    expect(stableRateSchema.safeParse({ amount: "140", from: "nastepny" }).data).toEqual({
      amount: 14000,
      from: "nastepny",
    });
  });

  it.each([
    [{ amount: "", from: "biezacy" }, "Podaj kwotę"],
    [{ amount: "120,505", from: "biezacy" }, "Kwota może mieć najwyżej dwa miejsca po przecinku"],
    [{ amount: "-1", from: "biezacy" }, "Kwota nie może być ujemna"],
    [{ amount: "10000,01", from: "biezacy" }, "Stawka może wynosić najwyżej 10 000,00 zł"],
    [{ amount: "120", from: "" }, "Wybierz, od kiedy obowiązuje stawka"],
    [{ amount: "120", from: "2026-10" }, "Wybierz, od kiedy obowiązuje stawka"],
  ])("odrzuca %o: %s", (form, message) => {
    const result = stableRateSchema.safeParse(form);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstErrorMessage(result.error)).toBe(message);
    }
  });
});

describe("rateIdSchema — usunięcie zaplanowanej zmiany", () => {
  it("przyjmuje identyfikator zmiany", () => {
    expect(rateIdSchema.safeParse({ rateId: "17" }).data).toEqual({ rateId: 17 });
  });

  it.each(["", " ", "abc", "0", "-3", "1.5"])("odrzuca „%s”", (rateId) => {
    const result = rateIdSchema.safeParse({ rateId });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstErrorMessage(result.error)).toBe("Nieprawidłowa zmiana stawki");
    }
  });
});
