import { describe, expect, it } from "vitest";
import { composeMySlots } from "@/lib/my-slots/compose";

describe("composeMySlots", () => {
  it("pokazuje godziny z limitem > 0 i pomija godziny z limitem zero", () => {
    const days = composeMySlots({
      slots: [
        { day: "2026-11-18", hour: 10, seats: 0 },
        { day: "2026-11-18", hour: 11, seats: 2 },
        { day: "2026-11-18", hour: 12, seats: 0 },
      ],
      bookings: [],
    });

    expect(days).toEqual([{ day: "2026-11-18", slots: [{ hour: 11, seats: 2, taken: 0, riders: [] }] }]);
  });

  it("pomija dzień, w którym wszystkie godziny mają limit zero", () => {
    const days = composeMySlots({
      slots: [
        { day: "2026-11-18", hour: 10, seats: 0 },
        { day: "2026-11-19", hour: 10, seats: 1 },
      ],
      bookings: [],
    });

    expect(days.map((day) => day.day)).toEqual(["2026-11-19"]);
  });

  it("liczy zajęte miejsca i pokazuje zapisanych z przydzielonym koniem albo „bez konia”", () => {
    const days = composeMySlots({
      slots: [{ day: "2026-11-18", hour: 11, seats: 3 }],
      bookings: [
        {
          bookingId: 101,
          day: "2026-11-18",
          hour: 11,
          riderName: "Piotr Nowak",
          horseId: null,
          horseName: null,
          anonymised: false,
        },
        {
          bookingId: 102,
          day: "2026-11-18",
          hour: 11,
          riderName: "Anna Kowalska",
          horseId: 1,
          horseName: "Bella",
          anonymised: false,
        },
      ],
    });

    expect(days[0]?.slots).toEqual([
      {
        hour: 11,
        seats: 3,
        taken: 2,
        riders: [
          { bookingId: 102, name: "Anna Kowalska", horse: "Bella", hasHorse: true, horseChoices: [] },
          { bookingId: 101, name: "Piotr Nowak", horse: "bez konia", hasHorse: false, horseChoices: [] },
        ],
      },
    ]);
  });

  it("przypisuje zapis do slotu tego samego dnia i godziny", () => {
    const days = composeMySlots({
      slots: [
        { day: "2026-11-18", hour: 11, seats: 1 },
        { day: "2026-11-19", hour: 11, seats: 1 },
      ],
      bookings: [
        {
          bookingId: 103,
          day: "2026-11-19",
          hour: 11,
          riderName: "Anna Kowalska",
          horseId: null,
          horseName: null,
          anonymised: false,
        },
      ],
    });

    expect(days.map((day) => day.slots.map((slot) => slot.taken))).toEqual([[0], [1]]);
  });

  it("układa dni i godziny chronologicznie", () => {
    const days = composeMySlots({
      slots: [
        { day: "2026-11-19", hour: 9, seats: 1 },
        { day: "2026-11-18", hour: 14, seats: 1 },
        { day: "2026-11-18", hour: 10, seats: 1 },
      ],
      bookings: [],
    });

    expect(days.map((day) => [day.day, day.slots.map((slot) => slot.hour)])).toEqual([
      ["2026-11-18", [10, 14]],
      ["2026-11-19", [9]],
    ]);
  });

  it("podpisuje jeźdźca bez nazwiska i jeźdźca, który usunął konto", () => {
    const days = composeMySlots({
      slots: [{ day: "2026-11-18", hour: 11, seats: 2 }],
      bookings: [
        {
          bookingId: 104,
          day: "2026-11-18",
          hour: 11,
          riderName: null,
          horseId: null,
          horseName: null,
          anonymised: false,
        },
        {
          bookingId: 105,
          day: "2026-11-18",
          hour: 11,
          riderName: null,
          horseId: null,
          horseName: null,
          anonymised: true,
        },
      ],
    });

    expect(days[0]?.slots[0]?.riders.map((rider) => rider.name)).toEqual(["(bez nazwiska)", "Usunięty jeździec"]);
  });

  it("przy zapisie podaje konie pracujące tego dnia, a zajęte o tej godzinie oznacza „zajęty”", () => {
    const days = composeMySlots({
      slots: [{ day: "2026-11-18", hour: 11, seats: 1 }],
      bookings: [
        {
          bookingId: 7,
          day: "2026-11-18",
          hour: 11,
          riderName: "Anna Kowalska",
          horseId: null,
          horseName: null,
          anonymised: false,
        },
      ],
      horseOptions: [
        { bookingId: 7, horseId: 2, horseName: "Kasztan", taken: false },
        { bookingId: 7, horseId: 1, horseName: "Bella", taken: true },
        { bookingId: 8, horseId: 3, horseName: "Iskra", taken: false },
      ],
    });

    expect(days[0]?.slots[0]?.riders[0]).toMatchObject({
      bookingId: 7,
      horseChoices: [
        { id: 1, label: "Bella — zajęty", taken: true, selected: false },
        { id: 2, label: "Kasztan", taken: false, selected: false },
      ],
    });
  });

  it("zaznacza konia przydzielonego temu zapisowi", () => {
    const days = composeMySlots({
      slots: [{ day: "2026-11-18", hour: 11, seats: 1 }],
      bookings: [
        {
          bookingId: 7,
          day: "2026-11-18",
          hour: 11,
          riderName: "Anna Kowalska",
          horseId: 2,
          horseName: "Kasztan",
          anonymised: false,
        },
      ],
      horseOptions: [
        { bookingId: 7, horseId: 1, horseName: "Bella", taken: false },
        { bookingId: 7, horseId: 2, horseName: "Kasztan", taken: false },
      ],
    });

    expect(days[0]?.slots[0]?.riders[0]?.horseChoices).toEqual([
      { id: 1, label: "Bella", taken: false, selected: false },
      { id: 2, label: "Kasztan", taken: false, selected: true },
    ]);
  });
});
