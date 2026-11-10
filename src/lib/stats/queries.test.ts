import { describe, expect, it } from "vitest";
import { collectStatsRows, type RawStatsDay, type StatsPageLoader } from "@/lib/stats/queries";

// Stub strukturalny (test-plan §6.4): błędu zapytania w połowie stronicowania nie da się
// wywołać na prawdziwym stacku, więc loader stron jest funkcją zwracającą zadane
// `{ data, error }`. Bez mockowania modułów.

function rawDay(day: string, horses: RawStatsDay["schedule_day_horses"] = []): RawStatsDay {
  return { day, open_hour: 10, close_hour: 12, schedule_day_horses: horses };
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
          rawDay("2026-11-05", [
            {
              horse_id: 1,
              bookings: [
                { hour: 10, status: "active" },
                { hour: 10, status: "cancelled" },
              ],
            },
            { horse_id: 2, bookings: [] },
          ]),
        ],
        error: null,
      },
    ]);

    await expect(collectStatsRows(loader)).resolves.toEqual({
      days: [{ day: "2026-11-05", openHour: 10, closeHour: 12, horseIds: [1, 2] }],
      bookings: [
        { day: "2026-11-05", horseId: 1, hour: 10, status: "active" },
        { day: "2026-11-05", horseId: 1, hour: 10, status: "cancelled" },
      ],
    });
  });

  it("brak dni grafiku to puste wiersze, nie błąd", async () => {
    await expect(collectStatsRows(stubLoader([{ data: [], error: null }]))).resolves.toEqual({
      days: [],
      bookings: [],
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
