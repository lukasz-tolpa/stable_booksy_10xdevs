import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
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
