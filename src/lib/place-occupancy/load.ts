import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { logError } from "@/lib/log";
import { isPlaceOccupancyRefusal, PLACE_OCCUPANCY_REFUSED_MESSAGE } from "@/lib/place-occupancy/errors";
import { composePlaceOccupancy, type PlaceOccupancyView } from "@/lib/place-occupancy/occupancy";
import { getPlaceOccupancy } from "@/lib/place-occupancy/queries";
import { listStablePlaces } from "@/lib/places/queries";
import { getScheduleDay } from "@/lib/schedule/queries";

/** Co rysuje `PlaceOccupancyGrid`: model dnia, odmowa bazy (stan pusty) albo awaria odczytu. */
export type PlaceOccupancyState =
  | { kind: "view"; view: PlaceOccupancyView }
  | { kind: "refused"; message: readonly string[] }
  | { kind: "failed" };

/**
 * Jeden odczyt zajętości placów dla obu stron (pensjonariusz, właściciel): godziny dnia, place ośrodka i sloty
 * z liczbą zajętych miejsc, złożone przez `composePlaceOccupancy`. Odmowa `SB054` to stan pusty, nie awaria;
 * awaria jest logowana jako `scope`.
 */
export async function loadPlaceOccupancy(
  client: SupabaseClient<Database>,
  stableId: number,
  day: string,
  scope: string,
): Promise<PlaceOccupancyState> {
  try {
    const [slots, scheduleDay, places] = await Promise.all([
      getPlaceOccupancy(client, stableId, day),
      getScheduleDay(client, stableId, day),
      listStablePlaces(client, stableId),
    ]);
    return { kind: "view", view: composePlaceOccupancy({ day: scheduleDay, places, slots }) };
  } catch (error) {
    if (isPlaceOccupancyRefusal(error)) {
      return { kind: "refused", message: PLACE_OCCUPANCY_REFUSED_MESSAGE };
    }
    logError(scope, error);
    return { kind: "failed" };
  }
}
