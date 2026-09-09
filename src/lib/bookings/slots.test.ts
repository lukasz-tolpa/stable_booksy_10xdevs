import { describe, expect, it } from "vitest";
import { assignedHorses, computeSlotSections, currentWarsawHour, type SlotSectionsInput } from "@/lib/bookings/slots";

const BELLA = { id: 1, name: "Bella" };
const KASZTAN = { id: 2, name: "Kasztan" };
const ISKRA = { id: 3, name: "Iskra" };

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

  // Oracle: PRD Guardrails „brak zapisów poza zakresem godzin pracy ośrodka (np. poza
  // 10–16)" + AGENTS.md „10–16 means slots 10…15". Negatywy są jawne, bo poprzednie
  // testy wnioskowały granicę tylko z równości listy.
  it.each([
    [10, 16, 15, 16],
    [9, 14, 13, 14],
    [10, 11, 10, 11],
  ])("zakres %i–%i oferuje godzinę %i, a nie %i (granica close)", (open, close, lastOffered, closeHour) => {
    const hours = computeSlotSections(input({ openHour: open, closeHour: close })).map((s) => s.hour);

    expect(hours).toContain(lastOffered);
    expect(hours).not.toContain(closeHour);
    expect(hours).not.toContain(open - 1);
    expect(hours[0]).toBe(open);
  });

  it("zakres o szerokości jednej godziny daje dokładnie jedną sekcję", () => {
    expect(computeSlotSections(input({ openHour: 10, closeHour: 11 })).map((s) => s.hour)).toEqual([10]);
  });

  it("zakres zdegenerowany (open === close) daje pustą listę, a nie błąd", () => {
    expect(computeSlotSections(input({ openHour: 12, closeHour: 12 }))).toEqual([]);
  });

  // Pełny przykład z seeda (Stadnina Pod Debem, jutro, widz niebędący właścicielem
  // zapisu): 10–16, Bella + Kasztan, Anna ma Bellę o 11. Oczekiwany zbiór wyliczony
  // z reguły PRD, nie z funkcji: 12 par − 1 zajęta = 11 slotów, o 11 sam Kasztan.
  it("przykład z seeda: 10–16, Bella+Kasztan, Bella@11 zajęta → dokładnie 11 wolnych slotów", () => {
    const sections = computeSlotSections(
      input({ openHour: 10, closeHour: 16, takenSlots: [{ horseId: BELLA.id, hour: 11 }] }),
    );

    const free = (names: string[]) =>
      names.map((name) => ({ ...(name === "Bella" ? BELLA : KASZTAN), status: "free" }));
    expect(sections).toEqual([
      { hour: 10, horses: free(["Bella", "Kasztan"]) },
      { hour: 11, horses: free(["Kasztan"]) },
      { hour: 12, horses: free(["Bella", "Kasztan"]) },
      { hour: 13, horses: free(["Bella", "Kasztan"]) },
      { hour: 14, horses: free(["Bella", "Kasztan"]) },
      { hour: 15, horses: free(["Bella", "Kasztan"]) },
    ]);
    expect(sections.flatMap((s) => s.horses)).toHaveLength(11);
  });

  it("zajętość konia spoza listy dnia nie tworzy widmowego konia", () => {
    const sections = computeSlotSections(input({ takenSlots: [{ horseId: 99, hour: 10 }] }));

    expect(sections.flatMap((s) => s.horses.map((h) => h.id))).not.toContain(99);
    expect(sections.find((s) => s.hour === 10)?.horses).toHaveLength(2);
  });

  it("zdublowane wpisy zajętości dają ten sam wynik co pojedynczy", () => {
    const once = computeSlotSections(input({ takenSlots: [{ horseId: 1, hour: 10 }] }));
    const twice = computeSlotSections(
      input({
        takenSlots: [
          { horseId: 1, hour: 10 },
          { horseId: 1, hour: 10 },
        ],
      }),
    );

    expect(twice).toEqual(once);
  });

  it("własny zapis nieobecny w zajętości wciąż jest oznaczany jako mine (wejście tolerowane)", () => {
    const sections = computeSlotSections(input({ myBookings: [{ horseId: 1, hour: 10 }] }));

    expect(sections.find((s) => s.hour === 10)?.horses[0]).toEqual({ id: 1, name: "Bella", status: "mine" });
  });
});

describe("assignedHorses", () => {
  // Oracle: PRD Business Logic — para (koń, godzina) dotyczy „konia przydzielonego do
  // pracy tego dnia". W seedzie Iskra nie jest przydzielona do jutra.
  it("pomija konie nieprzydzielone do dnia (Iskra) i zachowuje kolejność wejścia", () => {
    expect(assignedHorses([BELLA, KASZTAN, ISKRA], [KASZTAN.id, BELLA.id])).toEqual([BELLA, KASZTAN]);
  });

  // Decyzja z planowania Fazy 2: emerytowany, ale przydzielony koń pozostaje oferowany —
  // kryterium jest przydział, nie flaga `active` (kontrakt bazy, S-04).
  it("ignoruje flagę active: przydzielony koń emerytowany pozostaje oferowany", () => {
    const retired = { ...BELLA, active: false };

    expect(assignedHorses([retired, { ...KASZTAN, active: true }], [BELLA.id, KASZTAN.id])).toEqual([BELLA, KASZTAN]);
  });

  it("identyfikator przydziału bez konia w stadzie jest pomijany", () => {
    expect(assignedHorses([BELLA], [BELLA.id, 99])).toEqual([BELLA]);
  });

  it("pusty przydział daje pustą listę", () => {
    expect(assignedHorses([BELLA, KASZTAN], [])).toEqual([]);
  });

  it("nie przenosi dodatkowych pól konia do wyniku", () => {
    expect(assignedHorses([{ ...BELLA, active: true }], [BELLA.id])[0]).toEqual({ id: 1, name: "Bella" });
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
