import { describe, expect, it } from "vitest";
import type { DayBooking } from "@/lib/bookings/queries";
import { composeBookingRows } from "@/lib/bookings/rows";

const HORSES = [
  { id: 1, name: "Bella" },
  { id: 2, name: "Kasztan" },
];

function booking(overrides: Partial<DayBooking>): DayBooking {
  return {
    hour: 10,
    instructorId: 1,
    instructorName: "Joanna Wrona",
    horseId: null,
    riderName: "Anna Kowalska",
    anonymised: false,
    ...overrides,
  };
}

describe("composeBookingRows", () => {
  it("wiersz ma godzinę, instruktora, jeźdźca i konia — zapis bez konia jest podpisany „bez konia”", () => {
    expect(composeBookingRows([booking({})], HORSES)).toEqual([
      { hour: 10, instructorName: "Joanna Wrona", riderName: "Anna Kowalska", horseName: "bez konia" },
    ]);
  });

  it("przydzielony koń dostaje nazwę z listy stada, a spoza niej — nazwę zastępczą", () => {
    const rows = composeBookingRows([booking({ horseId: 2 }), booking({ hour: 11, horseId: 99 })], HORSES);

    expect(rows.map((r) => r.horseName)).toEqual(["Kasztan", "(koń #99)"]);
  });

  it("sortuje po godzinie, potem po instruktorze i jeźdźcu (locale pl)", () => {
    const rows = composeBookingRows(
      [
        booking({ hour: 12, instructorId: 2, instructorName: "Karol Jasny", riderName: "Piotr Nowak" }),
        booking({ hour: 10, instructorName: "Łucja Lis", riderName: "Anna Kowalska" }),
        booking({ hour: 10, instructorName: "Karol Jasny", riderName: "Zenon Ząb" }),
        booking({ hour: 10, instructorName: "Karol Jasny", riderName: "Ćwirek Ola" }),
      ],
      HORSES,
    );

    expect(rows.map((r) => `${String(r.hour)} ${r.instructorName} ${r.riderName}`)).toEqual([
      "10 Karol Jasny Ćwirek Ola",
      "10 Karol Jasny Zenon Ząb",
      "10 Łucja Lis Anna Kowalska",
      "12 Karol Jasny Piotr Nowak",
    ]);
  });

  it("brak nazwiska jeźdźca dostaje fallback", () => {
    expect(composeBookingRows([booking({ riderName: null })], HORSES)[0].riderName).toBe("(bez nazwiska)");
  });

  it("miniony zapis bez jeźdźca (konto usunięto) jest podpisany jako usunięty jeździec", () => {
    const rows = composeBookingRows([booking({ riderName: null, anonymised: true })], HORSES);

    expect(rows[0].riderName).toBe("Usunięty jeździec");
  });

  it("instruktor, którego nazwy RLS nie oddał, dostaje nazwę zastępczą z identyfikatorem", () => {
    const rows = composeBookingRows([booking({ instructorId: 7, instructorName: null })], HORSES);

    expect(rows[0].instructorName).toBe("(instruktor #7)");
  });

  it("pusta lista zapisów daje pustą listę wierszy", () => {
    expect(composeBookingRows([], HORSES)).toEqual([]);
  });
});
