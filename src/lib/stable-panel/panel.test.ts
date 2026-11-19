import { describe, expect, it } from "vitest";
import { composeLastMonth, composeSideColumn, composeWeek, lastMonthPeriod } from "@/lib/stable-panel/panel";
import type { StatsBooking, StatsScheduleDay } from "@/lib/stats/stats";

// Piątek 20 listopada 2026 — „dziś” we wszystkich przypadkach.
const TODAY = "2026-11-20";

function scheduleDay(day: string, seats: number[], hours: [number, number] = [10, 16]): StatsScheduleDay {
  return {
    day,
    openHour: hours[0],
    closeHour: hours[1],
    horseIds: [1, 2],
    slots: seats.map((value, index) => ({ hour: hours[0] + index, seats: value })),
  };
}

function booking(day: string, overrides: Partial<StatsBooking> = {}): StatsBooking {
  return { day, hour: 10, horseId: 1, status: "active", riderId: "r1", cancelledBy: null, ...overrides };
}

describe("composeWeek", () => {
  it("pokazuje 7 dni od dziś: „Dziś”, „Jutro”, potem skrót dnia tygodnia, każdy z datą", () => {
    const week = composeWeek({ today: TODAY, days: [], bookings: [] });

    expect(week.days.map((day) => [day.day, day.label, day.date])).toEqual([
      ["2026-11-20", "Dziś", "20 lis"],
      ["2026-11-21", "Jutro", "21 lis"],
      ["2026-11-22", "niedz.", "22 lis"],
      ["2026-11-23", "pon.", "23 lis"],
      ["2026-11-24", "wt.", "24 lis"],
      ["2026-11-25", "śr.", "25 lis"],
      ["2026-11-26", "czw.", "26 lis"],
    ]);
    expect(week.days.map((day) => day.isToday)).toEqual([true, false, false, false, false, false, false]);
  });

  it("dzień z grafikiem prowadzi do Zapisów tego dnia i pokazuje godziny pracy, a dzień bez grafiku — do Grafiku", () => {
    const week = composeWeek({ today: TODAY, days: [scheduleDay("2026-11-21", [1, 1], [9, 17])], bookings: [] });
    const [today, tomorrow] = week.days;

    expect(tomorrow).toMatchObject({
      scheduled: true,
      hours: "9:00–17:00",
      href: "/osrodek/zapisy?dzien=2026-11-21",
    });
    expect(today).toMatchObject({ scheduled: false, hours: null, href: "/osrodek/grafik?dzien=2026-11-20" });
  });

  it("sumuje limity miejsc dnia, liczy tylko aktywne zapisy, obłożenie w procentach i zapisy bez konia", () => {
    const day = "2026-11-21";
    const week = composeWeek({
      today: TODAY,
      // Dwóch instruktorów o 10:00 (2 + 1) i jeden o 11:00 (3) — razem 6 miejsc.
      days: [{ ...scheduleDay(day, [2, 3]), slots: [...scheduleDay(day, [2, 3]).slots, { hour: 10, seats: 1 }] }],
      bookings: [
        booking(day),
        booking(day, { hour: 11, horseId: null }),
        booking(day, { hour: 11, horseId: null, riderId: null }),
        booking(day, { status: "cancelled", horseId: null, cancelledBy: "rider" }),
        booking("2026-11-22"),
      ],
    });

    expect(week.days[1]).toMatchObject({
      seats: 6,
      booked: 3,
      occupancyPercent: 50,
      withoutHorse: 2,
      countText: "3/6",
      countDescription: "3 zapisy na 6 miejsc",
      withoutHorseText: "2 bez konia",
    });
  });

  it("dzień ułożony z samymi limitami zero ma obłożenie 0% i nie dzieli przez zero", () => {
    const week = composeWeek({ today: TODAY, days: [scheduleDay(TODAY, [0, 0, 0])], bookings: [] });

    expect(week.days[0]).toMatchObject({
      scheduled: true,
      seats: 0,
      booked: 0,
      occupancyPercent: 0,
      countDescription: "0 zapisów na 0 miejsc",
      withoutHorseText: null,
    });
  });

  it("zaokrągla obłożenie do pełnych procent", () => {
    const week = composeWeek({
      today: TODAY,
      days: [scheduleDay(TODAY, [1, 1, 1])],
      bookings: [booking(TODAY), booking(TODAY, { hour: 11 })],
    });

    expect(week.days[0]?.occupancyPercent).toBe(67);
  });

  it("podsumowuje tydzień: zapisy na miejsca i liczbę dni bez grafiku", () => {
    const week = composeWeek({
      today: TODAY,
      days: [scheduleDay(TODAY, [2]), scheduleDay("2026-11-21", [1, 1, 1, 1, 1]), scheduleDay("2026-11-26", [0])],
      bookings: [booking(TODAY), booking("2026-11-21"), booking("2026-11-21", { hour: 11 })],
    });

    expect(week).toMatchObject({
      booked: 3,
      seats: 7,
      unscheduledDays: 4,
      summary: "3 zapisy na 7 miejsc",
      unscheduledText: "4 dni bez grafiku",
    });
  });

  it("odmienia podsumowanie: 1 zapis na 1 miejsce, 1 dzień bez grafiku", () => {
    const days = ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25"].map((day) =>
      scheduleDay(day, day === TODAY ? [1] : [0]),
    );
    const week = composeWeek({ today: TODAY, days, bookings: [booking(TODAY)] });

    expect(week.summary).toBe("1 zapis na 1 miejsce");
    expect(week.unscheduledText).toBe("1 dzień bez grafiku");
  });

  it("tydzień ułożony w całości nie ma dopisku o dniach bez grafiku", () => {
    const days = week7().map((day) => scheduleDay(day, [5]));
    const week = composeWeek({ today: TODAY, days, bookings: [] });

    expect(week.unscheduledDays).toBe(0);
    expect(week.unscheduledText).toBeNull();
    expect(week.summary).toBe("0 zapisów na 35 miejsc");
  });

  it("tydzień całkiem bez grafiku: 7 dni bez grafiku i bez podsumowania miejsc", () => {
    const week = composeWeek({ today: TODAY, days: [], bookings: [] });

    expect(week.days.every((day) => !day.scheduled)).toBe(true);
    expect(week.unscheduledDays).toBe(7);
    expect(week.unscheduledText).toBe("7 dni bez grafiku");
    expect(week.summary).toBeNull();
  });

  it("pomija dni grafiku i zapisy spoza tygodnia", () => {
    const week = composeWeek({
      today: TODAY,
      days: [scheduleDay("2026-11-19", [3]), scheduleDay("2026-11-27", [3])],
      bookings: [booking("2026-11-19"), booking("2026-11-27")],
    });

    expect(week.seats).toBe(0);
    expect(week.booked).toBe(0);
    expect(week.unscheduledDays).toBe(7);
  });
});

describe("composeSideColumn", () => {
  const week = composeWeek({
    today: TODAY,
    days: [scheduleDay(TODAY, [3])],
    bookings: [booking(TODAY), booking(TODAY, { hour: 11 }), booking(TODAY, { status: "cancelled" })],
  });
  const horses = [{ active: true }, { active: true }, { active: false }];
  const instructors = [
    { id: 1, active: true },
    { id: 2, active: true },
    { id: 3, active: true },
    { id: 4, active: false },
  ];
  // Konto ma też instruktor nieaktywny (4) — nie liczy się, bo nie jest aktywny.
  const accounts = [{ instructor_id: 1 }, { instructor_id: 3 }, { instructor_id: 4 }];

  it("prowadzi do pięciu sekcji ośrodka: Grafik na jutro, Zapisy na dziś, Konie, Instruktorzy, Statystyki", () => {
    const links = composeSideColumn({ today: TODAY, week, horses, instructors, accounts });

    expect(links.map((link) => [link.name, link.href])).toEqual([
      ["Grafik", "/osrodek/grafik?dzien=2026-11-21"],
      ["Zapisy", "/osrodek/zapisy?dzien=2026-11-20"],
      ["Konie", "/osrodek/konie"],
      ["Instruktorzy", "/osrodek/instruktorzy"],
      ["Statystyki", "/osrodek/statystyki"],
    ]);
  });

  it("przy każdym linku krótka informacja: jutro bez grafiku, aktywne zapisy dziś, aktywne konie, instruktorzy z kontem spośród aktywnych", () => {
    const links = composeSideColumn({ today: TODAY, week, horses, instructors, accounts });

    expect(links.map((link) => [link.fact, link.warn])).toEqual([
      ["jutro: brak grafiku", true],
      ["dziś: 2", false],
      ["2 aktywne", false],
      ["2 z 3 z kontem", false],
      ["dowolny okres", false],
    ]);
  });

  it("jutro z grafikiem to „jutro: ułożony” bez ostrzeżenia", () => {
    const scheduledTomorrow = composeWeek({ today: TODAY, days: [scheduleDay("2026-11-21", [1])], bookings: [] });
    const [schedule] = composeSideColumn({ today: TODAY, week: scheduledTomorrow, horses, instructors, accounts });

    expect(schedule).toMatchObject({ fact: "jutro: ułożony", warn: false });
  });

  it("odmienia liczbę aktywnych koni", () => {
    const factFor = (count: number) =>
      composeSideColumn({
        today: TODAY,
        week,
        horses: Array.from({ length: count }, () => ({ active: true })),
        instructors,
        accounts,
      })[2]?.fact;

    expect([factFor(1), factFor(4), factFor(5), factFor(12), factFor(22)]).toEqual([
      "1 aktywny",
      "4 aktywne",
      "5 aktywnych",
      "12 aktywnych",
      "22 aktywne",
    ]);
  });

  it("część, której nie udało się wczytać, zostawia link bez informacji", () => {
    const links = composeSideColumn({ today: TODAY, week: null, horses: null, instructors, accounts: null });

    expect(links.map((link) => link.fact)).toEqual([null, null, null, null, "dowolny okres"]);
    expect(links.map((link) => link.href)).toEqual([
      "/osrodek/grafik?dzien=2026-11-21",
      "/osrodek/zapisy?dzien=2026-11-20",
      "/osrodek/konie",
      "/osrodek/instruktorzy",
      "/osrodek/statystyki",
    ]);
  });
});

describe("composeLastMonth", () => {
  // Południe w Warszawie (UTC+1 w listopadzie): wszystkie dni przed dziś są w całości miniony.
  const NOW = new Date("2026-11-20T11:00:00Z");
  const horses = [
    { id: 1, name: "Bella" },
    { id: 2, name: "Kasztan" },
  ];
  const input = (days: StatsScheduleDay[], bookings: StatsBooking[]) => ({
    today: TODAY,
    days,
    bookings,
    riders: [],
    horses,
  });

  it("obejmuje ostatnie 30 dni: od dziś-29 do dziś", () => {
    expect(lastMonthPeriod(TODAY)).toEqual({ from: "2026-10-22", to: "2026-11-20" });
  });

  it("kafelki: godziny jazd z liczbą jazd, obłożenie grafiku, odwołania, najbardziej obciążony koń z godzinami", () => {
    const day = "2026-11-10";
    const view = composeLastMonth(
      input(
        [scheduleDay(day, [2, 2])],
        [
          booking(day, { horseId: 1 }),
          booking(day, { horseId: 1, hour: 11 }),
          booking(day, { horseId: 2, hour: 11, riderId: "r2" }),
          booking(day, { status: "cancelled", horseId: null, cancelledBy: "stable", riderId: "r3" }),
          // Dzień przed okresem nie liczy się do niczego.
          booking("2026-10-21", { horseId: 2 }),
        ],
      ),
      NOW,
    );

    expect(view.isEmpty).toBe(false);
    expect(view.tiles.map((tile) => [tile.label, tile.value, tile.note])).toEqual([
      ["Godziny jazd", "3 h", "3 jazdy"],
      ["Obłożenie grafiku", "75%", "miejsc, na których była jazda"],
      ["Odwołania", "1", "jeźdźców i ośrodka"],
      ["Najbardziej obciążony koń", "Bella", "2 h"],
    ]);
  });

  it("gdy żaden koń nie ma godzin jazd, najbardziej obciążony koń to „—” — konie dnia stały, a jazda była bez konia", () => {
    const day = "2026-11-10";
    const view = composeLastMonth(input([scheduleDay(day, [1])], [booking(day, { horseId: null })]), NOW);

    expect(view.tiles[3]).toMatchObject({ value: "—", note: "brak jazd z koniem" });
    expect(view.tiles[0]).toMatchObject({ value: "1 h", note: "1 jazda" });
  });

  it("bez wystawionych miejsc w minionych slotach obłożenie to „—”, a okres z odwołaniem nie jest pusty", () => {
    // Odwołanie zapisu, którego slot zniknął z grafiku: jest w okresie, ale miejsc nie ma.
    const view = composeLastMonth(
      input([], [booking("2026-11-10", { status: "cancelled", horseId: null, cancelledBy: "rider" })]),
      NOW,
    );

    expect(view.isEmpty).toBe(false);
    expect(view.tiles[1]).toMatchObject({ value: "—" });
    expect(view.tiles[2]).toMatchObject({ value: "1" });
  });

  it("wykres godzin jazd dzień po dniu: 30 słupków od dziś-29, z etykietą dnia i godzinami", () => {
    const view = composeLastMonth(
      input([scheduleDay("2026-11-10", [2, 2])], [booking("2026-11-10"), booking("2026-11-10", { hour: 11 })]),
      NOW,
    );
    const { bars } = view.chart;

    expect(view.chart).toMatchObject({ title: "Godziny jazd dzień po dniu", labelHeader: "Dzień" });
    expect(bars).toHaveLength(30);
    expect(bars[0]).toEqual({ label: "22.10", longLabel: "22 października 2026", value: 0, valueText: "0 h" });
    expect(bars.find((bar) => bar.label === "10.11")).toMatchObject({ value: 2, valueText: "2 h" });
    expect(bars[29]?.label).toBe("20.11");
  });

  it("„Pełne statystyki” otwierają Statystyki z tym samym okresem", () => {
    expect(composeLastMonth(input([], []), NOW).statsHref).toBe("/osrodek/statystyki?od=2026-10-22&do=2026-11-20");
  });

  it("okres bez jazd i miejsc jest pusty — także gdy grafik był dzień przed okresem albo dopiero dziś później", () => {
    expect(composeLastMonth(input([], []), NOW).isEmpty).toBe(true);
    // Dziś 12:00 — slot o 15:00 jeszcze nie minął; dziś-30 leży przed okresem.
    const view = composeLastMonth(
      input(
        [scheduleDay("2026-10-21", [2]), { ...scheduleDay(TODAY, [2]), openHour: 15, slots: [{ hour: 15, seats: 2 }] }],
        [],
      ),
      NOW,
    );
    expect(view.isEmpty).toBe(true);
  });
});

function week7(): string[] {
  return ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"];
}
