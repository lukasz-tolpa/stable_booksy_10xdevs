import { describe, expect, it } from "vitest";
import { landingDemo } from "@/lib/landing/demo";

describe("landingDemo", () => {
  it("lista slotów jeźdźca pokazuje wolny slot i własny zapis w różnych godzinach", () => {
    expect(landingDemo().riderHours).toEqual([
      {
        hour: 10,
        slots: [{ instructorId: 1, instructorName: "Joanna Wrona", seats: 3, freeSeats: 2, status: "free" }],
      },
      {
        hour: 11,
        slots: [{ instructorId: 2, instructorName: "Karol Jasny", seats: 2, freeSeats: 0, status: "mine" }],
      },
    ]);
  });

  it("arkusz ośrodka pokazuje godzinę pełną i godzinę z wolnym koniem", () => {
    expect(landingDemo().sheet).toEqual({
      instructors: ["Joanna", "Karol"],
      horseCount: 3,
      rows: [
        { hour: 10, seats: [3, 0], total: 3, fill: "full" },
        { hour: 11, seats: [0, 2], total: 2, fill: "free" },
      ],
    });
  });

  it("obie ilustracje opisują ten sam dzień: limit każdego slotu jeźdźca stoi w arkuszu", () => {
    const { riderHours, sheet } = landingDemo();
    const sheetSeats = sheet.rows.flatMap((row) =>
      row.seats.map((seats, column) => ({ hour: row.hour, who: sheet.instructors[column], seats })),
    );
    const riderSeats = riderHours.flatMap((entry) =>
      entry.slots.map((slot) => ({ hour: entry.hour, who: slot.instructorName.split(" ")[0], seats: slot.seats })),
    );

    expect(riderSeats).toEqual(sheetSeats.filter((cell) => cell.seats > 0));
  });
});
