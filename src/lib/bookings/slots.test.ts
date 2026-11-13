import { describe, expect, it } from "vitest";
import {
  computeSlotHours,
  currentWarsawHour,
  hasSlotStarted,
  slotStatusLabel,
  type SlotHoursInput,
} from "@/lib/bookings/slots";

const JOANNA = { id: 1, name: "Joanna Wrona" };
const KAROL = { id: 2, name: "Karol Jasny" };
const ANIA = { id: 3, name: "Ania Bąk" };

function input(overrides: Partial<SlotHoursInput> = {}): SlotHoursInput {
  return {
    openHour: 10,
    closeHour: 12,
    instructors: [JOANNA, KAROL],
    seats: [],
    occupancy: [],
    myBookings: [],
    currentHour: null,
    ...overrides,
  };
}

describe("computeSlotHours", () => {
  // Oracle: GLOSSARY „Limit miejsc", AC #41 — „2 z 4 wolne".
  it("wolne miejsca to limit minus aktywne zapisy w slocie", () => {
    const hours = computeSlotHours(
      input({
        seats: [{ instructorId: JOANNA.id, hour: 10, seats: 4 }],
        occupancy: [{ instructorId: JOANNA.id, hour: 10, taken: 2 }],
      }),
    );

    expect(hours).toEqual([
      {
        hour: 10,
        slots: [{ instructorId: 1, instructorName: "Joanna Wrona", seats: 4, freeSeats: 2, status: "free" }],
      },
    ]);
  });

  it("slot bez wolnych miejsc jest pełny i nadal widoczny", () => {
    const hours = computeSlotHours(
      input({
        seats: [{ instructorId: JOANNA.id, hour: 10, seats: 2 }],
        occupancy: [{ instructorId: JOANNA.id, hour: 10, taken: 2 }],
      }),
    );

    expect(hours[0].slots[0]).toMatchObject({ freeSeats: 0, status: "full" });
  });

  it("własny zapis jest „mój”, a inni instruktorzy w tej godzinie są niedostępni — także z wolnymi miejscami", () => {
    const hours = computeSlotHours(
      input({
        seats: [
          { instructorId: JOANNA.id, hour: 10, seats: 2 },
          { instructorId: KAROL.id, hour: 10, seats: 1 },
          { instructorId: KAROL.id, hour: 11, seats: 1 },
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
          { instructorId: JOANNA.id, hour: 10, seats: 1 },
          { instructorId: KAROL.id, hour: 10, seats: 1 },
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
          { instructorId: JOANNA.id, hour: 10, seats: 0 },
          { instructorId: KAROL.id, hour: 10, seats: 0 },
          { instructorId: JOANNA.id, hour: 11, seats: 0 },
          { instructorId: KAROL.id, hour: 11, seats: 1 },
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
        seats: [10, 11, 12].map((hour) => ({ instructorId: JOANNA.id, hour, seats: 1 })),
        myBookings: [{ instructorId: JOANNA.id, hour: 11 }],
        currentHour: 11,
      }),
    );

    expect(hours.map((h) => h.hour)).toEqual([12]);
  });

  it("w dzień przyszły (currentHour null) pokazuje wszystkie godziny", () => {
    const hours = computeSlotHours(
      input({ seats: [10, 11].map((hour) => ({ instructorId: JOANNA.id, hour, seats: 1 })) }),
    );

    expect(hours.map((h) => h.hour)).toEqual([10, 11]);
  });

  it("slot poza godzinami pracy dnia [open, close) nie jest pokazywany", () => {
    const hours = computeSlotHours(
      input({
        openHour: 10,
        closeHour: 12,
        seats: [
          { instructorId: JOANNA.id, hour: 9, seats: 1 },
          { instructorId: JOANNA.id, hour: 12, seats: 1 },
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
          { instructorId: KAROL.id, hour: 11, seats: 1 },
          { instructorId: JOANNA.id, hour: 10, seats: 1 },
          { instructorId: KAROL.id, hour: 10, seats: 1 },
          { instructorId: ANIA.id, hour: 10, seats: 1 },
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
    const hours = computeSlotHours(input({ seats: [{ instructorId: 99, hour: 10, seats: 1 }] }));

    expect(hours[0].slots[0].instructorName).toBe("(instruktor #99)");
  });

  it("zajętość ponad limit (limit obniżony wstecz) nie daje ujemnych wolnych miejsc", () => {
    const hours = computeSlotHours(
      input({
        seats: [{ instructorId: JOANNA.id, hour: 10, seats: 1 }],
        occupancy: [{ instructorId: JOANNA.id, hour: 10, taken: 3 }],
      }),
    );

    expect(hours[0].slots[0]).toMatchObject({ freeSeats: 0, status: "full" });
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
