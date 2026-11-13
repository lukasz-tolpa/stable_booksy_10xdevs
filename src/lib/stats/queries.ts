import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { toBookingStatus, toCancelledBy } from "@/lib/bookings/status";
import type { StatsRider } from "@/lib/stats/riders";
import type { StatsBooking, StatsPeriod, StatsScheduleDay } from "@/lib/stats/stats";

type Client = SupabaseClient<Database>;

/** Wiersze danych ośrodka, z których `computeStableStats` liczy statystyki. */
export interface StatsRows {
  days: StatsScheduleDay[];
  bookings: StatsBooking[];
  /** Jeźdźcy z zapisów okresu, każde konto raz. */
  riders: StatsRider[];
}

/** Zapis w kształcie PostgREST: przydzielony koń, konto jeźdźca i jego profil (nazwa) przez FK `rider_id`. */
export interface RawStatsBooking {
  hour: number;
  /** `null` — zapis bez przydzielonego konia (ADR-0002). */
  horse_id: number | null;
  /** Kolumna `text` z check constraint — zawężana do `BookingStatus` w `toBookingStatus`. */
  status: string;
  /** `null` — zapis bez jeźdźca: konto usunięto, zapis został w historii ośrodka (ADR-0001). */
  rider_id: string | null;
  /** Kto odwołał: `'rider'` albo `'stable'`; `null` dla zapisu aktywnego. Zawężane w `toCancelledBy`. */
  cancelled_by: string | null;
  /** `null`, gdy zapis nie ma jeźdźca albo RLS ukryje profil. */
  profiles: { full_name: string | null } | null;
}

/**
 * Dzień grafiku w kształcie zwracanym przez PostgREST: konie pracujące tego dnia, instruktorzy
 * dnia ze slotami (limity miejsc) i zapisy dnia. Sloty idą przez `schedule_day_instructors`,
 * bo `schedule_slots` ma FK tylko do instruktora w dniu, nie do `schedule_days`.
 */
export interface RawStatsDay {
  day: string;
  open_hour: number;
  close_hour: number;
  schedule_day_horses: { horse_id: number }[];
  schedule_day_instructors: { schedule_slots: { hour: number; seats: number }[] }[];
  bookings: RawStatsBooking[];
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
  const rows: StatsRows = { days: [], bookings: [], riders: [] };
  // Jeździec powtarza się w wielu dniach — do wierszy trafia raz, po koncie.
  const seenRiders = new Set<string>();

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
        slots: day.schedule_day_instructors.flatMap((instructor) =>
          instructor.schedule_slots.map((slot) => ({ hour: slot.hour, seats: slot.seats })),
        ),
      });
      for (const booking of day.bookings) {
        rows.bookings.push({
          day: day.day,
          horseId: booking.horse_id,
          hour: booking.hour,
          status: toBookingStatus(booking.status),
          riderId: booking.rider_id,
          cancelledBy: toCancelledBy(booking.cancelled_by),
        });
        // Zapis bez jeźdźca nie ma kogo dopisać — trafi do wiersza „Usunięci jeźdźcy".
        if (booking.rider_id !== null && !seenRiders.has(booking.rider_id)) {
          seenRiders.add(booking.rider_id);
          // Brak profilu lub nazwy zostaje `null` — tekst zastępczy należy do warstwy
          // czystej (`computeRiderRows`), nie do zapytania.
          rows.riders.push({ id: booking.rider_id, name: booking.profiles?.full_name ?? null });
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
 * Jedno zapytanie na stronę: zapisy dociąga embedded select przez FK `bookings → schedule_days`
 * (od #41 zapis wskazuje dzień wprost, a koń jest opcjonalny), więc termin zapisu (dzień)
 * przychodzi z wiersza nadrzędnego i nie trzeba przekazywać listy identyfikatorów dni w adresie.
 *
 * Nazwę jeźdźca dociąga embedded select przez FK `rider_id → profiles`, na tej samej
 * zasadzie co lista zapisów dnia (`getDayBookings`): polityka RLS na `profiles`
 * (`is_rider_of_my_stable`) wpuszcza ośrodek do profili jeźdźców mających zapis —
 * także odwołany — w jego stadninie. Nazw koni tu nie ma: strona bierze je z listy stada
 * (`listStableHorses`), która obejmuje też konie bez zapisów i zdezaktywowane.
 *
 * Filtr po `stable_id` jest jawny (lekcja S-04), choć RLS i tak pokazuje ośrodkowi
 * tylko własne zapisy. Wołać wyłącznie z sesji ośrodka dla jego własnej stadniny —
 * sesja jeźdźca zobaczyłaby przez RLS tylko własne zapisy i po cichu zaniżyła liczby.
 */
export function getStatsRows(client: Client, stableId: number, period: StatsPeriod): Promise<StatsRows> {
  return collectStatsRows((from, to) =>
    client
      .from("schedule_days")
      .select(
        "day, open_hour, close_hour, schedule_day_horses(horse_id), schedule_day_instructors(schedule_slots(hour, seats)), bookings(hour, status, cancelled_by, horse_id, rider_id, profiles(full_name))",
      )
      .eq("stable_id", stableId)
      .gte("day", period.from)
      .lte("day", period.to)
      .order("day")
      .range(from, to),
  );
}
