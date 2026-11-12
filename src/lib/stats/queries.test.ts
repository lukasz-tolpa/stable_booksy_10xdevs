import { describe, expect, it } from "vitest";
import { collectStatsRows, type RawStatsBooking, type RawStatsDay, type StatsPageLoader } from "@/lib/stats/queries";

// Stub strukturalny (test-plan §6.4): błędu zapytania w połowie stronicowania nie da się
// wywołać na prawdziwym stacku, więc loader stron jest funkcją zwracającą zadane
// `{ data, error }`. Bez mockowania modułów.

function rawDay(day: string, horseIds: number[] = [], bookings: RawStatsBooking[] = []): RawStatsDay {
  return {
    day,
    open_hour: 10,
    close_hour: 12,
    schedule_day_horses: horseIds.map((horse_id) => ({ horse_id })),
    bookings,
  };
}

function rawBooking(overrides: Partial<RawStatsBooking>): RawStatsBooking {
  return {
    hour: 10,
    status: "active",
    horse_id: 1,
    rider_id: "rider-anna",
    profiles: { full_name: "Anna Kowalska" },
    ...overrides,
  };
}

/** Loader oddający kolejne zadane odpowiedzi i zapisujący, o jakie zakresy go proszono. */
function stubLoader(
  responses: { data: RawStatsDay[] | null; error: unknown }[],
  calls: [number, number][] = [],
): StatsPageLoader {
  let index = 0;
  return (from, to) => {
    calls.push([from, to]);
    return Promise.resolve(responses[index++]);
  };
}

describe("collectStatsRows", () => {
  it("rozkłada dni grafiku na przydziały koni i zapisy z terminem", async () => {
    const loader = stubLoader([
      {
        data: [
          rawDay(
            "2026-11-05",
            [1, 2],
            [
              rawBooking({}),
              rawBooking({
                status: "cancelled",
                horse_id: null,
                rider_id: "rider-piotr",
                profiles: { full_name: "Piotr Nowak" },
              }),
            ],
          ),
        ],
        error: null,
      },
    ]);

    await expect(collectStatsRows(loader)).resolves.toEqual({
      days: [{ day: "2026-11-05", openHour: 10, closeHour: 12, horseIds: [1, 2] }],
      bookings: [
        { day: "2026-11-05", horseId: 1, hour: 10, status: "active", riderId: "rider-anna" },
        { day: "2026-11-05", horseId: null, hour: 10, status: "cancelled", riderId: "rider-piotr" },
      ],
      riders: [
        { id: "rider-anna", name: "Anna Kowalska" },
        { id: "rider-piotr", name: "Piotr Nowak" },
      ],
    });
  });

  // #41: koń przy zapisie jest opcjonalny (ADR-0002).
  it("zapis bez przydzielonego konia przechodzi z koniem null", async () => {
    const loader = stubLoader([{ data: [rawDay("2026-11-05", [1], [rawBooking({ horse_id: null })])], error: null }]);

    const rows = await collectStatsRows(loader);

    expect(rows.bookings).toEqual([
      { day: "2026-11-05", horseId: null, hour: 10, status: "active", riderId: "rider-anna" },
    ]);
  });

  it("jeździec powtarzający się w wielu dniach i na wielu stronach występuje raz", async () => {
    const loader = stubLoader([
      {
        data: [
          rawDay("2026-11-01", [1], [rawBooking({ hour: 10 })]),
          rawDay("2026-11-02", [1], [rawBooking({ hour: 11 })]),
        ],
        error: null,
      },
      { data: [rawDay("2026-11-03", [1], [rawBooking({ hour: 10 })])], error: null },
    ]);

    const rows = await collectStatsRows(loader, 2);

    expect(rows.bookings).toHaveLength(3);
    expect(rows.riders).toEqual([{ id: "rider-anna", name: "Anna Kowalska" }]);
  });

  it("profil ukryty przez RLS albo bez nazwy daje jeźdźca bez nazwy, nie błąd", async () => {
    const loader = stubLoader([
      {
        data: [
          rawDay(
            "2026-11-05",
            [1],
            [
              rawBooking({ hour: 10, rider_id: "rider-ukryty", profiles: null }),
              rawBooking({ hour: 11, rider_id: "rider-bez-nazwy", profiles: { full_name: null } }),
            ],
          ),
        ],
        error: null,
      },
    ]);

    const rows = await collectStatsRows(loader);

    expect(rows.riders).toEqual([
      { id: "rider-ukryty", name: null },
      { id: "rider-bez-nazwy", name: null },
    ]);
  });

  it("zapis bez jeźdźca zostaje w zapisach, ale nie dokłada nikogo do listy jeźdźców", async () => {
    const loader = stubLoader([
      {
        data: [
          rawDay(
            "2026-11-05",
            [1],
            [
              rawBooking({ hour: 10, rider_id: null, profiles: null }),
              rawBooking({ hour: 11, status: "cancelled", horse_id: null, rider_id: null, profiles: null }),
              rawBooking({ hour: 12 }),
            ],
          ),
        ],
        error: null,
      },
    ]);

    const rows = await collectStatsRows(loader);

    expect(rows.bookings).toEqual([
      { day: "2026-11-05", horseId: 1, hour: 10, status: "active", riderId: null },
      { day: "2026-11-05", horseId: null, hour: 11, status: "cancelled", riderId: null },
      { day: "2026-11-05", horseId: 1, hour: 12, status: "active", riderId: "rider-anna" },
    ]);
    expect(rows.riders).toEqual([{ id: "rider-anna", name: "Anna Kowalska" }]);
  });

  it("zapis o nieznanym statusie leci wyjątkiem, zamiast po cichu trafić do statystyk", async () => {
    const loader = stubLoader([
      { data: [rawDay("2026-11-05", [1], [rawBooking({ status: "pending", profiles: null })])], error: null },
    ]);

    await expect(collectStatsRows(loader)).rejects.toThrow("pending");
  });

  it("brak dni grafiku to puste wiersze, nie błąd", async () => {
    await expect(collectStatsRows(stubLoader([{ data: [], error: null }]))).resolves.toEqual({
      days: [],
      bookings: [],
      riders: [],
    });
  });

  it("pełna strona pociąga kolejną, aż do niepełnej", async () => {
    const calls: [number, number][] = [];
    const loader = stubLoader(
      [
        { data: [rawDay("2026-11-01"), rawDay("2026-11-02")], error: null },
        { data: [rawDay("2026-11-03")], error: null },
      ],
      calls,
    );

    const rows = await collectStatsRows(loader, 2);

    expect(rows.days.map((day) => day.day)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(calls).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });

  it("błąd zapytania leci wyjątkiem", async () => {
    const error = { code: "PGRST000", message: "connection refused" };

    await expect(collectStatsRows(stubLoader([{ data: null, error }]))).rejects.toBe(error);
  });

  it("błąd na kolejnej stronie też leci wyjątkiem — bez częściowych statystyk", async () => {
    const error = { code: "57014", message: "canceling statement due to statement timeout" };
    const loader = stubLoader([
      { data: [rawDay("2026-11-01"), rawDay("2026-11-02")], error: null },
      { data: null, error },
    ]);

    await expect(collectStatsRows(loader, 2)).rejects.toBe(error);
  });
});
