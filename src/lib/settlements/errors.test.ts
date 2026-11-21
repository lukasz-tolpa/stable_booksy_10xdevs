import { describe, expect, it } from "vitest";
import {
  isExpectedRateRefusal,
  RATE_DELETE_FAILED,
  RATE_SAVE_FAILED,
  rateDeleteErrorMessage,
  rateSaveErrorMessage,
} from "@/lib/settlements/errors";

// Oracle: test-plan §6.4 — odmowy bazy jako zamknięty polski zestaw; tekst dostawcy nigdy nie przecieka.
const PROVIDER_TEXT = /fetch|duplicate key|violates|constraint|permission denied|SB0|42501|23514/i;

describe("rateSaveErrorMessage — zapis stawki", () => {
  it.each([
    ["SB026", "Stawkę możesz zmienić tylko od tego albo od następnego miesiąca. Odśwież stronę i spróbuj ponownie."],
    ["23514", "Stawka musi wynosić od 0,00 do 10 000,00 zł."],
    ["42501", "Nie możesz zmieniać stawek tego ośrodka."],
  ])("%s ma własny komunikat", (code, message) => {
    expect(rateSaveErrorMessage(code)).toBe(message);
    expect(isExpectedRateRefusal(code)).toBe(true);
  });

  it.each([undefined, "", "PGRST301", "23505", "SB027", "08006", "fetch failed"])(
    "inny kod (%s) to komunikat awarii",
    (code) => {
      expect(rateSaveErrorMessage(code)).toBe(RATE_SAVE_FAILED);
      expect(rateSaveErrorMessage(code)).not.toMatch(PROVIDER_TEXT);
    },
  );
});

describe("rateDeleteErrorMessage — usunięcie zaplanowanej zmiany", () => {
  it("SB027 — zmiana już obowiązuje", () => {
    expect(rateDeleteErrorMessage("SB027")).toBe(
      "Ta zmiana stawki już obowiązuje, więc nie można jej usunąć. Możesz ustawić nową stawkę.",
    );
    expect(isExpectedRateRefusal("SB027")).toBe(true);
  });

  it.each([undefined, "", "42501", "SB026", "PGRST116", "08006"])("inny kod (%s) to komunikat awarii", (code) => {
    expect(rateDeleteErrorMessage(code)).toBe(RATE_DELETE_FAILED);
    expect(rateDeleteErrorMessage(code)).not.toMatch(PROVIDER_TEXT);
  });

  it("awaria nie jest odmową z reguł", () => {
    expect(isExpectedRateRefusal(undefined)).toBe(false);
    expect(isExpectedRateRefusal("08006")).toBe(false);
  });
});
