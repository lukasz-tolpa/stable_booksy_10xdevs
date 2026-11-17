import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { OpenSeatRow } from "@/lib/instructors/open-seats";
import type { Instructor } from "@/types";

type Client = SupabaseClient<Database>;

/** Pola instruktora na liście instruktorów ośrodka; `account_id` rozpoznaje właściciela. */
export type InstructorListItem = Pick<Instructor, "id" | "name" | "active" | "account_id">;

const INSTRUCTOR_COLUMNS = "id, name, active, account_id";

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

/** Żywe zaproszenie instruktora do konta (#74) — bez tokenu i jego skrótu. */
export type LiveInvitation = Database["public"]["Functions"]["list_instructor_invitations"]["Returns"][number];

/**
 * Żywe zaproszenia ośrodka właściciela: nieprzyjęte, niewycofane, niewygasłe, tylko instruktorzy
 * aktywni i bez konta. Ośrodek wybiera baza z sesji (`list_instructor_invitations`, 42501 dla
 * nie-właściciela), więc filtra po stadninie nie ma tu czym podać.
 */
export async function listLiveInvitations(client: Client): Promise<LiveInvitation[]> {
  const { data, error } = await client.rpc("list_instructor_invitations");

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Wystawienie zaproszenia: token (jedyny raz — baza zna tylko jego skrót) i wygaśnięcie.
 * Odmowy (42501, SB013–SB015, 23514) wracają w `error` do tłumaczenia przez
 * `invitationErrorMessage`.
 */
export async function issueInvitation(client: Client, instructorId: number, email: string) {
  const { data, error } = await client
    .rpc("issue_instructor_invitation", { p_instructor_id: instructorId, p_email: email })
    .single();
  return { invitation: data, error };
}

/** Wycofanie żywego zaproszenia instruktora; `revoked: false` — nie było czego wycofać. */
export async function revokeInvitation(client: Client, instructorId: number) {
  const { data, error } = await client.rpc("revoke_instructor_invitation", { p_instructor_id: instructorId });
  return { revoked: data === true, error };
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
