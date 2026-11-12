import { describe, expect, it } from "vitest";
import {
  FOREIGN_KEY_VIOLATION,
  HORSE_HAS_BOOKINGS,
  HORSE_NOT_IN_STABLE,
  INSTRUCTOR_INACTIVE,
  INSTRUCTOR_NOT_IN_STABLE,
  SCHEDULE_DATE_CONFLICT,
  SCHEDULE_DAY_PAST,
  SCHEDULE_HOURS_CONFLICT,
  SEATS_EXCEED_HORSES,
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

  it("cudzy koń i koń z zapisami mają różne komunikaty", () => {
    const cudzy = scheduleErrorMessage(HORSE_NOT_IN_STABLE);
    const zapisy = scheduleErrorMessage(HORSE_HAS_BOOKINGS);

    expect(cudzy).toContain("nie należy do Twojej stadniny");
    expect(zapisy).toContain("konia");
    expect(cudzy).not.toBe(zapisy);
  });

  it("koń z zapisami: ten sam komunikat z pre-checku i z FK, bez obietnicy, że odwołanie odblokuje", () => {
    // Oracle: PRD Open Question #2 (2026-09-08) - odwołany zapis też przypina konia do dnia,
    // więc rada „doprowadź do odwołania" byłaby fałszywa.
    const preCheck = scheduleErrorMessage(HORSE_HAS_BOOKINGS);

    expect(preCheck).toBe(scheduleErrorMessage(FOREIGN_KEY_VIOLATION, "violates foreign key constraint"));
    expect(preCheck).toContain("także odwołane");
    expect(preCheck).not.toContain("doprowadź");
  });

  it("suma limitów ponad liczbę koni wskazuje godzinę, sumę i liczbę koni", () => {
    const msg = scheduleErrorMessage(
      SEATS_EXCEED_HORSES,
      "Suma limitow miejsc o godzinie 13 (3) przekracza liczbe koni pracujacych tego dnia (2)",
    );

    expect(msg).toBe(
      "O 13:00 suma limitów miejsc (3) przekracza liczbę koni pracujących tego dnia (2). Obniż limity w tej godzinie albo dodaj konia.",
    );
  });

  it("suma limitów bez czytelnego komunikatu bazy nadal mówi, co poprawić", () => {
    expect(scheduleErrorMessage(SEATS_EXCEED_HORSES)).toBe(
      "W jednej z godzin suma limitów miejsc przekracza liczbę koni pracujących tego dnia. Obniż limity albo dodaj konia.",
    );
  });

  it("instruktor spoza stadniny, nieaktywny instruktor i dzień miniony mają własne komunikaty", () => {
    expect(scheduleErrorMessage(INSTRUCTOR_NOT_IN_STABLE)).toBe("Wybrany instruktor nie należy do Twojego ośrodka.");
    expect(scheduleErrorMessage(INSTRUCTOR_INACTIVE)).toBe(
      "Nieaktywnego instruktora nie można dodać do dnia, w którym wcześniej nie pracował. Najpierw go aktywuj.",
    );
    expect(scheduleErrorMessage(SCHEDULE_DAY_PAST)).toBe("Nie można układać grafiku na przeszłe dni");
  });

  it("kody grafiku są rozróżnialne", () => {
    const codes = [
      SCHEDULE_DATE_CONFLICT,
      SCHEDULE_HOURS_CONFLICT,
      HORSE_NOT_IN_STABLE,
      HORSE_HAS_BOOKINGS,
      INSTRUCTOR_NOT_IN_STABLE,
      INSTRUCTOR_INACTIVE,
      SEATS_EXCEED_HORSES,
      SCHEDULE_DAY_PAST,
    ];

    expect(new Set(codes).size).toBe(codes.length);
  });

  it("nierozpoznany kod daje wariant domyślny", () => {
    expect(scheduleErrorMessage("42P01", "relation does not exist")).toBe(
      "Nie udało się zapisać grafiku. Spróbuj ponownie.",
    );
    expect(scheduleErrorMessage(undefined)).toBe("Nie udało się zapisać grafiku. Spróbuj ponownie.");
  });
});
