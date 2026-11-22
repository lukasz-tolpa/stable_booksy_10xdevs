import { describe, expect, it } from "vitest";
import {
  horseAssignmentErrorMessage,
  instructorHorseAssignmentErrorMessage,
  isHorseAssignmentRefusal,
  isInstructorHorseAssignmentRefusal,
} from "@/lib/bookings/stable-errors";

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

  // Oracle: AC #115 — przy slocie treningowym tylko koń pensjonatowy tego samego pensjonariusza z pobytem.
  it("koń spoza koni pensjonariusza przy slocie treningowym (SB051) — wybierz jego konia", () => {
    expect(horseAssignmentErrorMessage("SB051")).toBe(
      "Przy slocie treningowym jeździec jedzie na swoim koniu pensjonatowym, który stoi w ośrodku w dniu jazdy. Wybierz jednego z jego koni.",
    );
    expect(instructorHorseAssignmentErrorMessage("SB051")).toBe(horseAssignmentErrorMessage("SB051"));
    expect(isHorseAssignmentRefusal("SB051")).toBe(true);
    expect(isInstructorHorseAssignmentRefusal("SB051")).toBe(true);
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

describe("isHorseAssignmentRefusal", () => {
  // Odmowa reguły to skutek decyzji ośrodka, nie awaria — endpoint loguje tylko resztę.
  it.each([["23505"], ["23503"], ["23514"]])("kod %s to odmowa reguły przydziału", (code) => {
    expect(isHorseAssignmentRefusal(code)).toBe(true);
  });

  it.each([[undefined], ["42501"], ["PGRST301"], ["08006"]])("kod %j to błąd spoza decyzji ośrodka", (code) => {
    expect(isHorseAssignmentRefusal(code)).toBe(false);
  });
});

describe("instructorHorseAssignmentErrorMessage", () => {
  // Instruktor nie zmieni grafiku dnia ani przydziału na cudzym slocie — komunikat każe tylko wybrać innego konia.
  it("koń zajęty o tej godzinie (23505) — wybierz innego konia", () => {
    expect(instructorHorseAssignmentErrorMessage("23505")).toBe(
      "Ten koń ma już jazdę o tej godzinie. Wybierz innego konia.",
    );
  });

  it("koń niepracujący tego dnia (23503) — wybierz innego konia", () => {
    expect(instructorHorseAssignmentErrorMessage("23503")).toBe("Ten koń nie pracuje tego dnia. Wybierz innego konia.");
  });

  it("zapis odwołany w międzyczasie (23514) — jak u właściciela", () => {
    expect(instructorHorseAssignmentErrorMessage("23514")).toBe(
      "Zapis został odwołany — konia przydziela się tylko do aktywnych zapisów.",
    );
  });

  it("zapis spoza slotów instruktora albo instruktor nieaktywny (42501)", () => {
    expect(instructorHorseAssignmentErrorMessage("42501")).toBe("Nie znaleziono aktywnego zapisu na Twój slot.");
  });

  it.each([[undefined], ["SB009"]])("nieznany kod %j daje ogólny komunikat", (code) => {
    expect(instructorHorseAssignmentErrorMessage(code)).toBe("Nie udało się przydzielić konia. Spróbuj ponownie.");
  });
});

describe("isInstructorHorseAssignmentRefusal", () => {
  // U instruktora odmową jest też zapis spoza jego slotów (42501) — endpoint „Moje sloty” loguje tylko resztę.
  it.each([["23505"], ["23503"], ["23514"], ["42501"]])("kod %s to odmowa przydziału przez instruktora", (code) => {
    expect(isInstructorHorseAssignmentRefusal(code)).toBe(true);
  });

  it.each([[undefined], ["PGRST301"], ["08006"]])("kod %j to błąd spoza reguł przydziału", (code) => {
    expect(isInstructorHorseAssignmentRefusal(code)).toBe(false);
  });
});
