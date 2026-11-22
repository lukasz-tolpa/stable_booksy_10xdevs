import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { BoarderHorseStays, OccupancySlot } from "@/lib/place-occupancy/occupancy";
import { toSlotKind } from "@/lib/schedule/kind";

type Client = SupabaseClient<Database>;

/**
 * Sloty dnia ośrodka na placach z liczbą aktywnych zapisów — `public.get_place_occupancy` (same liczby, bez
 * jeźdźców i koni). Ośrodek albo pensjonariusz z pobytem konia w tym dniu; inaczej baza odmawia (`SB054`,
 * `isPlaceOccupancyRefusal`). Rzuca przy błędzie.
 */
export async function getPlaceOccupancy(client: Client, stableId: number, day: string): Promise<OccupancySlot[]> {
  const { data, error } = await client.rpc("get_place_occupancy", { p_stable_id: stableId, p_day: day });
  if (error) {
    throw error;
  }
  return data.map((row) => ({
    placeId: row.place_id,
    hour: row.hour,
    instructorName: row.instructor_name,
    kind: toSlotKind(row.kind),
    taken: row.taken,
  }));
}

/**
 * Konie pensjonatowe jeźdźca z ośrodkiem i pobytami — z nich `boarderOccupancyStables`. Filtr po koncie jawnie
 * obok RLS (`horse_owners` czyta właściciel ośrodka i sam pensjonariusz). Rzuca przy błędzie odczytu.
 */
export async function listMyHorseStays(client: Client, riderId: string): Promise<BoarderHorseStays[]> {
  const { data, error } = await client
    .from("horse_owners")
    .select("stable_id, stables(name), horse_stays(arrival_day, departure_day)")
    .eq("rider_id", riderId);
  if (error) {
    throw error;
  }
  return data.map((row) => ({
    stableId: row.stable_id,
    stableName: row.stables.name,
    stays: row.horse_stays.map((stay) => ({ arrivalDay: stay.arrival_day, departureDay: stay.departure_day })),
  }));
}
