import { describe, expect, it } from "vitest";
import { computeStableStats, type StatsBooking, type StatsInput, type StatsScheduleDay } from "@/lib/stats/stats";

const BELLA = 1;
const KASZTAN = 2;

/** 10 listopada 2026, 14:30 w Warszawie (CET, UTC+1) — godzina 13 już się skończyła, 14 trwa. */
const NOW = new Date("2026-11-10T13:30:00Z");

/**
 * Dzień 10–12 z dwoma końmi i limitami miejsc: jeden instruktor z 2 miejscami w każdej
 * godzinie — razem 4 wystawione miejsca (reguła sumy: limit godziny ≤ liczba koni).
 */
function day(iso: string, overrides: Partial<StatsScheduleDay> = {}): StatsScheduleDay {
  return {
    day: iso,
    openHour: 10,
    closeHour: 12,
    horseIds: [BELLA, KASZTAN],
    slots: [
      { hour: 10, seats: 2 },
      { hour: 11, seats: 2 },
    ],
    ...overrides,
  };
}

function booking(iso: string, hour: number, overrides: Partial<StatsBooking> = {}): StatsBooking {
  // Odwołanie bez wskazanej strony to odwołanie jeźdźca — jak w bazie, gdzie odwołany zapis zawsze ją ma.
  const cancelledBy = overrides.status === "cancelled" ? "rider" : null;
  return { day: iso, horseId: BELLA, hour, status: "active", riderId: "rider-anna", cancelledBy, ...overrides };
}

function input(overrides: Partial<StatsInput> = {}): StatsInput {
  return {
    period: { from: "2026-11-01", to: "2026-11-10" },
    days: [],
    bookings: [],
    riders: [],
    horses: [],
    ...overrides,
  };
}

describe("computeStableStats — granica jazdy", () => {
  it("aktywny zapis z minionego dnia jest jazdą", () => {
    const stats = computeStableStats(input({ days: [day("2026-11-05")], bookings: [booking("2026-11-05", 10)] }), NOW);

    expect(stats.summary.rides).toBe(1);
  });

  it("dziś liczy się godzina zakończona, a trwająca i przyszła nie", () => {
    const today = day("2026-11-10", { openHour: 12, closeHour: 17 });
    const bookings = [booking("2026-11-10", 13), booking("2026-11-10", 14), booking("2026-11-10", 15)];

    const stats = computeStableStats(input({ days: [today], bookings }), NOW);

    expect(stats.summary.rides).toBe(1);
  });

  it("godzina kończąca się dokładnie teraz jest już jazdą", () => {
    // 15:00:00 w Warszawie — slot 14:00–15:00 właśnie się skończył.
    const stats = computeStableStats(
      input({ days: [day("2026-11-10", { openHour: 14, closeHour: 16 })], bookings: [booking("2026-11-10", 14)] }),
      new Date("2026-11-10T14:00:00Z"),
    );

    expect(stats.summary.rides).toBe(1);
  });

  it("granica dnia jest liczona w czasie polskim, nie w UTC", () => {
    // 23:30 UTC 9 listopada to już 00:30 10 listopada w Warszawie: cały 9 listopada minął,
    // choć w UTC godzina 23 dopiero trwa.
    const stats = computeStableStats(
      input({
        days: [day("2026-11-09", { openHour: 22, closeHour: 24 })],
        bookings: [booking("2026-11-09", 23)],
      }),
      new Date("2026-11-09T23:30:00Z"),
    );

    expect(stats.summary.rides).toBe(1);
  });

  it("latem (CEST) godzina kończy się o dwie godziny wcześniej w UTC", () => {
    // 09:30 UTC 10 lipca to 11:30 w Warszawie: godzina 10 skończona, 11 trwa.
    const stats = computeStableStats(
      input({
        period: { from: "2026-07-01", to: "2026-07-10" },
        days: [day("2026-07-10")],
        bookings: [booking("2026-07-10", 10), booking("2026-07-10", 11)],
      }),
      new Date("2026-07-10T09:30:00Z"),
    );

    expect(stats.summary.rides).toBe(1);
  });

  it("zapis odwołany nie jest jazdą", () => {
    const stats = computeStableStats(
      input({ days: [day("2026-11-05")], bookings: [booking("2026-11-05", 10, { status: "cancelled" })] }),
      NOW,
    );

    expect(stats.summary.rides).toBe(0);
  });
});

describe("computeStableStats — podsumowanie okresu", () => {
  it("godziny jazd to suma czasu trwania jazd", () => {
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05"), day("2026-11-06")],
        bookings: [
          booking("2026-11-05", 10),
          booking("2026-11-05", 11),
          booking("2026-11-06", 10, { horseId: KASZTAN }),
          booking("2026-11-06", 11, { status: "cancelled" }),
        ],
      }),
      NOW,
    );

    expect(stats.summary.rides).toBe(3);
    expect(stats.summary.rideHours).toBe(3);
  });

  it("odwołanie należy do okresu według terminu zapisu", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-08" },
        days: [day("2026-10-31"), day("2026-11-03"), day("2026-11-09")],
        bookings: [
          booking("2026-10-31", 10, { status: "cancelled" }),
          booking("2026-11-03", 10, { status: "cancelled" }),
          booking("2026-11-03", 11, { status: "cancelled", horseId: KASZTAN }),
          booking("2026-11-09", 10, { status: "cancelled" }),
        ],
      }),
      NOW,
    );

    expect(stats.summary.cancellations).toBe(2);
    expect(stats.summary.rides).toBe(0);
  });

  it("odwołanie liczy się dopiero, gdy godzina jego slotu się skończyła", () => {
    // Dziś o 14:30: godzina 13 zakończona, 14 trwa, 15 i jutro jeszcze nie nadeszły.
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-30" },
        days: [day("2026-11-10", { openHour: 12, closeHour: 17 }), day("2026-11-11")],
        bookings: [
          booking("2026-11-10", 13, { status: "cancelled" }),
          booking("2026-11-10", 14, { status: "cancelled" }),
          booking("2026-11-10", 15, { status: "cancelled" }),
          booking("2026-11-11", 10, { status: "cancelled" }),
        ],
      }),
      NOW,
    );

    expect(stats.summary.cancellations).toBe(1);
  });

  it("okres z samymi odwołaniami na przyszłe godziny jest pusty", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-30" },
        days: [day("2026-11-11")],
        bookings: [booking("2026-11-11", 10, { status: "cancelled" })],
      }),
      NOW,
    );

    expect(stats.isEmpty).toBe(true);
  });

  it("slot odwołany i zajęty ponownie to jedno odwołanie i jedna jazda", () => {
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05", { openHour: 10, closeHour: 11, horseIds: [BELLA], slots: [{ hour: 10, seats: 1 }] })],
        bookings: [booking("2026-11-05", 10, { status: "cancelled" }), booking("2026-11-05", 10)],
      }),
      NOW,
    );

    expect(stats.summary).toEqual({ rides: 1, rideHours: 1, occupancyPercent: 100, cancellations: 1 });
  });
});

/** Limit `seats` w każdej godzinie `[from, to)` — jeden instruktor. */
function seatsEachHour(from: number, to: number, seats: number) {
  return Array.from({ length: to - from }, (_, index) => ({ hour: from + index, seats }));
}

describe("computeStableStats — obłożenie grafiku", () => {
  it("jazdy dzielone przez sumę limitów miejsc minionych slotów", () => {
    // Dwóch instruktorów: o 10 limity 2 + 1, o 11 limit 1 i 0 — razem 4 miejsca, 1 jazda.
    const stats = computeStableStats(
      input({
        days: [
          day("2026-11-05", {
            horseIds: [BELLA, KASZTAN, 3],
            slots: [
              { hour: 10, seats: 2 },
              { hour: 10, seats: 1 },
              { hour: 11, seats: 1 },
              { hour: 11, seats: 0 },
            ],
          }),
        ],
        bookings: [booking("2026-11-05", 10)],
      }),
      NOW,
    );

    expect(stats.summary.occupancyPercent).toBe(25);
  });

  it("mianownikiem są miejsca, nie konie: koń bez wystawionego miejsca nie zaniża obłożenia", () => {
    // 2 konie, ale jedno miejsce w każdej z 2 godzin: 2 jazdy na 2 miejsca = 100%.
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05", { slots: seatsEachHour(10, 12, 1) })],
        bookings: [booking("2026-11-05", 10), booking("2026-11-05", 11, { horseId: KASZTAN })],
      }),
      NOW,
    );

    expect(stats.summary.occupancyPercent).toBe(100);
  });

  it("do mianownika wchodzą tylko sloty, których godzina już minęła", () => {
    // Wczoraj: 2 godziny po 1 miejscu. Dziś o 14:30 z zakresu 12–17 minęły godziny
    // 12 i 13 (2 miejsca), 14 trwa. Jutro: nic. Razem 4 minione miejsca i 3 jazdy.
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-30" },
        days: [
          day("2026-11-09", { horseIds: [BELLA], slots: seatsEachHour(10, 12, 1) }),
          day("2026-11-10", { openHour: 12, closeHour: 17, horseIds: [BELLA], slots: seatsEachHour(12, 17, 1) }),
          day("2026-11-11", { horseIds: [BELLA], slots: seatsEachHour(10, 12, 1) }),
        ],
        bookings: [
          booking("2026-11-09", 10),
          booking("2026-11-09", 11),
          booking("2026-11-10", 13),
          booking("2026-11-10", 15),
          booking("2026-11-11", 10),
        ],
      }),
      NOW,
    );

    expect(stats.summary.occupancyPercent).toBe(75);
  });

  it("dni grafiku spoza okresu nie wchodzą do mianownika", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-05", to: "2026-11-05" },
        days: [
          day("2026-11-04"),
          day("2026-11-05", { openHour: 10, closeHour: 11, slots: [{ hour: 10, seats: 2 }] }),
          day("2026-11-06"),
        ],
        bookings: [booking("2026-11-05", 10)],
      }),
      NOW,
    );

    expect(stats.summary.occupancyPercent).toBe(50);
  });

  it("procent jest zaokrąglany do liczby całkowitej", () => {
    // 1 jazda na 3 miejsca (3 godziny po 1 miejscu).
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05", { openHour: 10, closeHour: 13, horseIds: [BELLA], slots: seatsEachHour(10, 13, 1) })],
        bookings: [booking("2026-11-05", 10)],
      }),
      NOW,
    );

    expect(stats.summary.occupancyPercent).toBe(33);
  });

  it("wystawione miejsca bez jazd to 0%, nie brak danych", () => {
    const stats = computeStableStats(input({ days: [day("2026-11-05")] }), NOW);

    expect(stats.summary.occupancyPercent).toBe(0);
  });

  it.each([
    ["brak grafiku w okresie", []],
    ["dzień bez instruktorów: konie są, miejsc nie ma", [day("2026-11-05", { slots: [] })]],
    ["wszystkie limity zero", [day("2026-11-05", { slots: seatsEachHour(10, 12, 0) })]],
    ["miejsca tylko w dniach, które nie nadeszły", [day("2026-11-11")]],
    [
      "miejsca dziś tylko w godzinach trwających i przyszłych",
      [
        day("2026-11-10", {
          openHour: 13,
          closeHour: 16,
          slots: [
            { hour: 13, seats: 0 },
            { hour: 14, seats: 2 },
            { hour: 15, seats: 2 },
          ],
        }),
      ],
    ],
  ])("bez miejsc w minionych slotach obłożenie to brak danych, nie zero: %s", (_label, days) => {
    const stats = computeStableStats(input({ period: { from: "2026-11-01", to: "2026-11-30" }, days }), NOW);

    expect(stats.summary.occupancyPercent).toBeNull();
  });
});

describe("computeStableStats — okres statystyk", () => {
  it("oba krańce okresu należą do okresu, dni spoza niego nie", () => {
    const bookings = [
      booking("2026-10-31", 10),
      booking("2026-11-01", 10),
      booking("2026-11-08", 10),
      booking("2026-11-09", 10),
    ];

    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-08" },
        days: ["2026-10-31", "2026-11-01", "2026-11-08", "2026-11-09"].map((iso) => day(iso)),
        bookings,
      }),
      NOW,
    );

    expect(stats.summary.rides).toBe(2);
  });

  it("okres bez minionych slotów, jazd i odwołań jest pusty", () => {
    // Zapis na przyszłą godzinę nie jest ani jazdą, ani odwołaniem, a jej slot jeszcze nie minął.
    const stats = computeStableStats(
      input({
        days: [day("2026-11-10", { openHour: 16, closeHour: 18, slots: seatsEachHour(16, 18, 2) })],
        bookings: [booking("2026-11-10", 16)],
      }),
      NOW,
    );

    expect(stats.isEmpty).toBe(true);
    expect(stats.summary).toEqual({ rides: 0, rideHours: 0, occupancyPercent: null, cancellations: 0 });
  });

  it("okres z wystawionym grafikiem, ale bez jazd, nie jest pusty: 0% obłożenia i konie z zerami", () => {
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05")],
        horses: [
          { id: BELLA, name: "Bella" },
          { id: KASZTAN, name: "Kasztan" },
        ],
      }),
      NOW,
    );

    expect(stats.isEmpty).toBe(false);
    expect(stats.summary).toEqual({ rides: 0, rideHours: 0, occupancyPercent: 0, cancellations: 0 });
    expect(stats.horses).toEqual([
      { horseId: BELLA, name: "Bella", rides: 0, rideHours: 0 },
      { horseId: KASZTAN, name: "Kasztan", rides: 0, rideHours: 0 },
    ]);
    expect(stats.riders).toEqual([]);
    expect(stats.topRiders).toEqual([]);
  });

  it("okres z końmi w grafiku, ale bez wystawionych miejsc, nie jest pusty: brak danych obłożenia i konie z zerami", () => {
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05", { slots: [] })],
        horses: [
          { id: BELLA, name: "Bella" },
          { id: KASZTAN, name: "Kasztan" },
        ],
      }),
      NOW,
    );

    expect(stats.isEmpty).toBe(false);
    expect(stats.summary.occupancyPercent).toBeNull();
    expect(stats.horses.map((row) => [row.name, row.rides])).toEqual([
      ["Bella", 0],
      ["Kasztan", 0],
    ]);
  });

  it("okres z samym odwołaniem nie jest pusty", () => {
    const stats = computeStableStats(
      input({ days: [day("2026-11-05")], bookings: [booking("2026-11-05", 10, { status: "cancelled" })] }),
      NOW,
    );

    expect(stats.isEmpty).toBe(false);
  });

  it("okres sięgający w przyszłość pomija przyszłe zapisy", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-30" },
        days: [day("2026-11-09"), day("2026-11-20")],
        bookings: [booking("2026-11-09", 10), booking("2026-11-20", 10)],
      }),
      NOW,
    );

    expect(stats.summary.rides).toBe(1);
  });
});

describe("computeStableStats — tabela koni (obciążenie konia)", () => {
  const HORSES = [
    { id: BELLA, name: "Bella" },
    { id: KASZTAN, name: "Kasztan" },
  ];

  it("każdy koń ma swoją liczbę jazd i godziny jazd w okresie", () => {
    const stats = computeStableStats(
      input({
        horses: HORSES,
        days: [day("2026-11-05"), day("2026-11-06")],
        bookings: [
          booking("2026-11-05", 10),
          booking("2026-11-06", 10),
          booking("2026-11-06", 11, { status: "cancelled" }),
          booking("2026-11-05", 11, { horseId: KASZTAN }),
          booking("2026-11-06", 10, { horseId: KASZTAN }),
          booking("2026-11-06", 11, { horseId: KASZTAN }),
        ],
      }),
      NOW,
    );

    expect(stats.horses).toEqual([
      { horseId: KASZTAN, name: "Kasztan", rides: 3, rideHours: 3 },
      { horseId: BELLA, name: "Bella", rides: 2, rideHours: 2 },
    ]);
  });

  it("tabela jest posortowana od najbardziej obciążonego konia, remisy po nazwie", () => {
    const DUKAT = 3;
    const AMOR = 4;
    const stats = computeStableStats(
      input({
        horses: [...HORSES, { id: DUKAT, name: "Dukat" }, { id: AMOR, name: "Amor" }],
        days: [day("2026-11-05", { openHour: 10, closeHour: 13, horseIds: [BELLA, KASZTAN, DUKAT, AMOR] })],
        bookings: [
          booking("2026-11-05", 10, { horseId: KASZTAN }),
          booking("2026-11-05", 10, { horseId: DUKAT }),
          booking("2026-11-05", 11, { horseId: DUKAT }),
          booking("2026-11-05", 12, { horseId: DUKAT }),
          booking("2026-11-05", 10, { horseId: AMOR }),
        ],
      }),
      NOW,
    );

    expect(stats.horses.map((row) => [row.name, row.rideHours])).toEqual([
      ["Dukat", 3],
      ["Amor", 1],
      ["Kasztan", 1],
      ["Bella", 0],
    ]);
  });

  it("koń przydzielony do grafiku w okresie, ale bez żadnej jazdy, jest widoczny z zerem", () => {
    const stats = computeStableStats(
      input({
        horses: HORSES,
        days: [day("2026-11-05")],
        bookings: [booking("2026-11-05", 10), booking("2026-11-05", 11, { horseId: KASZTAN, status: "cancelled" })],
      }),
      NOW,
    );

    expect(stats.horses).toEqual([
      { horseId: BELLA, name: "Bella", rides: 1, rideHours: 1 },
      { horseId: KASZTAN, name: "Kasztan", rides: 0, rideHours: 0 },
    ]);
  });

  it("koń zdezaktywowany po okresie nadal jest widoczny w statystykach tego okresu", () => {
    // Lista stada w kształcie z `listStableHorses`: Bella jest już zdezaktywowana.
    const herd = [
      { id: BELLA, name: "Bella", notes: null, active: false },
      { id: KASZTAN, name: "Kasztan", notes: null, active: true },
    ];
    const stats = computeStableStats(
      input({
        horses: herd,
        days: [day("2026-11-05")],
        bookings: [booking("2026-11-05", 10), booking("2026-11-05", 11)],
      }),
      NOW,
    );

    expect(stats.horses[0]).toEqual({ horseId: BELLA, name: "Bella", rides: 2, rideHours: 2 });
  });

  it("koń stadniny nieprzydzielony w okresie do grafiku nie trafia do tabeli", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-05", to: "2026-11-05" },
        horses: HORSES,
        days: [day("2026-11-04"), day("2026-11-05", { horseIds: [BELLA] })],
        bookings: [booking("2026-11-04", 10, { horseId: KASZTAN }), booking("2026-11-05", 10)],
      }),
      NOW,
    );

    expect(stats.horses.map((row) => row.name)).toEqual(["Bella"]);
  });

  it("koń przydzielony tylko do godzin, które jeszcze nie minęły, nie jest pokazywany jako bezczynny", () => {
    // Dziś o 14:30: Bella ma za sobą dzień wczorajszy, Kasztan pracuje dopiero od 16 i jutro.
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-30" },
        horses: HORSES,
        days: [
          day("2026-11-09", { horseIds: [BELLA] }),
          day("2026-11-10", { openHour: 16, closeHour: 18, horseIds: [KASZTAN] }),
          day("2026-11-11", { horseIds: [KASZTAN] }),
        ],
        bookings: [booking("2026-11-10", 16, { horseId: KASZTAN })],
      }),
      NOW,
    );

    expect(stats.horses).toEqual([{ horseId: BELLA, name: "Bella", rides: 0, rideHours: 0 }]);
  });

  it("suma godzin jazd z tabeli zgadza się z podsumowaniem okresu", () => {
    const stats = computeStableStats(
      input({
        period: { from: "2026-11-01", to: "2026-11-30" },
        horses: HORSES,
        days: [day("2026-11-05"), day("2026-11-10", { openHour: 12, closeHour: 17 }), day("2026-11-20")],
        bookings: [
          booking("2026-11-05", 10),
          booking("2026-11-05", 11, { horseId: KASZTAN }),
          booking("2026-11-05", 10, { horseId: KASZTAN, status: "cancelled" }),
          booking("2026-11-10", 12),
          booking("2026-11-10", 13, { horseId: KASZTAN }),
          booking("2026-11-10", 14),
          booking("2026-11-20", 10),
        ],
      }),
      NOW,
    );

    expect(stats.summary.rideHours).toBe(4);
    expect(stats.horses.map((row) => row.rideHours)).toEqual([2, 2]);
    expect(stats.horses.map((row) => row.rides)).toEqual([2, 2]);
  });

  it("koń spoza listy stada zostaje w tabeli z nazwą zastępczą", () => {
    const stats = computeStableStats(
      input({ horses: [], days: [day("2026-11-05", { horseIds: [BELLA] })], bookings: [booking("2026-11-05", 10)] }),
      NOW,
    );

    expect(stats.horses).toEqual([{ horseId: BELLA, name: "(koń #1)", rides: 1, rideHours: 1 }]);
  });
});

describe("computeStableStats — odwołania jeźdźca i ośrodka", () => {
  const RIDERS = [
    { id: "rider-anna", name: "Anna Kowalska" },
    { id: "rider-piotr", name: "Piotr Nowak" },
  ];

  it("przy jeźdźcu liczą się tylko jego własne odwołania, w okresie — odwołania obu stron", () => {
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05"), day("2026-11-06")],
        riders: RIDERS,
        bookings: [
          booking("2026-11-05", 10, { status: "cancelled", cancelledBy: "rider", horseId: null }),
          booking("2026-11-05", 11, { status: "cancelled", cancelledBy: "stable", horseId: null }),
          booking("2026-11-06", 10, { status: "cancelled", cancelledBy: "stable", horseId: null }),
          booking("2026-11-06", 11),
        ],
      }),
      NOW,
    );

    expect(stats.summary.cancellations).toBe(3);
    expect(stats.riders.map((row) => [row.name, row.rides, row.cancellations])).toEqual([["Anna Kowalska", 1, 1]]);
  });

  it("jeździec odwołany wyłącznie przez ośrodek nie trafia do tabeli jeźdźców", () => {
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05")],
        riders: RIDERS,
        bookings: [
          booking("2026-11-05", 10),
          booking("2026-11-05", 11, {
            status: "cancelled",
            cancelledBy: "stable",
            horseId: null,
            riderId: "rider-piotr",
          }),
        ],
      }),
      NOW,
    );

    expect(stats.summary.cancellations).toBe(1);
    expect(stats.riders.map((row) => row.name)).toEqual(["Anna Kowalska"]);
  });

  it("odwołanie własne jeźdźca zanonimizowanego zostaje w wierszu zbiorczym", () => {
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05")],
        bookings: [
          booking("2026-11-05", 10, { status: "cancelled", cancelledBy: "rider", horseId: null, riderId: null }),
          booking("2026-11-05", 11, { status: "cancelled", cancelledBy: "stable", horseId: null, riderId: null }),
        ],
      }),
      NOW,
    );

    expect(stats.summary.cancellations).toBe(2);
    expect(stats.riders.map((row) => [row.name, row.cancellations])).toEqual([["Usunięci jeźdźcy", 1]]);
  });

  it("odwołany zapis, którego slot zniknął po zmianie grafiku, nadal jest odwołaniem", () => {
    // Dzień skrócony do 10–11 i instruktor wypisany: zapis o 11 nie ma już slotu.
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05", { openHour: 10, closeHour: 11, slots: [{ hour: 10, seats: 2 }] })],
        riders: RIDERS,
        bookings: [booking("2026-11-05", 11, { status: "cancelled", cancelledBy: "rider", horseId: null })],
      }),
      NOW,
    );

    expect(stats.summary.cancellations).toBe(1);
    expect(stats.riders.map((row) => [row.name, row.cancellations])).toEqual([["Anna Kowalska", 1]]);
  });
});

// #41: koń przy zapisie jest opcjonalny (ADR-0002) — statystyki muszą działać z jazdą bez konia.
describe("computeStableStats — zapis bez konia", () => {
  it("jazda bez konia liczy się w podsumowaniu i u jeźdźca, ale nie w tabeli koni", () => {
    const stats = computeStableStats(
      input({
        days: [day("2026-11-05")],
        bookings: [booking("2026-11-05", 10), booking("2026-11-05", 11, { horseId: null })],
        riders: [{ id: "rider-anna", name: "Anna Kowalska" }],
        horses: [
          { id: BELLA, name: "Bella" },
          { id: KASZTAN, name: "Kasztan" },
        ],
      }),
      NOW,
    );

    expect(stats.summary.rides).toBe(2);
    expect(stats.summary.rideHours).toBe(2);
    expect(stats.rideHoursOverTime.buckets.reduce((sum, bucket) => sum + bucket.rideHours, 0)).toBe(2);
    expect(stats.horses.map((row) => [row.name, row.rides])).toEqual([
      ["Bella", 1],
      ["Kasztan", 0],
    ]);
    expect(stats.riders).toEqual([
      {
        riderId: "rider-anna",
        name: "Anna Kowalska",
        rides: 2,
        rideHours: 2,
        cancellations: 0,
        horses: [{ horseId: BELLA, horseName: "Bella", rides: 1 }],
      },
    ]);
  });
});
