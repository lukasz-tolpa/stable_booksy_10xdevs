import { describe, expect, it } from "vitest";
import { computeSlotSections, currentWarsawHour, type SlotSectionsInput } from "@/lib/bookings/slots";

const BELLA = { id: 1, name: "Bella" };
const KASZTAN = { id: 2, name: "Kasztan" };

function input(overrides: Partial<SlotSectionsInput> = {}): SlotSectionsInput {
  return {
    openHour: 10,
    closeHour: 12,
    horses: [BELLA, KASZTAN],
    takenSlots: [],
    myBookings: [],
    currentHour: null,
    ...overrides,
  };
}

describe("computeSlotSections", () => {
  it("generuje sekcje dla przedziału półotwartego [open, close)", () => {
    const sections = computeSlotSections(input({ openHour: 10, closeHour: 12 }));

    expect(sections.map((s) => s.hour)).toEqual([10, 11]);
  });

  it("wolny slot ma status free, a kolejność koni jest zachowana", () => {
    const sections = computeSlotSections(input({ openHour: 10, closeHour: 11 }));

    expect(sections[0].horses).toEqual([
      { id: 1, name: "Bella", status: "free" },
      { id: 2, name: "Kasztan", status: "free" },
    ]);
  });

  it("slot zajęty przez innych w ogóle nie jest emitowany", () => {
    const sections = computeSlotSections(input({ takenSlots: [{ horseId: 1, hour: 10 }] }));

    const hour10 = sections.find((s) => s.hour === 10);
    expect(hour10?.horses.map((h) => h.id)).toEqual([2]);
  });

  it("własny zapis dostaje status mine, choć występuje też w zajętości", () => {
    const slot = { horseId: 1, hour: 10 };
    const sections = computeSlotSections(input({ takenSlots: [slot], myBookings: [slot] }));

    const hour10 = sections.find((s) => s.hour === 10);
    expect(hour10?.horses).toContainEqual({ id: 1, name: "Bella", status: "mine" });
  });

  it("godzina w całości zajęta przez innych jest pomijana", () => {
    const sections = computeSlotSections(
      input({
        takenSlots: [
          { horseId: 1, hour: 10 },
          { horseId: 2, hour: 10 },
        ],
      }),
    );

    expect(sections.map((s) => s.hour)).toEqual([11]);
  });

  it("godzina z samym własnym zapisem pozostaje widoczna", () => {
    const mine = { horseId: 1, hour: 10 };
    const sections = computeSlotSections(
      input({
        horses: [BELLA],
        takenSlots: [mine],
        myBookings: [mine],
      }),
    );

    expect(sections.map((s) => s.hour)).toEqual([10, 11]);
    expect(sections[0].horses[0].status).toBe("mine");
  });

  it("dla dnia dzisiejszego ukrywa godziny minione, łącznie z bieżącą", () => {
    const sections = computeSlotSections(input({ openHour: 10, closeHour: 16, currentHour: 13 }));

    expect(sections.map((s) => s.hour)).toEqual([14, 15]);
  });

  it("currentHour null (dzień przyszły) nie filtruje niczego", () => {
    const sections = computeSlotSections(input({ openHour: 10, closeHour: 16, currentHour: null }));

    expect(sections.map((s) => s.hour)).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it("dzień bez koni daje pustą listę sekcji", () => {
    expect(computeSlotSections(input({ horses: [] }))).toEqual([]);
  });

  it("dzień dzisiejszy po godzinach pracy daje pustą listę sekcji", () => {
    expect(computeSlotSections(input({ openHour: 10, closeHour: 16, currentHour: 17 }))).toEqual([]);
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
