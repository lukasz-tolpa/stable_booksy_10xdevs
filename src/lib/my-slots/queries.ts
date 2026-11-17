import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { MySlotBookingInput, MySlotInput } from "@/lib/my-slots/compose";

type Client = SupabaseClient<Database>;

/** Instruktor powiązany z kontem i nazwa jego ośrodka — nagłówek „Moje sloty”. */
export interface MyInstructor {
  id: number;
  name: string;
  /** `null`, gdy RLS nie pokazuje ośrodka (instruktor zdezaktywowany). */
  stableName: string | null;
}

/**
 * Instruktor powiązany z kontem albo `null`. Filtr po `account_id` jest jawny, choć RLS
 * pokazuje instruktorowi tylko jego wiersz — właścicielowi pokazuje wszystkich.
 */
export async function getMyInstructor(client: Client, accountId: string): Promise<MyInstructor | null> {
  const { data, error } = await client
    .from("instructors")
    .select("id, name, stables(name)")
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  // Wygenerowane typy obiecują ośrodek (FK not-null), ale RLS ukrywa go zdezaktywowanemu.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return { id: data.id, name: data.name, stableName: data.stables?.name ?? null };
}

/**
 * Sloty instruktora od podanego dnia (włącznie), także z limitem zero — co pokazać, decyduje
 * `composeMySlots`. Filtr po `instructor_id` jest jawny, a RLS (`schedule_slots`) i tak
 * pokazuje instruktorowi wyłącznie jego sloty.
 */
export async function getMySlots(client: Client, instructorId: number, from: string): Promise<MySlotInput[]> {
  const { data, error } = await client
    .from("schedule_slots")
    // Slot wskazuje dzień przez przypisanie instruktora do dnia (złożony FK), nie wprost.
    .select("hour, seats, schedule_day_instructors!inner(schedule_days!inner(day))")
    .eq("instructor_id", instructorId)
    .gte("schedule_day_instructors.schedule_days.day", from);

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    day: row.schedule_day_instructors.schedule_days.day,
    hour: row.hour,
    seats: row.seats,
  }));
}

/**
 * Aktywne zapisy na sloty zalogowanego instruktora od podanego dnia, z imieniem i nazwiskiem
 * jeźdźca i koniem — przez RPC `get_my_slot_bookings` (instruktor nie czyta profili jeźdźców
 * ani koni wprost; funkcja bierze instruktora z sesji).
 */
export async function getMySlotBookings(client: Client, from: string): Promise<MySlotBookingInput[]> {
  const { data, error } = await client.rpc("get_my_slot_bookings", { p_from: from });

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    day: row.day,
    hour: row.hour,
    // Wygenerowane typy obiecują tekst, ale funkcja zwraca NULL dla jeźdźca bez nazwiska
    // albo zanonimizowanego i dla zapisu bez konia.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    riderName: row.rider_name ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    horseName: row.horse_name ?? null,
    anonymised: row.anonymised,
  }));
}
