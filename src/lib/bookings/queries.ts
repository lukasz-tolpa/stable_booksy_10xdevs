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
 *
 * Wołać wyłącznie z sesji ośrodka dla jego własnego dnia — sesja jeźdźca
 * zobaczyłaby przez RLS tylko własne zapisy i po cichu zaniżyła listę.
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

/** Zapis jeźdźca z kontekstem dnia, ośrodka i konia — widok „Moje zapisy" (S-06). */
export interface RiderBooking {
  id: number;
  horseId: number;
  hour: number;
  day: string;
  stableName: string;
  horseName: string | null;
  status: string;
}

/**
 * Wszystkie zapisy jeźdźca (każdy status) z dniem, ośrodkiem i koniem.
 *
 * `bookings` nie ma FK wprost do `schedule_days` ani `horses` — łańcuch
 * embedded idzie przez złożony FK do `schedule_day_horses`, który ma FK
 * i do `schedule_days` (stamtąd `stables`), i do `horses`. Filtr po
 * `rider_id` jest jawny (lekcja S-04): polityka SELECT jest szersza niż
 * intencja tej funkcji.
 */
export async function getRiderBookings(client: Client, riderId: string): Promise<RiderBooking[]> {
  const { data, error } = await client
    .from("bookings")
    .select("id, horse_id, hour, status, schedule_day_horses(schedule_days(day, stables(name)), horses(name))")
    .eq("rider_id", riderId);

  if (error) {
    throw error;
  }

  return data.map((row) => ({
    id: row.id,
    horseId: row.horse_id,
    hour: row.hour,
    status: row.status,
    // Wygenerowane typy obiecuja niepuste obiekty (FK not-null), ale w runtime
    // RLS moglby ukryc wiersz posredni - ochrona zostaje, jak w getDayBookings.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    day: row.schedule_day_horses?.schedule_days?.day ?? "",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    stableName: row.schedule_day_horses?.schedule_days?.stables?.name ?? "(ośrodek)",
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    horseName: row.schedule_day_horses?.horses?.name ?? null,
  }));
}

/** Dane potrzebne do decyzji o odwołaniu — celowany odczyt jednego zapisu. */
export interface CancellableBooking {
  day: string;
  hour: number;
  status: string;
}

/**
 * Pojedynczy zapis jeźdźca pod decyzję o odwołaniu: tylko dzień, godzina
 * i status — bez embedów ośrodka i konia, których endpoint nie potrzebuje.
 * Wołać wyłącznie z sesji jeźdźca z jego własnym id (jak getRiderBookings).
 */
export async function getRiderBookingForCancel(
  client: Client,
  bookingId: number,
  riderId: string,
): Promise<CancellableBooking | null> {
  const { data, error } = await client
    .from("bookings")
    .select("hour, status, schedule_day_horses(schedule_days(day))")
    .eq("id", bookingId)
    .eq("rider_id", riderId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    hour: data.hour,
    status: data.status,
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    day: data.schedule_day_horses?.schedule_days?.day ?? "",
  };
}

/**
 * Odwołanie własnego zapisu: jeden UPDATE obu pól naraz — check constraint
 * `bookings_cancelled_at_consistency_check` wymusza spójność `status` i
 * `cancelled_at`. Filtr `status = 'active'` rozstrzyga wyścig dwóch odwołań:
 * drugi UPDATE trafia w 0 wierszy i zwraca `false` zamiast błędu.
 *
 * Wołać wyłącznie z sesji jeźdźca z jego własnym `riderId` — polityka UPDATE
 * jest own-OR-my-stable, więc sesja ośrodka z cudzym `riderId` też by przeszła.
 */
export async function cancelBooking(client: Client, bookingId: number, riderId: string): Promise<boolean> {
  const { data, error } = await client
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", bookingId)
    .eq("rider_id", riderId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data !== null;
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
