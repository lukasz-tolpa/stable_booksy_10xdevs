import { describe, expect, it } from "vitest";
import type { RiderBooking } from "@/lib/bookings/queries";
import { splitRiderBookings } from "@/lib/bookings/rider-list";

/** 2026-08-20, 13:30 w Warszawie (czas letni, UTC+2). */
const NOW = new Date("2026-08-20T11:30:00Z");
const TODAY = "2026-08-20";

function booking(overrides: Partial<RiderBooking>): RiderBooking {
  return {
    id: 1,
    hour: 15,
    day: "2026-08-21",
    stableId: 1,
    stableName: "Stadnina Pod Dębem",
    instructorId: 1,
    instructorName: "Joanna Wrona",
    horseName: null,
    status: "active",
    cancelledBy: null,
    rejectionReason: null,
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
        booking({ id: 1, day: TODAY, hour: 14 }),
        booking({ id: 2, day: TODAY, hour: 13 }),
        booking({ id: 3, day: TODAY, hour: 12 }),
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

  it("zapis oczekujący przyszły jest w nadchodzących ze znacznikiem „Czeka na przyjęcie” i da się go odwołać", () => {
    const { upcoming, history } = splitRiderBookings([booking({ status: "pending" })], NOW);

    expect(history).toHaveLength(0);
    expect(upcoming[0]).toMatchObject({
      state: "pending",
      stateLabel: "Czeka na przyjęcie",
      cancellable: true,
      // Koń przydziela ośrodek dopiero zapisowi przyjętemu — oczekujący nie obiecuje przydziału.
      horseLabel: null,
    });
  });

  it("zapis oczekujący na slot treningowy pokazuje konia pensjonariusza z zapisu", () => {
    const { upcoming } = splitRiderBookings([booking({ status: "pending", horseName: "Hrabia" })], NOW);

    expect(upcoming[0].horseLabel).toBe("Hrabia");
  });

  it("zapis aktywny nadchodzący nie ma znacznika stanu i da się go odwołać", () => {
    const { upcoming } = splitRiderBookings([booking({})], NOW);

    expect(upcoming[0]).toMatchObject({ state: "active", stateLabel: null, cancellable: true });
  });

  it("zapis oczekujący, którego slot się zaczął, jest wygasły: do końca slotu w nadchodzących, bez odwołania", () => {
    // 13:30 — slot o 13 trwa.
    const { upcoming, history } = splitRiderBookings([booking({ status: "pending", day: TODAY, hour: 13 })], NOW);

    expect(history).toHaveLength(0);
    expect(upcoming[0]).toMatchObject({
      state: "expired",
      stateLabel: "Nie przyjęty w terminie",
      cancellable: false,
      horseLabel: null,
    });
  });

  it("po terminie slotu wygasły zapis trafia do historii", () => {
    const { upcoming, history } = splitRiderBookings(
      [
        booking({ id: 1, status: "pending", day: TODAY, hour: 12 }),
        booking({ id: 2, status: "pending", day: "2026-08-19" }),
      ],
      NOW,
    );

    expect(upcoming).toHaveLength(0);
    expect(history.map((r) => [r.id, r.state, r.stateLabel, r.horseLabel])).toEqual([
      [1, "expired", "Nie przyjęty w terminie", null],
      [2, "expired", "Nie przyjęty w terminie", null],
    ]);
  });

  it("zapis odrzucony do końca slotu jest w nadchodzących z powodem, bez odwołania i bez konia", () => {
    const { upcoming, history } = splitRiderBookings(
      [booking({ status: "rejected", rejectionReason: "Na tę godzinę mamy już komplet." })],
      NOW,
    );

    expect(history).toHaveLength(0);
    expect(upcoming[0]).toMatchObject({
      state: "rejected",
      stateLabel: "Odrzucony: Na tę godzinę mamy już komplet.",
      cancellable: false,
      horseLabel: null,
      cancelledByLabel: null,
    });
  });

  it("odrzucenie automatyczne pokazuje swój powód jak ręczne", () => {
    const { upcoming } = splitRiderBookings([booking({ status: "rejected", rejectionReason: "Brak miejsc" })], NOW);

    expect(upcoming[0].stateLabel).toBe("Odrzucony: Brak miejsc");
  });

  it("zapis odrzucony, którego slot trwa, zostaje w nadchodzących; po terminie slotu trafia do historii", () => {
    // 13:30 — slot o 13 trwa, slot o 12 się skończył.
    const { upcoming, history } = splitRiderBookings(
      [
        booking({ id: 1, status: "rejected", rejectionReason: "Brak miejsc", day: TODAY, hour: 13 }),
        booking({ id: 2, status: "rejected", rejectionReason: "Brak miejsc", day: TODAY, hour: 12 }),
        booking({ id: 3, status: "rejected", rejectionReason: "Brak miejsc", day: "2026-08-19" }),
      ],
      NOW,
    );

    expect(upcoming.map((r) => r.id)).toEqual([1]);
    expect(history.map((r) => [r.id, r.stateLabel, r.cancellable])).toEqual([
      [2, "Odrzucony: Brak miejsc", false],
      [3, "Odrzucony: Brak miejsc", false],
    ]);
  });
});
