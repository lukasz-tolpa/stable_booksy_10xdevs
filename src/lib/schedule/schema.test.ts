import { describe, expect, it } from "vitest";
import { hoursError, parseScheduleDayForm, seatFieldName } from "@/lib/schedule/schema";

function form(entries: [string, string][]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) {
    data.append(name, value);
  }
  return data;
}

const DAY: [string, string][] = [
  ["day", "2030-05-14"],
  ["openHour", "10"],
  ["closeHour", "12"],
  ["horseIds", "1"],
  ["horseIds", "2"],
];

describe("parseScheduleDayForm", () => {
  it("czyta instruktorów dnia i limity miejsc z siatki instruktor × godzina", () => {
    const result = parseScheduleDayForm(
      form([
        ...DAY,
        ["instructorIds", "7"],
        ["instructorIds", "8"],
        [seatFieldName(7, 10), "2"],
        [seatFieldName(7, 11), "1"],
        [seatFieldName(8, 10), "0"],
      ]),
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      day: "2030-05-14",
      openHour: 10,
      closeHour: 12,
      horseIds: [1, 2],
      instructorIds: [7, 8],
      seats: [
        { instructorId: 7, hour: 10, seats: 2 },
        { instructorId: 7, hour: 11, seats: 1 },
        { instructorId: 8, hour: 10, seats: 0 },
      ],
    });
  });

  it("dzień bez instruktorów jest poprawny", () => {
    const result = parseScheduleDayForm(form(DAY));

    expect(result.success).toBe(true);
    expect(result.data?.instructorIds).toEqual([]);
    expect(result.data?.seats).toEqual([]);
  });

  it("puste pole limitu oznacza zero", () => {
    const result = parseScheduleDayForm(form([...DAY, ["instructorIds", "7"], [seatFieldName(7, 10), ""]]));

    expect(result.data?.seats).toEqual([{ instructorId: 7, hour: 10, seats: 0 }]);
  });

  it("pomija limity instruktora, którego nie wskazano w tym dniu", () => {
    const result = parseScheduleDayForm(form([...DAY, ["instructorIds", "7"], [seatFieldName(9, 10), "3"]]));

    expect(result.data?.seats).toEqual([]);
  });

  it("odrzuca ujemny albo ułamkowy limit z polskim komunikatem", () => {
    for (const value of ["-1", "1.5", "abc"]) {
      const result = parseScheduleDayForm(form([...DAY, ["instructorIds", "7"], [seatFieldName(7, 10), value]]));

      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Limit miejsc musi być liczbą całkowitą, zero lub więcej");
    }
  });
});

describe("hoursError", () => {
  it("poprawny zakres nie daje komunikatu", () => {
    expect(hoursError("10", "16")).toBeNull();
    expect(hoursError("0", "24")).toBeNull();
  });

  it("brak godziny otwarcia to komunikat o zakresie otwarcia", () => {
    expect(hoursError("", "16")).toBe("Godzina otwarcia musi być z zakresu 0-23");
  });

  it("brak godziny zamknięcia to komunikat o zakresie zamknięcia", () => {
    expect(hoursError("10", "")).toBe("Godzina zamknięcia musi być z zakresu 1-24");
  });

  it("zamknięcie nie później niż otwarcie to komunikat o kolejności", () => {
    expect(hoursError("12", "12")).toBe("Godzina zamknięcia musi być późniejsza niż godzina otwarcia");
    expect(hoursError("15", "10")).toBe("Godzina zamknięcia musi być późniejsza niż godzina otwarcia");
  });

  it("komunikat klienta brzmi tak samo jak odmowa serwera dla tych samych godzin", () => {
    for (const [open, close] of [
      ["24", "24"],
      ["10", "25"],
      ["15", "10"],
    ]) {
      const server = parseScheduleDayForm(
        form([
          ["day", "2030-05-14"],
          ["openHour", open],
          ["closeHour", close],
        ]),
      );

      expect(server.success).toBe(false);
      expect(hoursError(open, close)).toBe(server.error?.issues[0]?.message);
    }
  });
});
