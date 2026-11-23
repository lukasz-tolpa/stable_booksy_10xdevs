import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { OccupancySlot } from "@/lib/place-occupancy/occupancy";
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
