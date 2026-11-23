import { describe, expect, it } from "vitest";
import {
  capitalize,
  RIDE_FORMS,
  RIDER_FORMS,
  formatCount,
  formatMonthName,
  formatMonthYear,
  formatInMonthYear,
  formatShortDateWithWeekday,
  formatFreeSeats,
  formatHours,
  formatLongDate,
  formatLongDateWithYear,
  formatDayMonthYear,
  formatNumber,
  formatPercent,
  formatTakenSeats,
  formatAmountInput,
  formatMoney,
  formatFromMonth,
} from "@/lib/format";

// Polski zapis grupuje tysiące twardą spacją (U+00A0) dopiero od pięciu cyfr.
describe("formatNumber", () => {
  it("zapisuje liczbę po polsku", () => {
    expect(formatNumber(7)).toBe("7");
    expect(formatNumber(12345)).toBe("12 345");
    expect(formatNumber(1.5)).toBe("1,5");
  });
});

describe("formatFreeSeats", () => {
  // Oracle: AC #41 — „2 z 4 wolne".
  it("zapisuje wolne miejsca slotu wobec limitu", () => {
    expect(formatFreeSeats(2, 4)).toBe("2 z 4 wolne");
    expect(formatFreeSeats(0, 1)).toBe("0 z 1 wolne");
  });
});

describe("formatTakenSeats", () => {
  // Oracle: #72 — „liczba zajętych miejsc / limit” przy slocie instruktora.
  it("zapisuje zajęte miejsca slotu wobec limitu", () => {
    expect(formatTakenSeats(1, 2)).toBe("zajęte 1 z 2");
    expect(formatTakenSeats(0, 1)).toBe("zajęte 0 z 1");
  });
});

describe("formatLongDate", () => {
  it("zapisuje dzień grafiku z dniem tygodnia, bez roku", () => {
    expect(formatLongDate("2026-11-18")).toBe("środa, 18 listopada");
    expect(formatLongDate("2026-03-01")).toBe("niedziela, 1 marca");
  });
});

describe("formatLongDateWithYear", () => {
  it("zapisuje dzień nawigacji dniami z dniem tygodnia i rokiem", () => {
    expect(formatLongDateWithYear("2026-11-18")).toBe("środa, 18 listopada 2026");
    expect(formatLongDateWithYear("2027-01-01")).toBe("piątek, 1 stycznia 2027");
  });
});

describe("formatDayMonthYear", () => {
  it("zapisuje dzień kalendarzowy z miesiącem w dopełniaczu i rokiem, bez dnia tygodnia", () => {
    expect(formatDayMonthYear("2026-11-03")).toBe("3 listopada 2026");
    expect(formatDayMonthYear("2027-01-01")).toBe("1 stycznia 2027");
  });

  it("chwilę zapisuje dniem w strefie ośrodka — 23:30 UTC 31 grudnia to już 1 stycznia", () => {
    expect(formatDayMonthYear(new Date("2026-12-31T23:30:00Z"))).toBe("1 stycznia 2027");
    expect(formatDayMonthYear(new Date("2026-11-21T10:00:00Z"))).toBe("21 listopada 2026");
  });
});

describe("formatHours", () => {
  it("dokleja jednostkę godzin do liczby w zapisie polskim", () => {
    expect(formatHours(0)).toBe("0 h");
    expect(formatHours(12345)).toBe("12 345 h");
  });
});

describe("formatCount", () => {
  // Oracle: polska odmiana liczebników (spec #83, US 10) — „1 zapis”, „2 zapisy”, „5 zapisów”.
  const BOOKING = { one: "zapis", few: "zapisy", many: "zapisów" };

  it("odmienia rzeczownik po liczbie: 1 / 2–4 / 5+", () => {
    expect(formatCount(1, BOOKING)).toBe("1 zapis");
    expect(formatCount(2, BOOKING)).toBe("2 zapisy");
    expect(formatCount(4, BOOKING)).toBe("4 zapisy");
    expect(formatCount(5, BOOKING)).toBe("5 zapisów");
    expect(formatCount(0, BOOKING)).toBe("0 zapisów");
  });

  it("nastki 12–14 idą z formą dopełniaczową, a 22 znowu z formą „kilka”", () => {
    expect(formatCount(12, BOOKING)).toBe("12 zapisów");
    expect(formatCount(13, BOOKING)).toBe("13 zapisów");
    expect(formatCount(14, BOOKING)).toBe("14 zapisów");
    expect(formatCount(21, BOOKING)).toBe("21 zapisów");
    expect(formatCount(22, BOOKING)).toBe("22 zapisy");
  });
});

describe("formatPercent", () => {
  // Oracle: zapis procentów w panelu ośrodka i na Statystykach — liczba po polsku z „%” bez spacji.
  it("zapisuje procent po polsku", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatPercent(67)).toBe("67%");
    expect(formatPercent(150)).toBe("150%");
  });
});

describe("miesiąc kalendarzowy (`RRRR-MM`)", () => {
  it("nazwa miesiąca w mianowniku, z rokiem i bez", () => {
    expect(formatMonthName("2026-11")).toBe("listopad");
    expect(formatMonthYear("2026-11")).toBe("listopad 2026");
    expect(formatMonthYear("2027-01")).toBe("styczeń 2027");
  });

  it("„w” z miesiącem w miejscowniku, a przed „wrześniu” — „we”", () => {
    const months = Array.from({ length: 12 }, (_, index) =>
      formatInMonthYear(`2026-${String(index + 1).padStart(2, "0")}`),
    );
    expect(months).toEqual([
      "w styczniu 2026",
      "w lutym 2026",
      "w marcu 2026",
      "w kwietniu 2026",
      "w maju 2026",
      "w czerwcu 2026",
      "w lipcu 2026",
      "w sierpniu 2026",
      "we wrześniu 2026",
      "w październiku 2026",
      "w listopadzie 2026",
      "w grudniu 2026",
    ]);
  });
});

describe("formatShortDateWithWeekday", () => {
  it("skraca dzień tygodnia i miesiąc, np. przy jeździe w Podsumowaniu miesiąca", () => {
    expect(formatShortDateWithWeekday("2026-11-06")).toBe("pt., 6 lis");
  });
});

describe("odmiana „jazda” i „jeździec”", () => {
  it("1 jazda, 2 jazdy, 5 jazd; 1 jeździec, 2 jeźdźców, 5 jeźdźców", () => {
    expect([1, 2, 5].map((count) => formatCount(count, RIDE_FORMS))).toEqual(["1 jazda", "2 jazdy", "5 jazd"]);
    expect([1, 2, 5].map((count) => formatCount(count, RIDER_FORMS))).toEqual([
      "1 jeździec",
      "2 jeźdźców",
      "5 jeźdźców",
    ]);
  });
});

// Kwoty rozliczeń (#94): zawsze dwa miejsca po przecinku, tysiące od czterech cyfr oddzielone twardą
// spacją (jak „1 250,00 zł” w specu, inaczej niż `formatNumber`), twarda spacja przed „zł”.
describe("formatMoney", () => {
  it.each([
    [0, "0,00 zł"],
    [5, "0,05 zł"],
    [12050, "120,50 zł"],
    [125000, "1 250,00 zł"],
    [1234000, "12 340,00 zł"],
    [1000000, "10 000,00 zł"],
    [123456789, "1 234 567,89 zł"],
  ])("%i groszy to %s", (grosze, text) => {
    expect(formatMoney(grosze)).toBe(text.replaceAll(" ", "\u00a0"));
  });
});

// Kwota w polu formularza „Popraw” koszt (#96): zapis, który `parseAmount` przyjmie z powrotem.
describe("formatAmountInput", () => {
  it.each([
    [1, "0,01"],
    [80000, "800,00"],
    [75050, "750,50"],
    [10000000, "100000,00"],
  ])("%i groszy to „%s”", (grosze, text) => {
    expect(formatAmountInput(grosze)).toBe(text);
  });
});

describe("formatFromMonth", () => {
  it("zapisuje początek obowiązywania z nazwą miesiąca w dopełniaczu", () => {
    expect(formatFromMonth("2027-01")).toBe("od stycznia 2027");
    expect(formatFromMonth("2026-12")).toBe("od grudnia 2026");
    expect(formatFromMonth("2026-02")).toBe("od lutego 2026");
  });
});

describe("capitalize", () => {
  it("wielka litera na początku, także polska", () => {
    expect(capitalize("w październiku 2026")).toBe("W październiku 2026");
    expect(capitalize("łąka")).toBe("Łąka");
    expect(capitalize("")).toBe("");
  });
});
