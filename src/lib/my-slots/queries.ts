import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { MySlotBookingInput, MySlotHorseOptionInput, MySlotInput } from "@/lib/my-slots/compose";

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
    bookingId: row.booking_id,
    day: row.day,
    hour: row.hour,
    // Wygenerowane typy obiecują tekst, ale funkcja zwraca NULL dla jeźdźca bez nazwiska
    // albo zanonimizowanego i dla zapisu bez konia.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    riderName: row.rider_name ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    horseId: row.horse_id ?? null,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    horseName: row.horse_name ?? null,
    anonymised: row.anonymised,
  }));
}

/**
 * Konie do wyboru przy aktywnych zapisach na sloty zalogowanego instruktora od podanego dnia —
 * przez RPC `get_my_slot_horse_options`: konie pracujące tego dnia ze znacznikiem „zajęty o tej
 * godzinie”, bez danych jeźdźca ani instruktora, który ma zajętego konia (#81).
 */
export async function getMySlotHorseOptions(client: Client, from: string): Promise<MySlotHorseOptionInput[]> {
  const { data, error } = await client.rpc("get_my_slot_horse_options", { p_from: from });

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    bookingId: row.booking_id,
    horseId: row.horse_id,
    horseName: row.horse_name,
    taken: row.taken,
  }));
}

/**
 * Przydział, zmiana albo zdjęcie (`horseId = null`) konia przez instruktora przy zapisie na
 * jego slot — RPC `assign_my_slot_horse`, która bierze instruktora z sesji i zmienia wyłącznie
 * konia. Odmowy podnosi baza: 42501 zapis spoza slotów wywołującego, 23514 zapis odwołany,
 * 23503 koń nie pracuje tego dnia, 23505 koń zajęty o tej godzinie
 * (`instructorHorseAssignmentErrorMessage`).
 */
export async function assignMySlotHorse(client: Client, bookingId: number, horseId: number | null): Promise<void> {
  // Pominięty `p_horse_id` to w funkcji NULL — zdjęcie konia.
  const { error } = await client.rpc(
    "assign_my_slot_horse",
    horseId === null ? { p_booking_id: bookingId } : { p_booking_id: bookingId, p_horse_id: horseId },
  );

  if (error) {
    throw error;
  }
}
