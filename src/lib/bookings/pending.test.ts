import { describe, expect, it } from "vitest";
import { composePendingBookings, type PendingBooking } from "@/lib/bookings/pending";

/** 2026-08-20, 13:30 w Warszawie (czas letni, UTC+2). */
const NOW = new Date("2026-08-20T11:30:00Z");
const TODAY = "2026-08-20";

function pending(overrides: Partial<PendingBooking>): PendingBooking {
  return {
    id: 1,
    day: "2026-08-21",
    hour: 11,
    instructorId: 1,
    instructorName: "Joanna Wrona",
    placeName: "Hala",
    kind: "recreation",
    seats: 2,
    taken: 0,
    riderName: "Anna Kowalska",
    riderEmail: "anna.kowalska@example.com",
    createdAt: "2026-08-19T10:00:00Z",
    ...overrides,
  };
}

describe("composePendingBookings", () => {
  it("zapis oczekujący ma jeźdźca (imię i nazwisko, e-mail), slot i liczbę wolnych miejsc", () => {
    const view = composePendingBookings([pending({ seats: 3, taken: 1 })], NOW);

    expect(view).toEqual([
      {
        day: "2026-08-21",
        rows: [
          {
            id: 1,
            hour: 11,
            riderName: "Anna Kowalska",
            riderEmail: "anna.kowalska@example.com",
            instructorName: "Joanna Wrona",
            placeName: "Hala",
            kind: "recreation",
            freeSeats: 2,
            seats: 3,
          },
        ],
      },
    ]);
  });

  it("najbliższe terminy na górze: dzień, godzina, a w slocie — kto pierwszy się zapisał", () => {
    const view = composePendingBookings(
      [
        pending({ id: 1, day: "2026-08-22", hour: 10 }),
        pending({ id: 2, day: "2026-08-21", hour: 15 }),
        pending({ id: 3, day: "2026-08-21", hour: 11, createdAt: "2026-08-19T12:00:00Z" }),
        pending({ id: 4, day: "2026-08-21", hour: 11, createdAt: "2026-08-19T09:00:00Z" }),
      ],
      NOW,
    );

    expect(view.map((day) => [day.day, day.rows.map((row) => row.id)])).toEqual([
      ["2026-08-21", [4, 3, 2]],
      ["2026-08-22", [1]],
    ]);
  });

  // GLOSSARY „Wygaśnięcie zapisu”: zapis oczekujący, którego slot się zaczął, nie czeka już na decyzję.
  it("zapis, którego slot się zaczął (wygasły), znika; dzisiejszy późniejszy zostaje", () => {
    const view = composePendingBookings(
      [
        pending({ id: 1, day: TODAY, hour: 13 }),
        pending({ id: 2, day: TODAY, hour: 12 }),
        pending({ id: 3, day: TODAY, hour: 14 }),
        pending({ id: 4, day: "2026-08-19", hour: 15 }),
      ],
      NOW,
    );

    expect(view.flatMap((day) => day.rows.map((row) => row.id))).toEqual([3]);
  });

  it("pełny slot (także limit obniżony poniżej zajętych) ma zero wolnych miejsc", () => {
    const view = composePendingBookings(
      [pending({ id: 1, seats: 1, taken: 1 }), pending({ id: 2, hour: 12, seats: 1, taken: 2 })],
      NOW,
    );

    expect(view[0].rows.map((row) => row.freeSeats)).toEqual([0, 0]);
  });

  it("brakujące imię, adres albo plac dostają podpis zastępczy zamiast pustego pola", () => {
    const view = composePendingBookings([pending({ riderName: null, riderEmail: null, placeName: null })], NOW);

    expect(view[0].rows[0]).toMatchObject({ riderName: "(jeździec)", riderEmail: null, placeName: "(plac)" });
  });

  it("bez zapisów oczekujących — pusta lista", () => {
    expect(composePendingBookings([], NOW)).toEqual([]);
  });
});
