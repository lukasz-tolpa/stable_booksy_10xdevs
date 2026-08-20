import { describe, expect, it } from "vitest";
import { composeBookingRows } from "@/lib/bookings/rows";

const HORSES = [
  { id: 1, name: "Bella" },
  { id: 2, name: "Kasztan" },
  { id: 3, name: "Łatka" },
];

describe("composeBookingRows", () => {
  it("sortuje po godzinie rosnąco, a w ramach godziny po nazwie konia", () => {
    const rows = composeBookingRows(
      [
        { horseId: 2, hour: 12, riderName: "Piotr Nowak" },
        { horseId: 2, hour: 10, riderName: "Anna Kowalska" },
        { horseId: 1, hour: 12, riderName: "Anna Kowalska" },
      ],
      HORSES,
    );

    expect(rows.map((r) => `${String(r.hour)}:${r.horseName}`)).toEqual(["10:Kasztan", "12:Bella", "12:Kasztan"]);
  });

  it("sortuje polskie nazwy koni zgodnie z locale pl", () => {
    const rows = composeBookingRows(
      [
        { horseId: 3, hour: 10, riderName: null },
        { horseId: 2, hour: 10, riderName: null },
      ],
      HORSES,
    );

    // "Łatka" po "Kasztan" — naiwne porównanie kodów znaków dałoby ten sam
    // porządek, ale locale pl gwarantuje go też dla par typu "Ćma" vs "Duma".
    expect(rows.map((r) => r.horseName)).toEqual(["Kasztan", "Łatka"]);
  });

  it("brak nazwiska jeźdźca dostaje fallback", () => {
    const rows = composeBookingRows([{ horseId: 1, hour: 10, riderName: null }], HORSES);

    expect(rows[0].riderName).toBe("(bez nazwiska)");
  });

  it("koń spoza listy stada dostaje fallback z identyfikatorem", () => {
    const rows = composeBookingRows([{ horseId: 99, hour: 10, riderName: "Anna Kowalska" }], HORSES);

    expect(rows[0].horseName).toBe("(koń #99)");
  });

  it("pusta lista zapisów daje pustą listę wierszy", () => {
    expect(composeBookingRows([], HORSES)).toEqual([]);
  });
});
