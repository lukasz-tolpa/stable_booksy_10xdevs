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
  it("formatuje datę w strefie polskiej niezależnie od strefy środowiska", () => {
    // Momenty podane jawnie w UTC - wynik nie zalezy od tego, gdzie biegnie test
    // ani gdzie stoi serwer. To jest sedno poprawki: Cloudflare Workers ma UTC.
    expect(formatIsoDate(new Date("2026-08-11T10:00:00Z"))).toBe("2026-08-11");
    expect(formatIsoDate(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });

  it("po polnocy czasu polskiego pokazuje juz nowy dzien, choc w UTC trwa poprzedni", () => {
    // 00:30 czasu polskiego (lato, UTC+2) to 22:30 UTC dnia poprzedniego.
    // Bez wymuszenia strefy osrodek nie moglby ulozyc grafiku na "dzis".
    expect(formatIsoDate(new Date("2026-08-11T22:30:00Z"))).toBe("2026-08-12");
  });

  it("przed polnoca czasu polskiego trzyma sie biezacego dnia", () => {
    // 23:30 czasu polskiego to 21:30 UTC tego samego dnia.
    expect(formatIsoDate(new Date("2026-08-11T21:30:00Z"))).toBe("2026-08-11");
  });

  it("uwzglednia zmiane czasu - zima UTC+1, latem UTC+2", () => {
    // 00:30 czasu zimowego to 23:30 UTC dnia poprzedniego.
    expect(formatIsoDate(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
    // Ta sama godzina UTC latem wypada juz po 01:00 czasu polskiego.
    expect(formatIsoDate(new Date("2026-07-14T23:30:00Z"))).toBe("2026-07-15");
  });
});
