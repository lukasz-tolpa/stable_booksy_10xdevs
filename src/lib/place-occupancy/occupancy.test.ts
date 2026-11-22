import { describe, expect, it } from "vitest";
import { boarderOccupancyStables, composePlaceOccupancy } from "@/lib/place-occupancy/occupancy";

const HALA = { id: 1, name: "Hala", active: true };
const DUZY = { id: 2, name: "Duży plac", active: true };
const LONZOWNIK = { id: 3, name: "Lonżownik", active: false };

describe("composePlaceOccupancy", () => {
  it("dzień bez grafiku nie ma siatki", () => {
    expect(composePlaceOccupancy({ day: null, places: [HALA], slots: [] })).toEqual({ scheduled: false });
  });

  it("siatka godzina × plac: w komórce instruktor, rodzaj slotu i liczba zajętych miejsc; place alfabetycznie", () => {
    const view = composePlaceOccupancy({
      day: { openHour: 10, closeHour: 12 },
      places: [HALA, DUZY],
      slots: [
        { placeId: 1, hour: 10, instructorName: "Joanna Wrona", kind: "recreation", taken: 3 },
        { placeId: 2, hour: 11, instructorName: "Marek Dębowski", kind: "training", taken: 1 },
      ],
    });

    expect(view).toEqual({
      scheduled: true,
      places: [
        { id: 2, name: "Duży plac" },
        { id: 1, name: "Hala" },
      ],
      hours: [
        {
          hour: 10,
          label: "10:00",
          empty: false,
          cells: [
            { placeId: 2, placeName: "Duży plac", slots: [], totalLabel: null },
            {
              placeId: 1,
              placeName: "Hala",
              slots: [
                {
                  instructorName: "Joanna Wrona",
                  kind: "recreation",
                  kindLabel: "slot rekreacyjny",
                  takenLabel: "3 zajęte miejsca",
                },
              ],
              totalLabel: null,
            },
          ],
        },
        {
          hour: 11,
          label: "11:00",
          empty: false,
          cells: [
            {
              placeId: 2,
              placeName: "Duży plac",
              slots: [
                {
                  instructorName: "Marek Dębowski",
                  kind: "training",
                  kindLabel: "slot treningowy",
                  takenLabel: "1 zajęte miejsce",
                },
              ],
              totalLabel: null,
            },
            { placeId: 1, placeName: "Hala", slots: [], totalLabel: null },
          ],
        },
      ],
    });
  });

  it("godzina bez slotów na żadnym placu jest pusta, a slot bez zapisów pokazuje zero zajętych miejsc", () => {
    const view = composePlaceOccupancy({
      day: { openHour: 10, closeHour: 13 },
      places: [HALA],
      slots: [{ placeId: 1, hour: 12, instructorName: "Karol Jasny", kind: "recreation", taken: 0 }],
    });

    if (!view.scheduled) throw new Error("dzień ułożony");
    expect(view.hours.map((entry) => [entry.label, entry.empty])).toEqual([
      ["10:00", true],
      ["11:00", true],
      ["12:00", false],
    ]);
    expect(view.hours[2].cells[0].slots[0].takenLabel).toBe("0 zajętych miejsc");
  });

  it("kilka slotów na jednym placu w godzinie: każdy instruktor osobno (alfabetycznie) i suma zajętych miejsc", () => {
    const view = composePlaceOccupancy({
      day: { openHour: 10, closeHour: 11 },
      places: [DUZY],
      slots: [
        { placeId: 2, hour: 10, instructorName: "Marek Dębowski", kind: "training", taken: 2 },
        { placeId: 2, hour: 10, instructorName: "Karol Jasny", kind: "recreation", taken: 3 },
      ],
    });

    if (!view.scheduled) throw new Error("dzień ułożony");
    const cell = view.hours[0].cells[0];
    expect(cell.slots.map((slot) => `${slot.instructorName} ${slot.kindLabel} ${slot.takenLabel}`)).toEqual([
      "Karol Jasny slot rekreacyjny 3 zajęte miejsca",
      "Marek Dębowski slot treningowy 2 zajęte miejsca",
    ]);
    expect(cell.totalLabel).toBe("Razem 5 zajętych miejsc");
  });

  it("plac nieaktywny pojawia się tylko w dniu, w którym ma sloty", () => {
    const withSlot = composePlaceOccupancy({
      day: { openHour: 10, closeHour: 11 },
      places: [HALA, LONZOWNIK],
      slots: [{ placeId: 3, hour: 10, instructorName: "Joanna Wrona", kind: "recreation", taken: 1 }],
    });
    const without = composePlaceOccupancy({
      day: { openHour: 10, closeHour: 11 },
      places: [HALA, LONZOWNIK],
      slots: [{ placeId: 1, hour: 10, instructorName: "Joanna Wrona", kind: "recreation", taken: 1 }],
    });

    expect(withSlot.scheduled && withSlot.places.map((place) => place.name)).toEqual(["Hala", "Lonżownik"]);
    expect(without.scheduled && without.places.map((place) => place.name)).toEqual(["Hala"]);
  });
});

describe("boarderOccupancyStables", () => {
  const today = "2026-11-22";

  it("tylko ośrodki, w których koń pensjonariusza stoi dziś — każdy raz, alfabetycznie", () => {
    const stables = boarderOccupancyStables(
      [
        { stableId: 7, stableName: "Stadnina Pod Dębem", stays: [{ arrivalDay: "2026-08-24", departureDay: null }] },
        { stableId: 7, stableName: "Stadnina Pod Dębem", stays: [{ arrivalDay: "2026-10-01", departureDay: null }] },
        {
          stableId: 5,
          stableName: "Klub Nad Rzeką",
          stays: [{ arrivalDay: "2026-11-22", departureDay: "2026-11-22" }],
        },
        // Wyjechał wczoraj, przyjedzie jutro — dziś nie stoi.
        {
          stableId: 9,
          stableName: "Ośrodek Brzozy",
          stays: [{ arrivalDay: "2026-01-01", departureDay: "2026-11-21" }],
        },
        { stableId: 11, stableName: "Ośrodek Lipy", stays: [{ arrivalDay: "2026-11-23", departureDay: null }] },
      ],
      today,
    );

    expect(stables).toEqual([
      { id: 5, name: "Klub Nad Rzeką" },
      { id: 7, name: "Stadnina Pod Dębem" },
    ]);
  });

  it("jeździec bez koni pensjonatowych nie ma ośrodków z zajętością placów", () => {
    expect(boarderOccupancyStables([], today)).toEqual([]);
  });
});
