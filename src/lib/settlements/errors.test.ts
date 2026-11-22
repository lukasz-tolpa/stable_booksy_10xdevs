import { describe, expect, it } from "vitest";
import {
  COST_SAVE_FAILED,
  costSaveErrorMessage,
  isExpectedCostRefusal,
  isExpectedRateRefusal,
  RATE_DELETE_FAILED,
  RATE_SAVE_FAILED,
  rateDeleteErrorMessage,
  rateSaveErrorMessage,
  riderRateSaveErrorMessage,
  settlementPdfErrorMessage,
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

// Oracle: AC #97 — stawka indywidualna tylko dla jeźdźca ośrodka: odmowa bazy (RLS 42501, konto
// usunięte 23503) to komunikat o jeźdźcu; reguły czasu i kwoty jak przy stawce ośrodka.
describe("riderRateSaveErrorMessage — zapis stawki jeźdźca", () => {
  it.each([
    ["42501", "Stawkę indywidualną możesz ustawić tylko jeźdźcowi swojego ośrodka."],
    ["23503", "Stawkę indywidualną możesz ustawić tylko jeźdźcowi swojego ośrodka."],
    ["SB026", "Stawkę możesz zmienić tylko od tego albo od następnego miesiąca. Odśwież stronę i spróbuj ponownie."],
    ["23514", "Stawka musi wynosić od 0,00 do 10 000,00 zł."],
  ])("%s ma własny komunikat", (code, message) => {
    expect(riderRateSaveErrorMessage(code)).toBe(message);
    expect(isExpectedRateRefusal(code)).toBe(true);
  });

  it.each([undefined, "", "PGRST301", "23505", "08006"])("inny kod (%s) to komunikat awarii", (code) => {
    expect(riderRateSaveErrorMessage(code)).toBe(RATE_SAVE_FAILED);
    expect(riderRateSaveErrorMessage(code)).not.toMatch(PROVIDER_TEXT);
  });
});

// Oracle: AC #96 — zamknięty polski zestaw błędów kosztów dodatkowych (SB029, granice, jeździec spoza ośrodka).
describe("costSaveErrorMessage — dopisanie i poprawka kosztu", () => {
  it.each([
    ["SB029", "Koszt dodatkowy możesz dopisać tylko w bieżącym albo minionym miesiącu."],
    ["23514", "Koszt musi wynosić od 0,01 do 100 000,00 zł, a jego nazwa mieć od 1 do 80 znaków."],
    ["42501", "Koszt dodatkowy możesz dopisać tylko jeźdźcowi, który miał zapis w Twoim ośrodku."],
  ])("%s ma własny komunikat", (code, message) => {
    expect(costSaveErrorMessage(code)).toBe(message);
    expect(isExpectedCostRefusal(code)).toBe(true);
  });

  it.each([undefined, "", "PGRST301", "23505", "SB026", "08006", "fetch failed"])(
    "inny kod (%s) to komunikat awarii",
    (code) => {
      expect(costSaveErrorMessage(code)).toBe(COST_SAVE_FAILED);
      expect(costSaveErrorMessage(code)).not.toMatch(PROVIDER_TEXT);
      expect(isExpectedCostRefusal(code)).toBe(false);
    },
  );
});

// Oracle: AC #102 — nieudane przygotowanie PDF (odczyt danych albo generowanie) to jeden polski komunikat
// z zamkniętej tabeli rozliczeń; kod ani tekst dostawcy nie trafia do banera.
describe("settlementPdfErrorMessage — nieudane przygotowanie PDF", () => {
  it.each([undefined, "", "42501", "PGRST301", "08006", "57014", "fetch failed"])(
    "kod %s to komunikat „Nie udało się przygotować PDF”",
    (code) => {
      expect(settlementPdfErrorMessage(code)).toBe("Nie udało się przygotować PDF. Spróbuj ponownie.");
      expect(settlementPdfErrorMessage(code)).not.toMatch(PROVIDER_TEXT);
    },
  );
});
