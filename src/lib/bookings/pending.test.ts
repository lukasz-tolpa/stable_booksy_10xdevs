import { describe, expect, it } from "vitest";
import { composeDayPendingSlots, composePendingBookings, type PendingBooking } from "@/lib/bookings/pending";

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
    rejectedBefore: false,
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
            full: false,
            seatsLabel: "2 z 3 wolne",
            rejectedBefore: false,
            othersWaitingLabel: null,
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

  it("pełny slot (także limit obniżony poniżej zajętych) ma „Brak miejsc”", () => {
    const view = composePendingBookings(
      [pending({ id: 1, seats: 1, taken: 1 }), pending({ id: 2, hour: 12, seats: 1, taken: 2 })],
      NOW,
    );

    expect(view[0].rows.map((row) => [row.full, row.seatsLabel])).toEqual([
      [true, "Brak miejsc"],
      [true, "Brak miejsc"],
    ]);
  });

  it("brakujące imię, adres albo plac dostają podpis zastępczy zamiast pustego pola", () => {
    const view = composePendingBookings([pending({ riderName: null, riderEmail: null, placeName: null })], NOW);

    expect(view[0].rows[0]).toMatchObject({ riderName: "(jeździec)", riderEmail: null, placeName: "(plac)" });
  });

  it("zapis jeźdźca, któremu ośrodek odrzucił już zapis na ten slot, jest oznaczony", () => {
    const [day] = composePendingBookings([pending({ id: 1, rejectedBefore: true }), pending({ id: 2 })], NOW);

    expect(day.rows.map((row) => [row.id, row.rejectedBefore])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it("bez zapisów oczekujących — pusta lista", () => {
    expect(composePendingBookings([], NOW)).toEqual([]);
  });
});

describe("composePendingBookings — inni czekający na ten slot (US 26)", () => {
  it("przy zapisie liczba pozostałych zapisów oczekujących tego samego slotu; wygasłe się nie liczą", () => {
    const view = composePendingBookings(
      [
        pending({ id: 1, riderName: "Anna" }),
        pending({ id: 2, riderName: "Piotr" }),
        pending({ id: 3, riderName: "Zofia" }),
        // Inny instruktor o tej samej godzinie — inny slot.
        pending({ id: 4, instructorId: 2, instructorName: "Karol Jasny" }),
        // Ten sam instruktor, dziś o 13 — slot się zaczął, zapis wygasł.
        pending({ id: 5, day: TODAY, hour: 13 }),
      ],
      NOW,
    );

    expect(view.flatMap((day) => day.rows.map((row) => [row.id, row.othersWaitingLabel]))).toEqual([
      [1, "inni czekający na ten slot: 2"],
      [2, "inni czekający na ten slot: 2"],
      [3, "inni czekający na ten slot: 2"],
      [4, null],
    ]);
  });
});

describe("composeDayPendingSlots", () => {
  it("zapisy oczekujące dnia przy swoim slocie: slot z wolnymi miejscami i liczbą czekających, jeźdźcy po kolei zapisów", () => {
    const slots = composeDayPendingSlots(
      [
        pending({ id: 1, hour: 12, riderName: "Piotr", createdAt: "2026-08-19T12:00:00Z" }),
        pending({ id: 2, hour: 12, riderName: "Anna", createdAt: "2026-08-19T09:00:00Z", rejectedBefore: true }),
        pending({
          id: 3,
          hour: 10,
          instructorId: 2,
          instructorName: "Karol Jasny",
          kind: "training",
          seats: 1,
          taken: 1,
        }),
        // Inny dzień — nie na tej liście.
        pending({ id: 4, day: "2026-08-22", hour: 12 }),
      ],
      "2026-08-21",
      NOW,
    );

    expect(slots).toEqual([
      {
        hour: 10,
        instructorName: "Karol Jasny",
        placeName: "Hala",
        kind: "training",
        full: true,
        seatsLabel: "Brak miejsc",
        waitingLabel: "1 czeka",
        rows: [{ id: 3, riderName: "Anna Kowalska", riderEmail: "anna.kowalska@example.com", rejectedBefore: false }],
      },
      {
        hour: 12,
        instructorName: "Joanna Wrona",
        placeName: "Hala",
        kind: "recreation",
        full: false,
        seatsLabel: "2 z 2 wolne",
        waitingLabel: "2 czekają",
        rows: [
          { id: 2, riderName: "Anna", riderEmail: "anna.kowalska@example.com", rejectedBefore: true },
          { id: 1, riderName: "Piotr", riderEmail: "anna.kowalska@example.com", rejectedBefore: false },
        ],
      },
    ]);
  });

  it("dziś zapisy, których slot się zaczął (wygasłe), znikają; późniejsze zostają", () => {
    const slots = composeDayPendingSlots(
      [pending({ id: 1, day: TODAY, hour: 13 }), pending({ id: 2, day: TODAY, hour: 14 })],
      TODAY,
      NOW,
    );

    expect(slots.map((slot) => [slot.hour, slot.rows.map((row) => row.id)])).toEqual([[14, [2]]]);
  });

  it("dzień bez zapisów oczekujących — pusta lista", () => {
    expect(composeDayPendingSlots([pending({ day: "2026-08-22" })], "2026-08-21", NOW)).toEqual([]);
  });
});
