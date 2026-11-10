import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { StatsBooking, StatsPeriod, StatsScheduleDay } from "@/lib/stats/stats";

type Client = SupabaseClient<Database>;

/** Wiersze danych ośrodka, z których `computeStableStats` liczy statystyki. */
export interface StatsRows {
  days: StatsScheduleDay[];
  bookings: StatsBooking[];
}

/** Dzień grafiku w kształcie zwracanym przez PostgREST: przydziały koni z zapisami. */
export interface RawStatsDay {
  day: string;
  open_hour: number;
  close_hour: number;
  schedule_day_horses: { horse_id: number; bookings: { hour: number; status: string }[] }[];
}

/** Jedna strona dni grafiku: wiersze `from…to` włącznie, jak w `range()` PostgREST. */
export type StatsPageLoader = (from: number, to: number) => PromiseLike<{ data: RawStatsDay[] | null; error: unknown }>;

/** Limit wierszy odpowiedzi PostgREST (`max_rows` w `supabase/config.toml`). */
const PAGE_SIZE = 1000;

/**
 * Składa wiersze statystyk ze stron dni grafiku. Wynik KAŻDEJ strony jest sprawdzany:
 * błąd leci wyjątkiem (strona loguje go i pokazuje stan awarii), nigdy nie kończy
 * się statystykami policzonymi z części danych.
 *
 * Stronicowanie jest konieczne, bo okres nie ma limitu długości, a PostgREST ucina
 * odpowiedź po cichu na `max_rows` — bez niego okres dłuższy niż 1000 dni grafiku
 * dawałby zaniżone liczby bez żadnego błędu.
 */
export async function collectStatsRows(loadPage: StatsPageLoader, pageSize: number = PAGE_SIZE): Promise<StatsRows> {
  const rows: StatsRows = { days: [], bookings: [] };

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await loadPage(offset, offset + pageSize - 1);

    if (error) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- błąd dostawcy leci dalej bez zmian, jak w pozostałych zapytaniach
      throw error;
    }

    const page = data ?? [];
    for (const day of page) {
      rows.days.push({
        day: day.day,
        openHour: day.open_hour,
        closeHour: day.close_hour,
        horseIds: day.schedule_day_horses.map((entry) => entry.horse_id),
      });
      for (const entry of day.schedule_day_horses) {
        for (const booking of entry.bookings) {
          rows.bookings.push({ day: day.day, horseId: entry.horse_id, hour: booking.hour, status: booking.status });
        }
      }
    }

    if (page.length < pageSize) {
      return rows;
    }
  }
}

/**
 * Dni grafiku stadniny z okresu wraz z przydziałami koni i WSZYSTKIMI zapisami —
 * także odwołanymi (lista dnia czyta tylko aktywne; statystyki liczą odwołania).
 *
 * Jedno zapytanie na stronę: zapisy dociąga embedded select przez złożony FK
 * `bookings → schedule_day_horses`, więc termin zapisu (dzień) przychodzi z wiersza
 * nadrzędnego i nie trzeba przekazywać listy identyfikatorów dni w adresie.
 *
 * Filtr po `stable_id` jest jawny (lekcja S-04), choć RLS i tak pokazuje ośrodkowi
 * tylko własne zapisy. Wołać wyłącznie z sesji ośrodka dla jego własnej stadniny —
 * sesja jeźdźca zobaczyłaby przez RLS tylko własne zapisy i po cichu zaniżyła liczby.
 */
export function getStatsRows(client: Client, stableId: number, period: StatsPeriod): Promise<StatsRows> {
  return collectStatsRows((from, to) =>
    client
      .from("schedule_days")
      .select("day, open_hour, close_hour, schedule_day_horses(horse_id, bookings(hour, status))")
      .eq("stable_id", stableId)
      .gte("day", period.from)
      .lte("day", period.to)
      .order("day")
      .range(from, to),
  );
}
