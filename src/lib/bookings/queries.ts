import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { SlotKey } from "@/lib/bookings/slots";

type Client = SupabaseClient<Database>;

/**
 * Zajęte sloty (koń × godzina) ośrodka na dany dzień — przez RPC `get_taken_slots`,
 * bo polityka SELECT na `bookings` pokazuje jeźdźcowi wyłącznie jego własne zapisy.
 * Funkcja zwraca samą zajętość, bez tożsamości jeźdźców.
 */
export async function getTakenSlots(client: Client, stableId: number, day: string): Promise<SlotKey[]> {
  const { data, error } = await client.rpc("get_taken_slots", { p_stable_id: stableId, p_day: day });

  if (error) {
    throw error;
  }

  return data.map((row) => ({ horseId: row.horse_id, hour: row.hour }));
}

/**
 * Własne aktywne zapisy jeźdźca w danym dniu grafiku.
 *
 * Filtr po `rider_id` jest jawny, a nie zostawiony RLS: polityka SELECT na
 * `bookings` to own-OR-my-stable, więc sesja OŚRODKA widziałaby tu zapisy
 * wszystkich jeźdźców swojego dnia i funkcja zgłosiłaby je jako „moje".
 */
export async function getMyBookings(client: Client, scheduleDayId: number, riderId: string): Promise<SlotKey[]> {
  const { data, error } = await client
    .from("bookings")
    .select("horse_id, hour")
    .eq("schedule_day_id", scheduleDayId)
    .eq("rider_id", riderId)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  return data.map((row) => ({ horseId: row.horse_id, hour: row.hour }));
}

/** Zapis dnia z perspektywy ośrodka: slot plus nazwisko jeźdźca (FR-005). */
export interface DayBooking {
  horseId: number;
  hour: number;
  riderName: string | null;
}

/**
 * Aktywne zapisy dnia grafiku wraz z nazwiskiem jeźdźca — widok ośrodka (S-05).
 *
 * Nazwisko dociąga embedded select przez bezpośredni FK `rider_id → profiles`;
 * polityka RLS na `profiles` (`is_rider_of_my_stable`) wpuszcza ośrodek do
 * profili jeźdźców mających zapis w jego stadninie, więc dla własnych dni
 * nazwisko zawsze się rozwiąże. `null` zostaje `null` — fallback tekstowy
 * należy do warstwy czystej (`composeBookingRows`), nie do zapytania.
 */
export async function getDayBookings(client: Client, scheduleDayId: number): Promise<DayBooking[]> {
  const { data, error } = await client
    .from("bookings")
    .select("horse_id, hour, profiles(full_name)")
    .eq("schedule_day_id", scheduleDayId)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    horseId: row.horse_id,
    hour: row.hour,
    // Wygenerowany typ obiecuje niepusty `profiles` (FK not-null), ale w runtime
    // RLS może ukryć wiersz nadrzędny i PostgREST odda `null` — ochrona zostaje.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    riderName: row.profiles?.full_name ?? null,
  }));
}

export interface CreateBookingInput {
  scheduleDayId: number;
  horseId: number;
  hour: number;
  /** Zawsze z sesji, nigdy z formularza — wymusza to też polityka INSERT. */
  riderId: string;
}

/**
 * Pojedynczy INSERT — atomowy, więc nie ma tu problemu częściowego zapisu z S-02.
 * Odmowy podnosi baza: 23505 (slot zajęty), 23514 (poza godzinami), 23503 (koń nie
 * pracuje tego dnia); wołający tłumaczy je przez `bookingErrorMessage`.
 */
export async function createBooking(client: Client, input: CreateBookingInput): Promise<void> {
  const { error } = await client.from("bookings").insert({
    schedule_day_id: input.scheduleDayId,
    horse_id: input.horseId,
    hour: input.hour,
    rider_id: input.riderId,
  });

  if (error) {
    throw error;
  }
}
