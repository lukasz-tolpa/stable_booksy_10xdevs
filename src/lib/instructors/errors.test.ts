import { describe, expect, it } from "vitest";
import { INSTRUCTOR_NAME_TAKEN, instructorErrorMessage } from "@/lib/instructors/errors";

const FALLBACK = "Nie udało się dodać instruktora. Spróbuj ponownie.";

describe("instructorErrorMessage", () => {
  it("zajęta nazwa (23505) mówi, że instruktor o tej nazwie już jest — także nieaktywny", () => {
    expect(instructorErrorMessage(INSTRUCTOR_NAME_TAKEN)).toBe(
      "Masz już instruktora o tej nazwie (wielkość liter nie ma znaczenia), być może wśród nieaktywnych. Nadaj inną nazwę albo aktywuj go ponownie.",
    );
  });

  it.each([["23514"], ["42501"], [""], ["PGRST116"], ["23505x"], [undefined]])(
    "kod %j daje dokładnie wariant domyślny",
    (code) => {
      expect(instructorErrorMessage(code)).toBe(FALLBACK);
    },
  );
});
