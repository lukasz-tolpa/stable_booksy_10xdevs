import { describe, expect, it } from "vitest";
import {
  FOREIGN_KEY_VIOLATION,
  SCHEDULE_DATE_CONFLICT,
  SCHEDULE_HOURS_CONFLICT,
  extractConflictCount,
  pluralizeBookings,
  scheduleErrorMessage,
} from "@/lib/schedule/errors";

describe("pluralizeBookings", () => {
  it("odmienia poprawnie", () => {
    expect(pluralizeBookings(1)).toBe("zapis");
    expect(pluralizeBookings(2)).toBe("zapisy");
    expect(pluralizeBookings(4)).toBe("zapisy");
    expect(pluralizeBookings(5)).toBe("zapisów");
    expect(pluralizeBookings(0)).toBe("zapisów");
  });

  it("obsługuje nastki, które łamią regułę końcówki", () => {
    expect(pluralizeBookings(12)).toBe("zapisów");
    expect(pluralizeBookings(13)).toBe("zapisów");
    expect(pluralizeBookings(14)).toBe("zapisów");
    expect(pluralizeBookings(22)).toBe("zapisy");
    expect(pluralizeBookings(25)).toBe("zapisów");
  });
});

describe("extractConflictCount", () => {
  it("wyciąga liczbę z komunikatu bazy", () => {
    expect(extractConflictCount("Nie mozna zawezic godzin pracy: 3 aktywnych zapisow wypadloby poza zakres")).toBe(3);
  });

  it("zwraca null, gdy nie ma liczby", () => {
    expect(extractConflictCount("cos poszlo nie tak")).toBeNull();
    expect(extractConflictCount(undefined)).toBeNull();
  });
});

describe("scheduleErrorMessage", () => {
  it("różnicuje konflikt godzin i konflikt daty", () => {
    const godziny = scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, "... 2 aktywnych zapisow ...");
    const data = scheduleErrorMessage(SCHEDULE_DATE_CONFLICT, "... 2 aktywnych zapisow ...");

    expect(godziny).not.toBe(data);
    expect(godziny).toContain("zawęzić godzin");
    expect(data).toContain("zmienić daty");
  });

  it("podaje liczbę kolidujących zapisów we właściwej odmianie", () => {
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, "... 1 ...")).toContain("1 zapis.");
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, "... 3 ...")).toContain("3 zapisy");
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, "... 7 ...")).toContain("7 zapisów");
  });

  it("dopasowuje zaimek do liczby zapisów", () => {
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, "... 1 ...")).toContain("do jego odwołania");
    expect(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, "... 2 ...")).toContain("do ich odwołania");
  });

  it("odpięcie konia ma własny komunikat, inny niż konflikt godzin", () => {
    const kon = scheduleErrorMessage(FOREIGN_KEY_VIOLATION, "violates foreign key constraint");
    expect(kon).toContain("konia");
    expect(kon).not.toBe(scheduleErrorMessage(SCHEDULE_HOURS_CONFLICT, "... 1 ..."));
  });

  it("nierozpoznany kod daje wariant domyślny", () => {
    expect(scheduleErrorMessage("42P01", "relation does not exist")).toBe(
      "Nie udało się zapisać grafiku. Spróbuj ponownie.",
    );
    expect(scheduleErrorMessage(undefined)).toBe("Nie udało się zapisać grafiku. Spróbuj ponownie.");
  });
});
