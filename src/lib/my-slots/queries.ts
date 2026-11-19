import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { MySlotBookingInput, MySlotInput } from "@/lib/my-slots/compose";

type Client = SupabaseClient<Database>;

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
