import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { ScheduleDayInput } from "@/lib/schedule/schema";

type Client = SupabaseClient<Database>;

/** Limit miejsc jednego slotu: instruktor w danej godzinie dnia. */
export interface SlotSeats {
  instructorId: number;
  hour: number;
  seats: number;
}

export interface ScheduleDayData {
  id: number;
  day: string;
  openHour: number;
  closeHour: number;
  horseIds: number[];
  instructorIds: number[];
  seats: SlotSeats[];
}

const DAY_COLUMNS =
  "id, day, open_hour, close_hour, schedule_day_horses(horse_id), schedule_day_instructors(instructor_id, schedule_slots(hour, seats))";

interface RawScheduleDay {
  id: number;
  day: string;
  open_hour: number;
  close_hour: number;
  schedule_day_horses: { horse_id: number }[];
  schedule_day_instructors: { instructor_id: number; schedule_slots: { hour: number; seats: number }[] }[];
}

function toScheduleDay(row: RawScheduleDay): ScheduleDayData {
  return {
    id: row.id,
    day: row.day,
    openHour: row.open_hour,
    closeHour: row.close_hour,
    horseIds: row.schedule_day_horses.map((entry) => entry.horse_id),
    instructorIds: row.schedule_day_instructors.map((entry) => entry.instructor_id),
    seats: row.schedule_day_instructors.flatMap((entry) =>
      entry.schedule_slots.map((slot) => ({ instructorId: entry.instructor_id, hour: slot.hour, seats: slot.seats })),
    ),
  };
}

/** Grafik stadniny na konkretny dzień albo `null`, gdy nie został jeszcze ułożony. */
export async function getScheduleDay(client: Client, stableId: number, day: string): Promise<ScheduleDayData | null> {
  const { data, error } = await client
    .from("schedule_days")
    .select(DAY_COLUMNS)
    .eq("stable_id", stableId)
    .eq("day", day)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toScheduleDay(data) : null;
}

/**
 * Ostatnio ułożony dzień stadniny — źródło podpowiedzi przy nowym dniu.
 * Ośrodki pracują w powtarzalnym rytmie, więc przepisywanie tego samego zakresu
 * to najczęstsza czynność na tym ekranie.
 *
 * Sortowanie po `created_at`, a NIE po `day`: chodzi o dzień ułożony ostatnio, nie
 * o ten najdalszy w przyszłości. Inaczej jeden nietypowy dzień zaplanowany na sierpień
 * podpowiadałby swoje wartości przy układaniu jutra.
 */
export async function getLatestScheduleDay(client: Client, stableId: number): Promise<ScheduleDayData | null> {
  const { data, error } = await client
    .from("schedule_days")
    .select(DAY_COLUMNS)
    .eq("stable_id", stableId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toScheduleDay(data) : null;
}

/**
 * Zapis całego dnia — godziny, konie, instruktorzy i limity miejsc — jednym wywołaniem
 * `public.save_schedule_day`. Funkcja działa w jednej transakcji i jest jedyną drogą zapisu
 * grafiku (bezpośredni zapis do tabel jest odebrany), więc udaje się w całości albo wcale,
 * a każda odmowa wraca jako kod z `src/lib/schedule/errors.ts`. Stadnina pochodzi z sesji.
 */
export async function saveScheduleDay(client: Client, input: ScheduleDayInput): Promise<void> {
  const { error } = await client.rpc("save_schedule_day", {
    p_day: input.day,
    p_open_hour: input.openHour,
    p_close_hour: input.closeHour,
    p_horse_ids: [...new Set(input.horseIds)],
    p_instructor_ids: [...new Set(input.instructorIds)],
    p_seats: input.seats.map((slot) => ({ instructor_id: slot.instructorId, hour: slot.hour, seats: slot.seats })),
  });

  if (error) {
    throw error;
  }
}
