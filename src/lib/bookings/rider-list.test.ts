import { describe, expect, it } from "vitest";
import type { RiderBooking } from "@/lib/bookings/queries";
import { splitRiderBookings } from "@/lib/bookings/rider-list";

const NOW = { today: "2026-08-20", currentHour: 13 };

function booking(overrides: Partial<RiderBooking>): RiderBooking {
  return {
    id: 1,
    hour: 15,
    day: "2026-08-21",
    stableName: "Stadnina Pod Dębem",
    instructorId: 1,
    instructorName: "Joanna Wrona",
    horseName: null,
    status: "active",
    cancelledBy: null,
    ...overrides,
  };
}

describe("splitRiderBookings", () => {
  it("aktywny przyszły zapis trafia do nadchodzących", () => {
    const { upcoming, history } = splitRiderBookings([booking({})], NOW);

    expect(upcoming).toHaveLength(1);
    expect(history).toHaveLength(0);
  });

  it("wiersz pokazuje instruktora, a zapis bez konia — informację, że koń zostanie przydzielony", () => {
    const { upcoming } = splitRiderBookings([booking({})], NOW);

    expect(upcoming[0]).toMatchObject({
      instructorName: "Joanna Wrona",
      horseLabel: "Koń zostanie przydzielony",
      cancelledByLabel: null,
    });
  });

  it("przydzielony koń zastępuje informację o oczekiwaniu", () => {
    const { upcoming } = splitRiderBookings([booking({ horseName: "Bella" })], NOW);

    expect(upcoming[0].horseLabel).toBe("Bella");
  });

  it("miniona jazda bez konia nie obiecuje przydziału", () => {
    const { history } = splitRiderBookings([booking({ day: "2026-08-19" })], NOW);

    expect(history[0].horseLabel).toBe("Bez przydzielonego konia");
  });

  it("odwołanie własne i przez ośrodek są rozróżnione, a odwołany zapis nie pokazuje konia", () => {
    const { history } = splitRiderBookings(
      [
        booking({ id: 1, hour: 15, status: "cancelled", cancelledBy: "rider" }),
        booking({ id: 2, hour: 16, status: "cancelled", cancelledBy: "stable" }),
      ],
      NOW,
    );

    expect(history.map((r) => [r.id, r.cancelledByLabel, r.horseLabel])).toEqual([
      [2, "przez ośrodek", null],
      [1, "przez Ciebie", null],
    ]);
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
    const { upcoming, history } = splitRiderBookings([booking({ status: "cancelled", cancelledBy: "rider" })], NOW);

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

  it("instruktor bez nazwy dostaje nazwę zastępczą z identyfikatorem", () => {
    const { upcoming } = splitRiderBookings([booking({ instructorId: 9, instructorName: null })], NOW);

    expect(upcoming[0].instructorName).toBe("(instruktor #9)");
  });

  it("pusta lista daje dwie puste sekcje", () => {
    expect(splitRiderBookings([], NOW)).toEqual({ upcoming: [], history: [] });
  });
});
