import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { OpenSeatRow } from "@/lib/instructors/open-seats";
import type { Instructor } from "@/types";

type Client = SupabaseClient<Database>;

/** Pola instruktora pokazywane na liście instruktorów ośrodka. */
export type InstructorListItem = Pick<Instructor, "id" | "name" | "active">;

const INSTRUCTOR_COLUMNS = "id, name, active";

/**
 * Instruktorzy ośrodka, posortowani: najpierw aktywni, potem nieaktywni, w obu grupach po nazwie.
 *
 * Filtr po `stable_id` jest KONIECZNY: polityka odczytu na `instructors` jest otwarta dla
 * każdego zalogowanego (jeździec widzi nazwę instruktora przy slocie), więc bez niego
 * ośrodek zobaczyłby instruktorów cudzych stadnin.
 */
export async function listStableInstructors(client: Client, stableId: number): Promise<InstructorListItem[]> {
  const { data, error } = await client
    .from("instructors")
    .select(INSTRUCTOR_COLUMNS)
    .eq("stable_id", stableId)
    .order("active", { ascending: false })
    .order("name");

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Sloty z wystawionymi miejscami (limit > 0) w dniach stadniny od `today` włącznie — wejście
 * dla `countDaysWithOpenSeats`, który odrzuca godziny już rozpoczęte. Filtr po `stable_id`
 * konieczny, bo odczyt grafiku jest otwarty dla każdego zalogowanego.
 */
export async function listOpenSeatRows(client: Client, stableId: number, today: string): Promise<OpenSeatRow[]> {
  const { data, error } = await client
    .from("schedule_days")
    .select("day, schedule_day_instructors(instructor_id, schedule_slots(hour, seats))")
    .eq("stable_id", stableId)
    .gte("day", today)
    .gt("schedule_day_instructors.schedule_slots.seats", 0);

  if (error) {
    throw error;
  }

  return data.flatMap((day) =>
    day.schedule_day_instructors.flatMap((entry) =>
      entry.schedule_slots.map((slot) => ({ instructorId: entry.instructor_id, day: day.day, hour: slot.hour })),
    ),
  );
}
