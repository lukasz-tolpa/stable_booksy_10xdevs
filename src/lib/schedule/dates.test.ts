import { describe, expect, it } from "vitest";
import {
  addDays,
  defaultScheduleDate,
  formatIsoDate,
  isPastDate,
  isValidIsoDate,
  parseScheduleDate,
} from "@/lib/schedule/dates";

describe("isValidIsoDate", () => {
  it("przepuszcza poprawne daty", () => {
    expect(isValidIsoDate("2026-08-11")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true);
  });

  it("odrzuca niepoprawny format", () => {
    expect(isValidIsoDate("11-08-2026")).toBe(false);
    expect(isValidIsoDate("2026-8-11")).toBe(false);
    expect(isValidIsoDate("jutro")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
  });

  it("odrzuca daty, których nie ma w kalendarzu", () => {
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2025-02-29")).toBe(false);
  });
});

describe("addDays", () => {
  it("przesuwa o dobę", () => {
    expect(addDays("2026-08-11", 1)).toBe("2026-08-12");
    expect(addDays("2026-08-11", -1)).toBe("2026-08-10");
  });

  it("przechodzi przez granicę miesiąca i roku", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("nie gubi doby przy zmianie czasu", () => {
    // Ostatnia niedziela marca 2026 - zmiana na czas letni.
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    // Ostatnia niedziela pazdziernika - powrot na czas zimowy.
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });
});

describe("isPastDate", () => {
  it("rozpoznaje datę wcześniejszą niż dziś", () => {
    expect(isPastDate("2026-08-10", "2026-08-11")).toBe(true);
  });

  it("nie traktuje dzisiaj jako przeszłości", () => {
    expect(isPastDate("2026-08-11", "2026-08-11")).toBe(false);
  });

  it("nie traktuje przyszłości jako przeszłości", () => {
    expect(isPastDate("2026-08-12", "2026-08-11")).toBe(false);
  });
});

describe("defaultScheduleDate", () => {
  it("wskazuje jutro", () => {
    expect(defaultScheduleDate("2026-08-11")).toBe("2026-08-12");
    expect(defaultScheduleDate("2026-12-31")).toBe("2027-01-01");
  });
});

describe("parseScheduleDate", () => {
  it("przepuszcza poprawną datę", () => {
    expect(parseScheduleDate("2026-08-11")).toBe("2026-08-11");
  });

  it("przepuszcza datę przeszłą - ekran pokazuje ją tylko do odczytu", () => {
    expect(parseScheduleDate("2020-01-01")).toBe("2020-01-01");
  });

  it("odrzuca brak wartości i śmieci", () => {
    expect(parseScheduleDate(null)).toBeNull();
    expect(parseScheduleDate(undefined)).toBeNull();
    expect(parseScheduleDate("")).toBeNull();
    expect(parseScheduleDate("abc")).toBeNull();
    expect(parseScheduleDate("2026-02-30")).toBeNull();
  });
});

describe("formatIsoDate", () => {
  it("formatuje datę w strefie lokalnej", () => {
    // Konstruktor z komponentami lokalnymi - wynik nie zalezy od strefy testu.
    expect(formatIsoDate(new Date(2026, 7, 11))).toBe("2026-08-11");
    expect(formatIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("nie przesuwa daty tuż przed północą", () => {
    // O 23:30 czasu lokalnego data w UTC bywa juz nastepna - to wlasnie ten przypadek
    // sprawia, ze porownania z "dzis" musza isc przez strefe lokalna.
    expect(formatIsoDate(new Date(2026, 7, 11, 23, 30))).toBe("2026-08-11");
  });
});
