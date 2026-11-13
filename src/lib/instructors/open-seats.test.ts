import { describe, expect, it } from "vitest";
import { countDaysWithOpenSeats, openSeatsNote } from "@/lib/instructors/open-seats";

/** 2030-05-14, 12:30 w Warszawie (czas letni, UTC+2). */
const NOW = new Date("2030-05-14T10:30:00Z");

describe("countDaysWithOpenSeats", () => {
  it("liczy dni z wystawionymi miejscami osobno dla każdego instruktora, dzień raz mimo wielu slotów", () => {
    const counts = countDaysWithOpenSeats(
      [
        { instructorId: 1, day: "2030-05-15", hour: 10 },
        { instructorId: 1, day: "2030-05-15", hour: 11 },
        { instructorId: 1, day: "2030-05-16", hour: 10 },
        { instructorId: 2, day: "2030-05-15", hour: 10 },
      ],
      NOW,
    );

    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.get(3) ?? 0).toBe(0);
  });

  it("pomija dni minione, a dzisiejszy liczy, gdy ma slot z miejscami, który się jeszcze nie zaczął", () => {
    const counts = countDaysWithOpenSeats(
      [
        { instructorId: 1, day: "2030-05-13", hour: 15 },
        { instructorId: 1, day: "2030-05-14", hour: 11 },
        { instructorId: 1, day: "2030-05-14", hour: 13 },
      ],
      NOW,
    );

    expect(counts.get(1)).toBe(1);
  });

  it("dzisiejszy dzień nie liczy się, gdy wszystkie jego godziny z miejscami już się zaczęły", () => {
    const counts = countDaysWithOpenSeats(
      [
        { instructorId: 1, day: "2030-05-14", hour: 11 },
        { instructorId: 1, day: "2030-05-14", hour: 12 },
      ],
      NOW,
    );

    expect(counts.get(1) ?? 0).toBe(0);
  });
});

describe("openSeatsNote", () => {
  it("mówi, w ilu dniach instruktor nadal ma wystawione miejsca", () => {
    expect(openSeatsNote(1)).toBe("Nadal ma wystawione miejsca w 1 dniu — wyzeruj jego limity w grafiku.");
    expect(openSeatsNote(3)).toBe("Nadal ma wystawione miejsca w 3 dniach — wyzeruj jego limity w grafiku.");
  });

  it("bez wystawionych miejsc nie ma czego pokazać", () => {
    expect(openSeatsNote(0)).toBeNull();
  });
});
