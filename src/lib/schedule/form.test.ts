import { describe, expect, it } from "vitest";
import { instructorDefaults } from "@/lib/schedule/form";
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

  it("nowy dzień podpowiada aktywnych instruktorów z ostatniego dnia z ich limitami, bez nieaktywnego", () => {
    const latest = day(
      [1, 2],
      [
        { instructorId: 1, hour: 10, seats: 2 },
        { instructorId: 2, hour: 10, seats: 1 },
      ],
    );

    expect(instructorDefaults(null, latest, instructors)).toEqual({
      selectedInstructorIds: [1],
      seats: [{ instructorId: 1, hour: 10, seats: 2 }],
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
