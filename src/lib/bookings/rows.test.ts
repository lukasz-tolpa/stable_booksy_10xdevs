import { describe, expect, it } from "vitest";
import type { DayBooking } from "@/lib/bookings/queries";
import { composeDayBookingSections } from "@/lib/bookings/rows";

const HORSES = [
  { id: 1, name: "Bella" },
  { id: 2, name: "Kasztan" },
  { id: 3, name: "Iskra" },
];

/** Dzień listy jutro względem „teraz" — żaden zapis nie zaczął się, chyba że test mówi inaczej. */
const DAY = "2026-11-14";
/** 2026-11-13, 12:30 w Warszawie (czas zimowy, UTC+1). */
const NOW = new Date("2026-11-13T11:30:00Z");

function booking(overrides: Partial<DayBooking>): DayBooking {
  return {
    id: 1,
    hour: 10,
    instructorId: 1,
    instructorName: "Joanna Wrona",
    horseId: null,
    riderName: "Anna Kowalska",
    anonymised: false,
    status: "active",
    cancelledBy: null,
    ...overrides,
  };
}

function sections(bookings: DayBooking[], options: { dayHorseIds?: number[]; day?: string } = {}) {
  return composeDayBookingSections({
    bookings,
    horses: HORSES,
    dayHorseIds: options.dayHorseIds ?? [1, 2],
    day: options.day ?? DAY,
    now: NOW,
  });
}

describe("composeDayBookingSections — zapisy aktywne", () => {
  it("wiersz ma godzinę, instruktora, jeźdźca i konia — zapis bez konia jest wyróżniony „bez konia”", () => {
    const [row] = sections([booking({})]).active;

    expect(row).toMatchObject({
      id: 1,
      hour: 10,
      instructorName: "Joanna Wrona",
      riderName: "Anna Kowalska",
      horseId: null,
      horseName: "bez konia",
    });
  });

  it("przydzielony koń dostaje nazwę z listy stada, a spoza niej — nazwę zastępczą", () => {
    const rows = sections([booking({ id: 1, horseId: 2 }), booking({ id: 2, hour: 11, horseId: 99 })]).active;

    expect(rows.map((r) => r.horseName)).toEqual(["Kasztan", "(koń #99)"]);
  });

  it("do wyboru są wyłącznie konie pracujące tego dnia, posortowane po nazwie", () => {
    const [row] = sections([booking({})], { dayHorseIds: [2, 3] }).active;

    expect(row.horseOptions).toEqual([
      { id: 3, name: "Iskra" },
      { id: 2, name: "Kasztan" },
    ]);
  });

  it("koń zajęty o tej godzinie przez inny zapis nie jest do wyboru, ale własny koń zapisu zostaje", () => {
    const rows = sections([
      booking({ id: 1, hour: 10, horseId: 1 }),
      booking({ id: 2, hour: 10, riderName: "Piotr Nowak" }),
      booking({ id: 3, hour: 11, riderName: "Zenon Ząb" }),
    ]).active;

    const optionsOf = (id: number) => rows.find((r) => r.id === id)?.horseOptions.map((h) => h.name);
    expect(optionsOf(1)).toEqual(["Bella", "Kasztan"]);
    expect(optionsOf(2)).toEqual(["Kasztan"]);
    // Inna godzina — Bella wolna.
    expect(optionsOf(3)).toEqual(["Bella", "Kasztan"]);
  });

  it("zapis daje się odwołać przed terminem, a nie od chwili, gdy jego godzina się zaczęła (Europe/Warsaw)", () => {
    const today = sections([booking({ id: 1, hour: 12 }), booking({ id: 2, hour: 13 })], { day: "2026-11-13" }).active;
    expect(today.map((r) => [r.hour, r.cancellable])).toEqual([
      [12, false],
      [13, true],
    ]);

    const [past] = sections([booking({ hour: 15 })], { day: "2026-11-12" }).active;
    expect(past.cancellable).toBe(false);

    const [future] = sections([booking({ hour: 8 })]).active;
    expect(future.cancellable).toBe(true);
  });

  it("sortuje po godzinie, potem po instruktorze i jeźdźcu (locale pl)", () => {
    const rows = sections([
      booking({ id: 1, hour: 12, instructorId: 2, instructorName: "Karol Jasny", riderName: "Piotr Nowak" }),
      booking({ id: 2, hour: 10, instructorName: "Łucja Lis", riderName: "Anna Kowalska" }),
      booking({ id: 3, hour: 10, instructorName: "Karol Jasny", riderName: "Zenon Ząb" }),
      booking({ id: 4, hour: 10, instructorName: "Karol Jasny", riderName: "Ćwirek Ola" }),
    ]).active;

    expect(rows.map((r) => `${String(r.hour)} ${r.instructorName} ${r.riderName}`)).toEqual([
      "10 Karol Jasny Ćwirek Ola",
      "10 Karol Jasny Zenon Ząb",
      "10 Łucja Lis Anna Kowalska",
      "12 Karol Jasny Piotr Nowak",
    ]);
  });

  it("brak nazwiska jeźdźca dostaje fallback, a zapis bez jeźdźca (konto usunięto) — „Usunięty jeździec”", () => {
    const rows = sections([
      booking({ id: 1, riderName: null }),
      booking({ id: 2, hour: 11, riderName: null, anonymised: true }),
    ]).active;

    expect(rows.map((r) => r.riderName)).toEqual(["(bez nazwiska)", "Usunięty jeździec"]);
  });

  it("instruktor, którego nazwy RLS nie oddał, dostaje nazwę zastępczą z identyfikatorem", () => {
    const [row] = sections([booking({ instructorId: 7, instructorName: null })]).active;

    expect(row.instructorName).toBe("(instruktor #7)");
  });

  it("pusta lista zapisów daje puste sekcje", () => {
    expect(sections([])).toEqual({ active: [], cancelled: [] });
  });
});

describe("composeDayBookingSections — zapisy odwołane", () => {
  it("odwołane trafiają do osobnej sekcji z oznaczeniem, kto odwołał, i bez konia", () => {
    const result = sections([
      booking({ id: 1, hour: 10 }),
      booking({ id: 2, hour: 11, status: "cancelled", cancelledBy: "rider", riderName: "Piotr Nowak" }),
      booking({ id: 3, hour: 10, status: "cancelled", cancelledBy: "stable", riderName: "Zenon Ząb" }),
    ]);

    expect(result.active.map((r) => r.id)).toEqual([1]);
    expect(result.cancelled).toEqual([
      { id: 3, hour: 10, instructorName: "Joanna Wrona", riderName: "Zenon Ząb", cancelledByLabel: "przez ośrodek" },
      { id: 2, hour: 11, instructorName: "Joanna Wrona", riderName: "Piotr Nowak", cancelledByLabel: "przez jeźdźca" },
    ]);
  });

  it("tylko zapis aktywny zajmuje konia — odwołany nie odbiera go innym w tej godzinie", () => {
    const result = sections([
      booking({ id: 1, hour: 10, status: "cancelled", cancelledBy: "rider", horseId: 1 }),
      booking({ id: 2, hour: 10, riderName: "Piotr Nowak" }),
    ]);

    expect(result.active[0].horseOptions.map((h) => h.name)).toEqual(["Bella", "Kasztan"]);
  });
});
