import { describe, expect, it } from "vitest";
import { horseDefaults, instructorDefaults, pastDaySummary, prefillFrom } from "@/lib/schedule/form";
import type { ScheduleDayData } from "@/lib/schedule/queries";

const ania = { id: 1, name: "Ania", active: true };
const basia = { id: 2, name: "Basia", active: false };
const celina = { id: 3, name: "Celina", active: true };
const instructors = [ania, basia, celina];

function day(instructorIds: number[], seats: ScheduleDayData["seats"]): ScheduleDayData {
  return { id: 10, day: "2030-05-14", openHour: 10, closeHour: 12, horseIds: [], instructorIds, seats };
}

describe("instructorDefaults", () => {
  it("ułożony dzień pokazuje swoich instruktorów i limity, także instruktora zdezaktywowanego po ułożeniu", () => {
    const saved = day(
      [1, 2],
      [
        { instructorId: 1, hour: 10, seats: 2 },
        { instructorId: 2, hour: 10, seats: 1 },
      ],
    );

    expect(instructorDefaults(saved, null, instructors)).toEqual({
      selectedInstructorIds: [1, 2],
      seats: saved.seats,
      selectableInstructors: [ania, basia, celina],
    });
  });

  it("nowy dzień podpowiada aktywnych instruktorów z ostatniego dnia z limitem 0, bez nieaktywnego", () => {
    const latest = day(
      [1, 2],
      [
        { instructorId: 1, hour: 10, seats: 2 },
        { instructorId: 2, hour: 10, seats: 1 },
      ],
    );

    // US 76 (#38): limity wystawia się świadomie dla każdego dnia — nowy dzień nie kopiuje miejsc.
    expect(instructorDefaults(null, latest, instructors)).toEqual({
      selectedInstructorIds: [1],
      seats: [],
      selectableInstructors: [ania, celina],
    });
  });

  it("bez żadnego ułożonego dnia nikogo nie zaznacza, a do wyboru są tylko aktywni", () => {
    expect(instructorDefaults(null, null, instructors)).toEqual({
      selectedInstructorIds: [],
      seats: [],
      selectableInstructors: [ania, celina],
    });
  });
});

const bella = { id: 1, name: "Bella", notes: null, active: true };
const grom = { id: 2, name: "Grom", notes: null, active: false };
const iskra = { id: 3, name: "Iskra", notes: null, active: true };
const horses = [bella, grom, iskra];

function horseDay(horseIds: number[], openHour = 10, closeHour = 16): ScheduleDayData {
  return { id: 10, day: "2030-05-14", openHour, closeHour, horseIds, instructorIds: [], seats: [] };
}

describe("horseDefaults", () => {
  it("ułożony dzień pokazuje swoje godziny i konie, także konia wycofanego po ułożeniu", () => {
    expect(horseDefaults(horseDay([1, 2], 9, 15), horseDay([3]), horses)).toEqual({
      openHour: 9,
      closeHour: 15,
      selectedHorseIds: [1, 2],
      selectableHorses: [bella, grom, iskra],
    });
  });

  it("nowy dzień podpowiada godziny i konie z ostatniego dnia; wycofany koń zostaje, bo jest zaznaczony", () => {
    expect(horseDefaults(null, horseDay([2]), horses)).toEqual({
      openHour: 10,
      closeHour: 16,
      selectedHorseIds: [2],
      selectableHorses: [bella, grom, iskra],
    });
  });

  it("bez żadnego ułożonego dnia pola są puste, a do wyboru tylko aktywne konie", () => {
    expect(horseDefaults(null, null, horses)).toEqual({
      openHour: "",
      closeHour: "",
      selectedHorseIds: [],
      selectableHorses: [bella, iskra],
    });
  });
});

describe("prefillFrom", () => {
  it("nowy dzień z podpowiedzią podaje datę dnia, z którego pochodzi szkic", () => {
    expect(prefillFrom(null, { ...horseDay([1]), day: "2030-05-12" })).toBe("2030-05-12");
  });

  it("ułożony dzień nie dostaje banera, nawet gdy istnieje późniejszy ułożony dzień", () => {
    expect(prefillFrom(horseDay([1]), { ...horseDay([1]), day: "2030-05-20" })).toBeNull();
  });

  it("bez żadnego ułożonego dnia nie ma z czego podpowiadać", () => {
    expect(prefillFrom(null, null)).toBeNull();
  });
});

describe("pastDaySummary", () => {
  it("wymienia konie i instruktorów dnia w kolejności list stadniny", () => {
    const past: ScheduleDayData = { ...horseDay([3, 1]), instructorIds: [3, 2] };

    expect(pastDaySummary(past, horses, instructors)).toEqual({
      hours: "10–16",
      horseNames: "Bella, Iskra",
      instructorNames: "Basia, Celina",
    });
  });

  it("dzień bez koni i instruktorów mówi „brak”", () => {
    expect(pastDaySummary(horseDay([]), horses, instructors)).toEqual({
      hours: "10–16",
      horseNames: "brak",
      instructorNames: "brak",
    });
  });
});
