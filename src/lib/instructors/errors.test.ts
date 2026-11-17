import { describe, expect, it } from "vitest";
import {
  INSTRUCTOR_NAME_TAKEN,
  INSTRUCTOR_OWNER_STAYS_ACTIVE,
  INSTRUCTOR_TOGGLE_FAILED,
  instructorErrorMessage,
  instructorToggleErrorMessage,
} from "@/lib/instructors/errors";

describe("instructorToggleErrorMessage", () => {
  it("dezaktywacja właściciela (SB012) mówi, że właściciela nie można dezaktywować", () => {
    expect(instructorToggleErrorMessage(INSTRUCTOR_OWNER_STAYS_ACTIVE)).toBe(
      "Właściciela ośrodka nie można dezaktywować.",
    );
  });

  it.each([["42501"], ["23505"], [""], ["sb012"], ["SB0120"], [undefined]])(
    "kod %j daje dokładnie wariant awarii",
    (code) => {
      expect(instructorToggleErrorMessage(code)).toBe(INSTRUCTOR_TOGGLE_FAILED);
    },
  );
});

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
