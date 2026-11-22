import { describe, expect, it } from "vitest";
import {
  BOARDING_HORSE_FAILED,
  DEPARTURE_FAILED,
  STAY_FAILED,
  boardingHorseErrorMessage,
  departureErrorMessage,
  isExpectedBoardingRefusal,
  stayErrorMessage,
} from "@/lib/boarding/errors";

// Oracle: test-plan §6.4 — odmowy bazy (migracja 20261201100000) jako zamknięty polski zestaw;
// tekst dostawcy nigdy nie przecieka. AC #114: brak konta — pensjonariusz musi najpierw założyć konto.
const PROVIDER_TEXT = /fetch|duplicate key|violates|constraint|permission denied|exclusion|SB0|42501|23514/i;

describe("boardingHorseErrorMessage — dodanie konia pensjonatowego", () => {
  it("brak konta jeźdźca pod adresem (SB040) mówi, że pensjonariusz musi najpierw założyć konto", () => {
    expect(boardingHorseErrorMessage("SB040")).toBe(
      "Pod tym adresem e-mail nie ma konta jeźdźca. Pensjonariusz musi najpierw założyć konto w getona.horse.",
    );
    expect(isExpectedBoardingRefusal("SB040")).toBe(true);
  });

  it("puste imię z bazy (23514) to komunikat pola imienia", () => {
    expect(boardingHorseErrorMessage("23514")).toBe("Podaj imię konia");
  });

  it.each([undefined, "", "PGRST301", "23505", "SB041", "08006", "fetch failed"])(
    "inny kod (%s) to komunikat awarii",
    (code) => {
      expect(boardingHorseErrorMessage(code)).toBe(BOARDING_HORSE_FAILED);
      expect(boardingHorseErrorMessage(code)).not.toMatch(PROVIDER_TEXT);
    },
  );
});

describe("stayErrorMessage — nowy pobyt konia, który wrócił", () => {
  it.each([
    ["SB041", "Nie znaleziono tego konia pensjonatowego w Twoim ośrodku."],
    ["SB042", "Ten pobyt zachodzi na inny pobyt konia. Pobyt może zacząć się dopiero po dniu wyjazdu poprzedniego."],
    ["SB047", "Ten koń nie ma już właściciela — konto pensjonariusza usunięto, więc nie można dodać mu pobytu."],
  ])("%s ma własny komunikat", (code, message) => {
    expect(stayErrorMessage(code)).toBe(message);
    expect(isExpectedBoardingRefusal(code)).toBe(true);
  });

  it.each([undefined, "SB043", "42501", "fetch failed"])("inny kod (%s) to komunikat awarii", (code) => {
    expect(stayErrorMessage(code)).toBe(STAY_FAILED);
  });
});

describe("departureErrorMessage — dzień wyjazdu", () => {
  it.each([
    ["SB041", "Nie znaleziono tego pobytu."],
    ["SB042", "Ten dzień wyjazdu zachodzi na kolejny pobyt konia."],
    ["SB043", "Dzień wyjazdu nie może być późniejszy niż dziś."],
    ["SB044", "Dzień wyjazdu nie może być wcześniejszy niż dzień przyjazdu."],
  ])("%s ma własny komunikat", (code, message) => {
    expect(departureErrorMessage(code, undefined)).toBe(message);
  });

  it("SB045 podaje dzień ostatniej jazdy konia z danych odmowy", () => {
    expect(departureErrorMessage("SB045", '{"day": "2026-11-03"}')).toBe(
      "Dzień wyjazdu nie może być wcześniejszy niż ostatnia jazda konia w tym pobycie (3 listopada 2026).",
    );
  });

  it.each([undefined, "", "{}", '{"day": 3}', '{"day": "jutro"}', "nie json"])(
    "SB045 bez czytelnego dnia (%s) — bez daty",
    (detail) => {
      expect(departureErrorMessage("SB045", detail)).toBe(
        "Dzień wyjazdu nie może być wcześniejszy niż ostatnia jazda konia w tym pobycie.",
      );
    },
  );

  it.each([undefined, "SB040", "42501", "23502", "fetch failed"])("inny kod (%s) to komunikat awarii", (code) => {
    expect(departureErrorMessage(code, undefined)).toBe(DEPARTURE_FAILED);
    expect(departureErrorMessage(code, undefined)).not.toMatch(PROVIDER_TEXT);
  });
});
