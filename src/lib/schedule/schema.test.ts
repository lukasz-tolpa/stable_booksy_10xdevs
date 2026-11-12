import { describe, expect, it } from "vitest";
import { parseScheduleDayForm, seatFieldName } from "@/lib/schedule/schema";

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
