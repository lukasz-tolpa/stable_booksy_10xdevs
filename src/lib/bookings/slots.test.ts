import { describe, expect, it } from "vitest";
import {
  computeSlotHours,
  currentWarsawHour,
  hasSlotStarted,
  riderSeesDay,
  riderStandingOn,
  slotStatusLabel,
  type RiderStanding,
  type SlotHoursInput,
} from "@/lib/bookings/slots";
import type { SlotSeats } from "@/lib/schedule/queries";

const JOANNA = { id: 1, name: "Joanna Wrona" };
const KAROL = { id: 2, name: "Karol Jasny" };
const ANIA = { id: 3, name: "Ania Bąk" };
const HALA = { id: 21, name: "Hala" };
const DUZY_PLAC = { id: 22, name: "Duży plac" };

function input(overrides: Partial<SlotHoursInput> = {}): SlotHoursInput {
  return {
    openHour: 10,
    closeHour: 12,
    instructors: [JOANNA, KAROL],
    places: [HALA, DUZY_PLAC],
    seats: [],
    occupancy: [],
    myBookings: [],
    currentHour: null,
    standing: { boarder: false },
    ...overrides,
  };
}

describe("computeSlotHours", () => {
  // Oracle: GLOSSARY „Limit miejsc", AC #41 — „2 z 4 wolne".
  it("wolne miejsca to limit minus aktywne zapisy w slocie", () => {
    const hours = computeSlotHours(
      input({
        seats: [{ instructorId: JOANNA.id, hour: 10, seats: 4, placeId: HALA.id, kind: "recreation" }],
        occupancy: [{ instructorId: JOANNA.id, hour: 10, taken: 2 }],
      }),
    );

    expect(hours).toEqual([
      {
        hour: 10,
        slots: [
          {
            instructorId: 1,
            instructorName: "Joanna Wrona",
            placeName: "Hala",
            seats: 4,
            freeSeats: 2,
            status: "free",
            kind: "recreation",
            horses: [],
          },
        ],
      },
    ]);
  });

  it("slot pokazuje swój plac; plac spoza listy dostaje nazwę zastępczą", () => {
    const hours = computeSlotHours(
      input({
        seats: [
          { instructorId: JOANNA.id, hour: 10, seats: 1, placeId: DUZY_PLAC.id, kind: "recreation" },
          { instructorId: KAROL.id, hour: 10, seats: 1, placeId: HALA.id, kind: "recreation" },
          { instructorId: KAROL.id, hour: 11, seats: 1, placeId: 99, kind: "recreation" },
        ],
      }),
    );

    expect(hours.map((h) => h.slots.map((s) => [s.instructorName, s.placeName]))).toEqual([
      [
        ["Joanna Wrona", "Duży plac"],
        ["Karol Jasny", "Hala"],
      ],
      [["Karol Jasny", "(plac #99)"]],
    ]);
  });

  it("slot bez wolnych miejsc jest pełny i nadal widoczny", () => {
    const hours = computeSlotHours(
      input({
        seats: [{ instructorId: JOANNA.id, hour: 10, seats: 2, placeId: HALA.id, kind: "recreation" }],
        occupancy: [{ instructorId: JOANNA.id, hour: 10, taken: 2 }],
      }),
    );

    expect(hours[0].slots[0]).toMatchObject({ freeSeats: 0, status: "full" });
  });

  it("własny zapis jest „mój”, a inni instruktorzy w tej godzinie są niedostępni — także z wolnymi miejscami", () => {
    const hours = computeSlotHours(
      input({
        seats: [
          { instructorId: JOANNA.id, hour: 10, seats: 2, placeId: HALA.id, kind: "recreation" },
          { instructorId: KAROL.id, hour: 10, seats: 1, placeId: HALA.id, kind: "recreation" },
          { instructorId: KAROL.id, hour: 11, seats: 1, placeId: HALA.id, kind: "recreation" },
        ],
        occupancy: [{ instructorId: JOANNA.id, hour: 10, taken: 1 }],
        myBookings: [{ instructorId: JOANNA.id, hour: 10 }],
      }),
    );

    expect(hours.map((h) => h.slots.map((s) => [s.instructorName, s.status]))).toEqual([
      [
        ["Joanna Wrona", "mine"],
        ["Karol Jasny", "unavailable"],
      ],
      [["Karol Jasny", "free"]],
    ]);
  });

  it("własny zapis w pełnym slocie jest „mój”, a pełny slot innego instruktora — niedostępny", () => {
    const hours = computeSlotHours(
      input({
        seats: [
          { instructorId: JOANNA.id, hour: 10, seats: 1, placeId: HALA.id, kind: "recreation" },
          { instructorId: KAROL.id, hour: 10, seats: 1, placeId: HALA.id, kind: "recreation" },
        ],
        occupancy: [
          { instructorId: JOANNA.id, hour: 10, taken: 1 },
          { instructorId: KAROL.id, hour: 10, taken: 1 },
        ],
        myBookings: [{ instructorId: JOANNA.id, hour: 10 }],
      }),
    );

    expect(hours[0].slots.map((s) => s.status)).toEqual(["mine", "unavailable"]);
  });

  it("slot z limitem zero nie jest pokazywany, a godzina bez żadnego miejsca znika", () => {
    const hours = computeSlotHours(
      input({
        seats: [
          { instructorId: JOANNA.id, hour: 10, seats: 0, placeId: HALA.id, kind: "recreation" },
          { instructorId: KAROL.id, hour: 10, seats: 0, placeId: HALA.id, kind: "recreation" },
          { instructorId: JOANNA.id, hour: 11, seats: 0, placeId: HALA.id, kind: "recreation" },
          { instructorId: KAROL.id, hour: 11, seats: 1, placeId: HALA.id, kind: "recreation" },
        ],
      }),
    );

    expect(hours.map((h) => [h.hour, h.slots.map((s) => s.instructorName)])).toEqual([[11, ["Karol Jasny"]]]);
  });

  // Próg z S-04: slot o godzinie <= bieżącej (Europe/Warsaw) w dniu dzisiejszym już się zaczął.
  it("dzisiaj pomija godziny, które się zaczęły — także własny zapis", () => {
    const hours = computeSlotHours(
      input({
        openHour: 10,
        closeHour: 13,
        seats: [10, 11, 12].map((hour) => ({
          instructorId: JOANNA.id,
          hour,
          seats: 1,
          placeId: HALA.id,
          kind: "recreation",
        })),
        myBookings: [{ instructorId: JOANNA.id, hour: 11 }],
        currentHour: 11,
      }),
    );

    expect(hours.map((h) => h.hour)).toEqual([12]);
  });

  it("w dzień przyszły (currentHour null) pokazuje wszystkie godziny", () => {
    const hours = computeSlotHours(
      input({
        seats: [10, 11].map((hour) => ({
          instructorId: JOANNA.id,
          hour,
          seats: 1,
          placeId: HALA.id,
          kind: "recreation",
        })),
      }),
    );

    expect(hours.map((h) => h.hour)).toEqual([10, 11]);
  });

  it("slot poza godzinami pracy dnia [open, close) nie jest pokazywany", () => {
    const hours = computeSlotHours(
      input({
        openHour: 10,
        closeHour: 12,
        seats: [
          { instructorId: JOANNA.id, hour: 9, seats: 1, placeId: HALA.id, kind: "recreation" },
          { instructorId: JOANNA.id, hour: 12, seats: 1, placeId: HALA.id, kind: "recreation" },
        ],
      }),
    );

    expect(hours).toEqual([]);
  });

  it("grupuje po godzinie rosnąco, a pod godziną instruktorów alfabetycznie (po polsku)", () => {
    const hours = computeSlotHours(
      input({
        instructors: [KAROL, JOANNA, ANIA],
        seats: [
          { instructorId: KAROL.id, hour: 11, seats: 1, placeId: HALA.id, kind: "recreation" },
          { instructorId: JOANNA.id, hour: 10, seats: 1, placeId: HALA.id, kind: "recreation" },
          { instructorId: KAROL.id, hour: 10, seats: 1, placeId: HALA.id, kind: "recreation" },
          { instructorId: ANIA.id, hour: 10, seats: 1, placeId: HALA.id, kind: "recreation" },
        ],
      }),
    );

    expect(hours.map((h) => [h.hour, h.slots.map((s) => s.instructorName)])).toEqual([
      [10, ["Ania Bąk", "Joanna Wrona", "Karol Jasny"]],
      [11, ["Karol Jasny"]],
    ]);
  });

  it("dzień bez wystawionych miejsc daje pustą listę (stan pusty)", () => {
    expect(computeSlotHours(input())).toEqual([]);
  });

  it("instruktor spoza listy dostaje nazwę zastępczą zamiast wywrócić widok", () => {
    const hours = computeSlotHours(
      input({ seats: [{ instructorId: 99, hour: 10, seats: 1, placeId: HALA.id, kind: "recreation" }] }),
    );

    expect(hours[0].slots[0].instructorName).toBe("(instruktor #99)");
  });

  it("zajętość ponad limit (limit obniżony wstecz) nie daje ujemnych wolnych miejsc", () => {
    const hours = computeSlotHours(
      input({
        seats: [{ instructorId: JOANNA.id, hour: 10, seats: 1, placeId: HALA.id, kind: "recreation" }],
        occupancy: [{ instructorId: JOANNA.id, hour: 10, taken: 3 }],
      }),
    );

    expect(hours[0].slots[0]).toMatchObject({ freeSeats: 0, status: "full" });
  });
});

const HRABIA = { id: 31, name: "Hrabia" };
const HRABINA = { id: 32, name: "Hrabina" };
const RECREATION: RiderStanding = { boarder: false };
const boarder = (horses = [HRABIA]): RiderStanding => ({ boarder: true, horses });

/** Dzień z jednym slotem rekreacyjnym Joanny i jednym treningowym Karola o 10:00. */
const MIXED_DAY: SlotSeats[] = [
  { instructorId: JOANNA.id, hour: 10, seats: 2, placeId: HALA.id, kind: "recreation" },
  { instructorId: KAROL.id, hour: 10, seats: 3, placeId: DUZY_PLAC.id, kind: "training" },
];

// Oracle: GLOSSARY „Slot treningowy”, „Pensjonariusz”, AC #115 — jeździec rekreacyjny nie widzi slotów
// treningowych, pensjonariusz widzi je i zapisuje się na swoim koniu, a sloty rekreacyjne są nie dla niego.
describe("computeSlotHours — rodzaj slotu wobec jeźdźca", () => {
  it("jeździec rekreacyjny nie widzi slotów treningowych", () => {
    const hours = computeSlotHours(input({ seats: MIXED_DAY, standing: RECREATION }));

    expect(hours).toHaveLength(1);
    expect(hours[0].slots.map((slot) => [slot.instructorName, slot.kind, slot.status])).toEqual([
      ["Joanna Wrona", "recreation", "free"],
    ]);
  });

  it("pensjonariusz widzi slot treningowy jako wolny, a rekreacyjny jako nie dla siebie", () => {
    const hours = computeSlotHours(input({ seats: MIXED_DAY, standing: boarder() }));

    expect(hours[0].slots.map((slot) => [slot.instructorName, slot.kind, slot.status])).toEqual([
      ["Joanna Wrona", "recreation", "not_for_me"],
      ["Karol Jasny", "training", "free"],
    ]);
  });

  it("pensjonariusz zapisuje się na koniach z pobytem w dniu jazdy: jeden koń albo wybór kilku", () => {
    const one = computeSlotHours(input({ seats: MIXED_DAY, standing: boarder() }));
    const two = computeSlotHours(input({ seats: MIXED_DAY, standing: boarder([HRABIA, HRABINA]) }));

    expect(one[0].slots[1].horses).toEqual([HRABIA]);
    expect(two[0].slots[1].horses).toEqual([HRABIA, HRABINA]);
    expect(two[0].slots[0].horses).toEqual([]);
  });

  it("pensjonariusz bez konia w ośrodku w dniu jazdy nie zapisze się na slot treningowy", () => {
    const hours = computeSlotHours(input({ seats: MIXED_DAY, standing: boarder([]) }));

    expect(hours[0].slots[1]).toMatchObject({ status: "no_horse", horses: [] });
  });

  it("własny zapis i zajęta godzina mają pierwszeństwo przed rodzajem slotu", () => {
    const hours = computeSlotHours(
      input({ seats: MIXED_DAY, standing: boarder(), myBookings: [{ instructorId: KAROL.id, hour: 10 }] }),
    );

    expect(hours[0].slots.map((slot) => slot.status)).toEqual(["unavailable", "mine"]);
  });
});

describe("riderSeesDay", () => {
  const trainingOnly: SlotSeats[] = [
    { instructorId: KAROL.id, hour: 10, seats: 3, placeId: HALA.id, kind: "training" },
    { instructorId: JOANNA.id, hour: 10, seats: 0, placeId: HALA.id, kind: "recreation" },
  ];

  it("jeździec rekreacyjny nie widzi dnia, w którym są wyłącznie sloty treningowe", () => {
    expect(riderSeesDay(trainingOnly, RECREATION)).toBe(false);
    expect(riderSeesDay(MIXED_DAY, RECREATION)).toBe(true);
  });

  it("pensjonariusz widzi każdy ułożony dzień", () => {
    expect(riderSeesDay(trainingOnly, boarder())).toBe(true);
    expect(riderSeesDay([], boarder())).toBe(true);
  });
});

describe("riderStandingOn", () => {
  const stays = (arrivalDay: string, departureDay: string | null) => [{ arrivalDay, departureDay }];

  it("jeździec bez koni pensjonatowych w ośrodku jest rekreacyjny", () => {
    expect(riderStandingOn([], "2026-12-15")).toEqual({ boarder: false });
  });

  it("pensjonariusz w miesiącu dnia z końmi, których pobyt obejmuje dzień jazdy", () => {
    const horses = [
      { ...HRABIA, stays: stays("2026-09-01", null) },
      { ...HRABINA, stays: stays("2026-12-16", null) },
      { id: 33, name: "Baron", stays: stays("2026-09-01", "2026-12-15") },
    ];

    expect(riderStandingOn(horses, "2026-12-15")).toEqual({
      boarder: true,
      horses: [{ id: 33, name: "Baron" }, HRABIA],
    });
  });

  it("koń, który wyjechał w poprzednim miesiącu, nie czyni jeźdźca pensjonariuszem", () => {
    expect(riderStandingOn([{ ...HRABIA, stays: stays("2026-09-01", "2026-11-30") }], "2026-12-15")).toEqual({
      boarder: false,
    });
  });
});

describe("slotStatusLabel", () => {
  // Kontrakt lokatorów (test-plan §6.3): pigułki „Twój zapis”, „Brak miejsc”,
  // „Masz już zapis o tej godzinie”; wolny slot ma przycisk, nie pigułkę.
  it("daje podpis pigułki dla slotu, na który nie da się zapisać", () => {
    expect(slotStatusLabel("mine")).toBe("Twój zapis");
    expect(slotStatusLabel("full")).toBe("Brak miejsc");
    expect(slotStatusLabel("unavailable")).toBe("Masz już zapis o tej godzinie");
  });

  it("slot nie dla pensjonariusza i slot treningowy bez konia mają własne podpisy", () => {
    expect(slotStatusLabel("not_for_me")).toBe("Slot rekreacyjny — nie dla pensjonariuszy");
    expect(slotStatusLabel("no_horse")).toBe("Twój koń nie stoi tego dnia w ośrodku");
  });

  it("wolny slot nie ma pigułki", () => {
    expect(slotStatusLabel("free")).toBeNull();
  });
});

describe("hasSlotStarted", () => {
  // 2026-11-13 12:30 w Warszawie (czas zimowy, UTC+1). Próg odwołania przez jeźdźca i przez
  // ośrodek oraz zapisu: slot o godzinie <= bieżącej w dniu dzisiejszym już się zaczął.
  const NOW = new Date("2026-11-13T11:30:00Z");

  it("slot dnia minionego już się zaczął, nawet o późnej godzinie", () => {
    expect(hasSlotStarted("2026-11-12", 23, NOW)).toBe(true);
  });

  it("dziś slot o godzinie późniejszej niż bieżąca jeszcze się nie zaczął", () => {
    expect(hasSlotStarted("2026-11-13", 13, NOW)).toBe(false);
  });

  it("dziś slot bieżącej godziny już się zaczął (jazda trwa), wcześniejszy też", () => {
    expect(hasSlotStarted("2026-11-13", 12, NOW)).toBe(true);
    expect(hasSlotStarted("2026-11-13", 11, NOW)).toBe(true);
  });

  it("jutro żaden slot się nie zaczął, także o północy", () => {
    expect(hasSlotStarted("2026-11-14", 0, NOW)).toBe(false);
  });

  it("dzień liczy w strefie Europe/Warsaw: o 23:30 UTC w Warszawie jest już następna doba", () => {
    const afterWarsawMidnight = new Date("2026-11-13T23:30:00Z");

    expect(hasSlotStarted("2026-11-14", 0, afterWarsawMidnight)).toBe(true);
    expect(hasSlotStarted("2026-11-14", 1, afterWarsawMidnight)).toBe(false);
  });
});

describe("currentWarsawHour", () => {
  it("liczy godzinę w strefie Europe/Warsaw, nie w UTC (czas zimowy: UTC+1)", () => {
    expect(currentWarsawHour(new Date("2026-01-15T13:30:00Z"))).toBe(14);
  });

  it("uwzględnia czas letni (UTC+2)", () => {
    expect(currentWarsawHour(new Date("2026-07-15T13:30:00Z"))).toBe(15);
  });

  it("obsługuje przejście przez północ", () => {
    expect(currentWarsawHour(new Date("2026-01-15T23:30:00Z"))).toBe(0);
  });
});
