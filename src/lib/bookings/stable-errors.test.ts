import { describe, expect, it } from "vitest";
import { horseAssignmentErrorMessage } from "@/lib/bookings/stable-errors";

describe("horseAssignmentErrorMessage", () => {
  it("koń zajęty o tej godzinie (23505, bookings_horse_hour_key) — komunikat każe wybrać innego konia", () => {
    expect(horseAssignmentErrorMessage("23505")).toBe(
      "Ten koń ma już jazdę o tej godzinie. Wybierz innego konia albo najpierw zmień tamten przydział.",
    );
  });

  it("koń niepracujący tego dnia (23503, bookings_assigned_horse_fkey) — odsyła do grafiku", () => {
    expect(horseAssignmentErrorMessage("23503")).toBe(
      "Ten koń nie pracuje tego dnia. Dodaj go w grafiku dnia albo wybierz innego.",
    );
  });

  it("zapis odwołany w międzyczasie (23514, konia ma tylko aktywny zapis)", () => {
    expect(horseAssignmentErrorMessage("23514")).toBe(
      "Zapis został odwołany — konia przydziela się tylko do aktywnych zapisów.",
    );
  });

  // Zamknięty zbiór polskich komunikatów: nieznany kod nigdy nie przecieka tekstem dostawcy.
  it.each([[undefined], [""], ["42501"], ["SB009"], ["duplicate key value violates unique constraint"]])(
    "nieznany kod %j daje ogólny komunikat",
    (code) => {
      expect(horseAssignmentErrorMessage(code)).toBe("Nie udało się przydzielić konia. Spróbuj ponownie.");
    },
  );
});
