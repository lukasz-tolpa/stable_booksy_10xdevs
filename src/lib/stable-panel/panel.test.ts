import { describe, expect, it } from "vitest";
import {
  composeLastMonth,
  composeMonthSummaryLink,
  composeSettlementsLink,
  composeBoardersLink,
  composeSideColumn,
  composeWeek,
  historyPeriod,
  lastMonthPeriod,
} from "@/lib/stable-panel/panel";
import { resolveSummaryMonth } from "@/lib/month-summary/month";
import type { RateChange } from "@/lib/settlements/rates";
import { composeSettlementList, type SettlementBooking } from "@/lib/settlements/settlements";
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
  return {
    day,
    hour: 10,
    instructorId: 1,
    horseId: 1,
    status: "active",
    riderId: "r1",
    cancelledBy: null,
    ...overrides,
  };
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

  it("sumuje limity miejsc dnia, liczy tylko aktywne zapisy, zapisy na miejsca w procentach z paskiem i zapisy bez konia", () => {
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
      bookedPercent: 50,
      bookedPercentText: "zajęte w 50%",
      barPercent: 50,
      withoutHorse: 2,
      countText: "3/6",
      countDescription: "3 zapisy na 6 miejsc",
      withoutHorseText: "2 bez konia",
    });
  });

  it("dzień ułożony z samymi limitami zero ma 0% zajętych miejsc i nie dzieli przez zero", () => {
    const week = composeWeek({ today: TODAY, days: [scheduleDay(TODAY, [0, 0, 0])], bookings: [] });

    expect(week.days[0]).toMatchObject({
      scheduled: true,
      seats: 0,
      booked: 0,
      bookedPercent: 0,
      bookedPercentText: "zajęte w 0%",
      barPercent: 0,
      countDescription: "0 zapisów na 0 miejsc",
      withoutHorseText: null,
    });
  });

  it("zaokrągla procent zajętych miejsc do pełnych procent", () => {
    const week = composeWeek({
      today: TODAY,
      days: [scheduleDay(TODAY, [1, 1, 1])],
      bookings: [booking(TODAY), booking(TODAY, { hour: 11 })],
    });

    expect(week.days[0]).toMatchObject({ bookedPercent: 67, bookedPercentText: "zajęte w 67%" });
  });

  it("dzień z większą liczbą zapisów niż miejsc (limit obniżony po zapisach) podaje prawdziwy procent, a pasek kończy na 100%", () => {
    const week = composeWeek({
      today: TODAY,
      days: [scheduleDay(TODAY, [1, 1])],
      bookings: [booking(TODAY), booking(TODAY, { riderId: "r2" }), booking(TODAY, { hour: 11 })],
    });

    expect(week.days[0]).toMatchObject({ bookedPercent: 150, bookedPercentText: "zajęte w 150%", barPercent: 100 });
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

  it("tydzień całkiem bez grafiku: obie połowy podsumowania — 0 zapisów na 0 miejsc i 7 dni bez grafiku", () => {
    const week = composeWeek({ today: TODAY, days: [], bookings: [] });

    expect(week.days.every((day) => !day.scheduled)).toBe(true);
    expect(week.unscheduledDays).toBe(7);
    expect(week.unscheduledText).toBe("7 dni bez grafiku");
    expect(week.summary).toBe("0 zapisów na 0 miejsc");
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
  // Dziś 14:30 w Warszawie — godzina 13 już się skończyła, 14 trwa.
  const NOW = new Date("2026-11-20T13:30:00Z");
  const week = composeWeek({
    today: TODAY,
    days: [scheduleDay(TODAY, [3])],
    bookings: [booking(TODAY), booking(TODAY, { hour: 11 }), booking(TODAY, { status: "cancelled" })],
  });
  // Konie ośrodka: dwa aktywne, jeden wycofany; koń pensjonatowy nie liczy się do „Konie” (#114).
  const horses = [
    { active: true, kind: "stable" },
    { active: true, kind: "stable" },
    { active: false, kind: "stable" },
    { active: true, kind: "boarding" },
  ];
  const instructors = [
    { id: 1, active: true },
    { id: 2, active: true },
    { id: 3, active: true },
    { id: 4, active: false },
  ];
  // Konto ma też instruktor nieaktywny (4) — nie liczy się, bo nie jest aktywny.
  const accounts = [{ instructor_id: 1 }, { instructor_id: 3 }, { instructor_id: 4 }];
  const places = [{ active: true }, { active: false }];

  it("prowadzi do sekcji ośrodka: Grafik na jutro, Zapisy na dziś, Konie, Pensjonariusze, Place, Instruktorzy, Podsumowanie miesiąca, Rozliczenia, Statystyki", () => {
    const links = composeSideColumn(
      { today: TODAY, week, horses, instructors, accounts, places, monthBookings: [], settlementsTotal: null },
      NOW,
    );

    expect(links.map((link) => [link.name, link.href])).toEqual([
      ["Grafik", "/osrodek/grafik?dzien=2026-11-21"],
      ["Zapisy", "/osrodek/zapisy?dzien=2026-11-20"],
      ["Konie", "/osrodek/konie"],
      ["Pensjonariusze", "/osrodek/pensjonariusze"],
      ["Place", "/osrodek/place"],
      ["Instruktorzy", "/osrodek/instruktorzy"],
      ["Podsumowanie miesiąca", "/osrodek/podsumowanie"],
      ["Rozliczenia", "/osrodek/rozliczenia"],
      ["Statystyki", "/osrodek/statystyki"],
    ]);
  });

  it("przy każdym linku krótka informacja: jutro bez grafiku, aktywne zapisy dziś, aktywne konie ośrodka, konie pensjonatowe, aktywne place, instruktorzy z kontem spośród aktywnych", () => {
    const links = composeSideColumn(
      { today: TODAY, week, horses, instructors, accounts, places, monthBookings: [], settlementsTotal: null },
      NOW,
    );

    expect(links.map((link) => [link.fact, link.warn])).toEqual([
      ["jutro: brak grafiku", true],
      ["dziś: 2", false],
      ["2 aktywne", false],
      ["1 koń pensjonatowy", false],
      ["1 aktywny", false],
      ["2 z 3 z kontem", false],
      ["listopad: 0 jazd", false],
      [null, false],
      ["dowolny okres", false],
    ]);
  });

  it("Podsumowanie miesiąca podaje jazdy bieżącego miesiąca do teraz — bez odwołań, nadchodzących i poprzedniego miesiąca", () => {
    const links = composeSideColumn(
      {
        today: TODAY,
        week,
        horses,
        instructors,
        accounts,
        places,
        monthBookings: [
          booking("2026-10-31"),
          booking("2026-11-02"),
          booking("2026-11-19", { hour: 15 }),
          booking(TODAY, { hour: 13 }),
          booking(TODAY, { hour: 14 }),
          booking("2026-11-21"),
          booking("2026-11-05", { status: "cancelled", horseId: null, cancelledBy: "rider" }),
        ],
        settlementsTotal: null,
      },
      NOW,
    );

    expect(links.find((link) => link.name === "Podsumowanie miesiąca")?.fact).toBe("listopad: 3 jazdy");
  });

  it("jutro z grafikiem to „jutro: ułożony” bez ostrzeżenia", () => {
    const scheduledTomorrow = composeWeek({ today: TODAY, days: [scheduleDay("2026-11-21", [1])], bookings: [] });
    const [schedule] = composeSideColumn(
      {
        today: TODAY,
        week: scheduledTomorrow,
        horses,
        instructors,
        accounts,
        places,
        monthBookings: [],
        settlementsTotal: null,
      },
      NOW,
    );

    expect(schedule).toMatchObject({ fact: "jutro: ułożony", warn: false });
  });

  it("odmienia liczbę aktywnych koni", () => {
    const factFor = (count: number) =>
      composeSideColumn({
        today: TODAY,
        week,
        horses: Array.from({ length: count }, () => ({ active: true, kind: "stable" })),
        instructors,
        accounts,
        places,
        monthBookings: [],
        settlementsTotal: null,
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
    const links = composeSideColumn(
      {
        today: TODAY,
        week: null,
        horses: null,
        instructors,
        accounts: null,
        places: null,
        monthBookings: null,
        settlementsTotal: null,
      },
      NOW,
    );

    expect(links.map((link) => link.fact)).toEqual([null, null, null, null, null, null, null, null, "dowolny okres"]);
    expect(links.map((link) => link.href)).toEqual([
      "/osrodek/grafik?dzien=2026-11-21",
      "/osrodek/zapisy?dzien=2026-11-20",
      "/osrodek/konie",
      "/osrodek/pensjonariusze",
      "/osrodek/place",
      "/osrodek/instruktorzy",
      "/osrodek/podsumowanie",
      "/osrodek/rozliczenia",
      "/osrodek/statystyki",
    ]);
  });
});

describe("composeMonthSummaryLink — wejście do Podsumowania miesiąca w głównej kolumnie (telefon)", () => {
  const NOW = new Date("2026-11-20T13:30:00Z");

  it("prowadzi do Podsumowania miesiąca z liczbą jazd bieżącego miesiąca do teraz", () => {
    const link = composeMonthSummaryLink(
      {
        today: TODAY,
        monthBookings: [
          booking("2026-10-31"),
          booking("2026-11-02"),
          booking(TODAY, { hour: 13 }),
          booking(TODAY, { hour: 14 }),
          booking("2026-11-05", { status: "cancelled", horseId: null, cancelledBy: "rider" }),
        ],
      },
      NOW,
    );

    expect(link).toEqual({
      name: "Podsumowanie miesiąca",
      href: "/osrodek/podsumowanie",
      fact: "listopad: 2 jazdy",
      warn: false,
    });
  });

  it("bez wczytanych zapisów link zostaje, bez liczby jazd", () => {
    expect(composeMonthSummaryLink({ today: TODAY, monthBookings: null }, NOW)).toMatchObject({
      href: "/osrodek/podsumowanie",
      fact: null,
    });
  });
});

describe("composeSettlementsLink — Rozliczenia w bocznej kolumnie i w głównej kolumnie (telefon)", () => {
  const NOW = new Date("2026-11-20T13:30:00Z");
  const NOVEMBER = resolveSummaryMonth(null, TODAY);
  const ride = (day: string, riderKey: string, hour = 10): SettlementBooking => ({
    day,
    hour,
    status: "active",
    riderKey,
    riderName: riderKey,
  });
  const novemberRides = [
    ride("2026-11-02", "anna"),
    ride("2026-11-09", "anna"),
    ride("2026-11-03", "piotr"),
    // Poprzedni miesiąc i nadchodząca jazda nie wchodzą do sumy bieżącego miesiąca.
    ride("2026-10-30", "anna"),
    ride("2026-11-21", "piotr"),
  ];
  const RATE_120: RateChange = { id: 1, riderKey: null, fromMonth: "2026-11", amount: 12000 };

  // Oracle: AC #98 — informacja to suma bieżącego miesiąca z listy rozliczeń (ta sama co na stronie
  // „Rozliczenia”), np. „listopad: 360,00 zł”; bez stawki — „Ustaw stawkę”; awaria — link bez informacji.
  it("podaje sumę bieżącego miesiąca z listy rozliczeń, np. „listopad: 360,00 zł”", () => {
    const settlementsTotal = composeSettlementList(
      { month: NOVEMBER, bookings: novemberRides, rates: [RATE_120], costs: [] },
      NOW,
    );

    expect(composeSettlementsLink({ today: TODAY, settlementsTotal })).toEqual({
      name: "Rozliczenia",
      href: "/osrodek/rozliczenia",
      fact: "listopad: 360,00 zł",
      warn: false,
    });
  });

  it("suma pochodzi z listy rozliczeń, nie z własnego liczenia — także suma zero przy stawce bez jazd", () => {
    expect(
      composeSettlementsLink({ today: TODAY, settlementsTotal: { total: 1_234_000, needsRate: false } }).fact,
    ).toBe("listopad: 12 340,00 zł");
    expect(composeSettlementsLink({ today: TODAY, settlementsTotal: { total: 0, needsRate: false } }).fact).toBe(
      "listopad: 0,00 zł",
    );
  });

  it("ośrodek bez stawki: zamiast sumy prośba „Ustaw stawkę”, wyróżniona jak jutro bez grafiku", () => {
    const settlementsTotal = composeSettlementList(
      { month: NOVEMBER, bookings: novemberRides, rates: [], costs: [] },
      NOW,
    );

    expect(composeSettlementsLink({ today: TODAY, settlementsTotal })).toMatchObject({
      href: "/osrodek/rozliczenia",
      fact: "Ustaw stawkę",
      warn: true,
    });
  });

  it("bez wczytanej listy rozliczeń link zostaje, bez informacji", () => {
    expect(composeSettlementsLink({ today: TODAY, settlementsTotal: null })).toEqual({
      name: "Rozliczenia",
      href: "/osrodek/rozliczenia",
      fact: null,
      warn: false,
    });
  });

  it("w bocznej kolumnie stoi po Podsumowaniu miesiąca, z tą samą informacją", () => {
    const settlementsTotal = { total: 48000, needsRate: false };
    const links = composeSideColumn(
      {
        today: TODAY,
        week: null,
        horses: null,
        instructors: null,
        accounts: null,
        places: null,
        monthBookings: null,
        settlementsTotal,
      },
      NOW,
    );

    expect(links[7]).toEqual(composeSettlementsLink({ today: TODAY, settlementsTotal }));
    expect(links[7]?.fact).toBe("listopad: 480,00 zł");
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

describe("historyPeriod", () => {
  it("jednym odczytem obejmuje ostatnie 30 dni i bieżący miesiąc", () => {
    expect(historyPeriod(TODAY)).toEqual({ from: "2026-10-22", to: TODAY });
    // 31. dnia miesiąc zaczyna się wcześniej niż 30 dni temu.
    expect(historyPeriod("2026-12-31")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("composeBoardersLink — Pensjonariusze w bocznej kolumnie i w głównej kolumnie (telefon)", () => {
  // Oracle: AC #114 — nawigacja „Pensjonariusze” u właściciela; liczba to konie pensjonatowe ośrodka.
  it.each([
    [[], "0 koni pensjonatowych"],
    [[{ active: true, kind: "boarding" }], "1 koń pensjonatowy"],
    [
      [
        { active: true, kind: "boarding" },
        { active: false, kind: "boarding" },
        { active: true, kind: "stable" },
      ],
      "2 konie pensjonatowe",
    ],
  ])("konie %j — %s", (horses, fact) => {
    expect(composeBoardersLink({ horses })).toEqual({
      name: "Pensjonariusze",
      href: "/osrodek/pensjonariusze",
      fact,
      warn: false,
    });
  });

  it("bez wczytanych koni link zostaje bez informacji", () => {
    expect(composeBoardersLink({ horses: null }).fact).toBeNull();
  });
});
