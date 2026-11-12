import { describe, expect, it } from "vitest";
import { countDaysWithOpenSeats, openSeatsNote } from "@/lib/instructors/open-seats";

describe("countDaysWithOpenSeats", () => {
  it("liczy dni z wystawionymi miejscami osobno dla każdego instruktora, dzień raz mimo wielu slotów", () => {
    const counts = countDaysWithOpenSeats(
      [
        { instructorId: 1, day: "2030-05-14" },
        { instructorId: 1, day: "2030-05-14" },
        { instructorId: 1, day: "2030-05-15" },
        { instructorId: 2, day: "2030-05-14" },
      ],
      "2030-05-14",
    );

    expect(counts.get(1)).toBe(2);
    expect(counts.get(2)).toBe(1);
    expect(counts.get(3) ?? 0).toBe(0);
  });

  it("pomija dni minione, a dzisiejszy liczy, bo dziś jeźdźcy nadal mogą się zapisać", () => {
    const counts = countDaysWithOpenSeats(
      [
        { instructorId: 1, day: "2030-05-13" },
        { instructorId: 1, day: "2030-05-14" },
      ],
      "2030-05-14",
    );

    expect(counts.get(1)).toBe(1);
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
