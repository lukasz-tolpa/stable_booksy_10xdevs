import { describe, expect, it } from "vitest";
import {
  INSTRUCTOR_NAME_TAKEN,
  INSTRUCTOR_OWNER_STAYS_ACTIVE,
  INSTRUCTOR_TOGGLE_FAILED,
  instructorErrorMessage,
  instructorToggleErrorMessage,
  invitationErrorMessage,
  isExpectedInvitationRefusal,
  isExpectedSchedulePermissionRefusal,
  revokeInvitationErrorMessage,
  schedulePermissionErrorMessage,
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

describe("invitationErrorMessage", () => {
  it.each([
    ["SB013", "Nie znaleziono instruktora w Twojej stadninie."],
    ["SB014", "Nie można zaprosić nieaktywnego instruktora. Najpierw go aktywuj."],
    ["SB015", "Ten instruktor ma już konto."],
    ["23514", "Podaj poprawny adres e-mail instruktora"],
  ])("odmowa %s ma własny komunikat", (code, message) => {
    expect(invitationErrorMessage(code)).toBe(message);
  });

  it.each([["42501"], ["23505"], [""], ["sb014"], ["SB0140"], ["PGRST202"], [undefined]])(
    "kod %j daje dokładnie wariant awarii",
    (code) => {
      expect(invitationErrorMessage(code)).toBe("Nie udało się utworzyć zaproszenia. Spróbuj ponownie.");
    },
  );

  it.each(["SB013", "SB014", "SB015", "23514"])("odmowa %s jest spodziewana (bez logu)", (code) => {
    expect(isExpectedInvitationRefusal(code)).toBe(true);
  });

  it.each(["42501", "23505", undefined])("kod %j nie jest spodziewaną odmową", (code) => {
    expect(isExpectedInvitationRefusal(code)).toBe(false);
  });
});

describe("revokeInvitationErrorMessage", () => {
  it("cudzy albo nieistniejący instruktor (SB013) — ten sam komunikat co przy przełączaniu", () => {
    expect(revokeInvitationErrorMessage("SB013")).toBe("Nie znaleziono instruktora w Twojej stadninie.");
  });

  it.each([["42501"], ["SB014"], [""], [undefined]])("kod %j daje dokładnie wariant awarii", (code) => {
    expect(revokeInvitationErrorMessage(code)).toBe("Nie udało się wycofać zaproszenia. Spróbuj ponownie.");
  });
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

describe("schedulePermissionErrorMessage", () => {
  it.each([
    ["SB013", "Nie znaleziono instruktora w Twojej stadninie."],
    [
      "SB023",
      "Ten instruktor nie ma konta. Uprawnienie do układania grafiku możesz nadać dopiero po przyjęciu zaproszenia.",
    ],
    [
      "SB024",
      "Ten instruktor jest nieaktywny — dezaktywacja odebrała mu uprawnienie do układania grafiku. Aktywuj go, żeby nadać je ponownie.",
    ],
    ["SB025", "Jako właściciel masz już wszystkie uprawnienia, także do układania grafiku."],
  ])("odmowa %s ma własny komunikat po polsku", (code, message) => {
    expect(schedulePermissionErrorMessage(code)).toBe(message);
    expect(isExpectedSchedulePermissionRefusal(code)).toBe(true);
  });

  it.each([["42501"], ["SB014"], [""], [undefined]])(
    "kod %j daje wariant awarii i nie jest spodziewaną odmową",
    (code) => {
      expect(schedulePermissionErrorMessage(code)).toBe(
        "Nie udało się zmienić uprawnienia do układania grafiku. Spróbuj ponownie.",
      );
      expect(isExpectedSchedulePermissionRefusal(code)).toBe(false);
    },
  );
});
