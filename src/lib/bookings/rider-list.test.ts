import { describe, expect, it } from "vitest";
import type { RiderBooking } from "@/lib/bookings/queries";
import { splitRiderBookings } from "@/lib/bookings/rider-list";

const NOW = { today: "2026-08-20", currentHour: 13 };

function booking(overrides: Partial<RiderBooking>): RiderBooking {
  return {
    id: 1,
    horseId: 1,
    hour: 15,
    day: "2026-08-21",
    stableName: "Stadnina Pod Dębem",
    horseName: "Bella",
    status: "active",
    ...overrides,
  };
}

describe("splitRiderBookings", () => {
  it("aktywny przyszły zapis trafia do nadchodzących", () => {
    const { upcoming, history } = splitRiderBookings([booking({})], NOW);

    expect(upcoming).toHaveLength(1);
    expect(history).toHaveLength(0);
  });

  it("dzisiejszy zapis o godzinie po bieżącej jest nadchodzący, o bieżącej lub wcześniejszej — historią", () => {
    const { upcoming, history } = splitRiderBookings(
      [
        booking({ id: 1, day: NOW.today, hour: 14 }),
        booking({ id: 2, day: NOW.today, hour: 13 }),
        booking({ id: 3, day: NOW.today, hour: 12 }),
      ],
      NOW,
    );

    expect(upcoming.map((r) => r.id)).toEqual([1]);
    expect(history.map((r) => r.id)).toEqual([2, 3]);
  });

  it("zapis z dnia minionego trafia do historii mimo statusu active", () => {
    const { history } = splitRiderBookings([booking({ day: "2026-08-19" })], NOW);

    expect(history).toHaveLength(1);
  });

  it("odwołany zapis przyszły trafia do historii", () => {
    const { upcoming, history } = splitRiderBookings([booking({ status: "cancelled" })], NOW);

    expect(upcoming).toHaveLength(0);
    expect(history[0].status).toBe("cancelled");
  });

  it("nadchodzące sortuje rosnąco po dacie i godzinie", () => {
    const { upcoming } = splitRiderBookings(
      [
        booking({ id: 1, day: "2026-08-22", hour: 10 }),
        booking({ id: 2, day: "2026-08-21", hour: 15 }),
        booking({ id: 3, day: "2026-08-21", hour: 11 }),
      ],
      NOW,
    );

    expect(upcoming.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("historię sortuje malejąco — najnowsze na górze", () => {
    const { history } = splitRiderBookings(
      [
        booking({ id: 1, day: "2026-08-17", hour: 10 }),
        booking({ id: 2, day: "2026-08-19", hour: 9 }),
        booking({ id: 3, day: "2026-08-19", hour: 12 }),
      ],
      NOW,
    );

    expect(history.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("brak nazwy konia dostaje fallback z identyfikatorem", () => {
    const { upcoming } = splitRiderBookings([booking({ horseId: 99, horseName: null })], NOW);

    expect(upcoming[0].horseName).toBe("(koń #99)");
  });

  it("pusta lista daje dwie puste sekcje", () => {
    expect(splitRiderBookings([], NOW)).toEqual({ upcoming: [], history: [] });
  });
});
