import { describe, expect, it } from "vitest";
import type { DayBooking } from "@/lib/bookings/queries";
import { composeDayBookingSections, type DayBoardingHorse } from "@/lib/bookings/rows";
import type { SlotSeats } from "@/lib/schedule/queries";

const HORSES = [
  { id: 1, name: "Bella" },
  { id: 2, name: "Kasztan" },
  { id: 3, name: "Iskra" },
  { id: 31, name: "Hrabia" },
  { id: 32, name: "Hrabina" },
  { id: 33, name: "Baron" },
  { id: 34, name: "Cudzy" },
];

const KASIA = "rider-kasia";

/** Konie pensjonatowe: Hrabia i Hrabina Kasi w pobycie, Baron Kasi wyjechał przed dniem listy, Cudzy - Piotra. */
const BOARDING: DayBoardingHorse[] = [
  { horseId: 31, riderKey: KASIA, stays: [{ arrivalDay: "2026-08-01", departureDay: null }] },
  { horseId: 32, riderKey: KASIA, stays: [{ arrivalDay: "2026-11-01", departureDay: null }] },
  { horseId: 33, riderKey: KASIA, stays: [{ arrivalDay: "2026-08-01", departureDay: "2026-11-13" }] },
  { horseId: 34, riderKey: "rider-piotr", stays: [{ arrivalDay: "2026-08-01", departureDay: null }] },
];

const PLACES = [
  { id: 21, name: "Hala" },
  { id: 22, name: "Duży plac" },
];

/** Sloty dnia: Joanna o 10 na Hali, o 11 na Dużym placu. */
const SLOTS: SlotSeats[] = [
  { instructorId: 1, hour: 10, seats: 2, placeId: 21, kind: "recreation" },
  { instructorId: 1, hour: 11, seats: 2, placeId: 22, kind: "recreation" },
  { instructorId: 2, hour: 10, seats: 3, placeId: 22, kind: "training" },
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
    riderId: "rider-anna",
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
    slots: SLOTS,
    places: PLACES,
    boardingHorses: BOARDING,
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

  it("wiersz pokazuje plac slotu zapisu; zapis bez slotu w grafiku nie ma placu", () => {
    const rows = sections([
      booking({ id: 1, hour: 10 }),
      booking({ id: 2, hour: 11, riderName: "Piotr Nowak" }),
      booking({ id: 3, hour: 12, riderName: "Ola Las" }),
    ]).active;

    expect(rows.map((r) => [r.hour, r.placeName])).toEqual([
      [10, "Hala"],
      [11, "Duży plac"],
      [12, null],
    ]);
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

  // Oracle: AC #115 — zapisy dnia pokazują rodzaj slotu i konia pensjonariusza; przydział przy slocie
  // treningowym tylko w granicach koni tego samego pensjonariusza z pobytem w dniu jazdy.
  it("zapis na slot treningowy ma rodzaj slotu, konia pensjonariusza i do wyboru tylko jego konie z pobytem", () => {
    const rows = sections([
      booking({ id: 1, instructorId: 2, instructorName: "Karol Jasny", riderId: KASIA, horseId: 31 }),
      booking({ id: 2 }),
    ]).active;

    const training = rows.find((r) => r.id === 1);
    expect(training).toMatchObject({ kind: "training", horseName: "Hrabia" });
    expect(training?.horseOptions).toEqual([
      { id: 31, name: "Hrabia" },
      { id: 32, name: "Hrabina" },
    ]);
    expect(rows.find((r) => r.id === 2)).toMatchObject({ kind: "recreation" });
  });

  // Oracle: spec #112 — zapis na slot treningowy zawsze ma konia pensjonariusza: ośrodek wybiera jednego z jego
  // koni, „bez konia” jest tylko przy slocie rekreacyjnym.
  it("„bez konia” do wyboru tylko przy slocie rekreacyjnym", () => {
    const rows = sections([
      booking({ id: 1, instructorId: 2, instructorName: "Karol Jasny", riderId: KASIA, horseId: 31 }),
      booking({ id: 2 }),
    ]).active;

    expect(rows.map((r) => [r.id, r.noHorseChoice])).toEqual([
      [2, true],
      [1, false],
    ]);
  });

  it("zapis na slot treningowy bez jeźdźca (konto usunięte) nie ma koni do wyboru", () => {
    const [row] = sections([
      booking({ instructorId: 2, instructorName: "Karol Jasny", riderId: null, anonymised: true, horseId: 31 }),
    ]).active;

    expect(row.horseOptions).toEqual([]);
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
