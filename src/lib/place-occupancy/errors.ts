import { errorCode } from "@/lib/db-errors";

/**
 * Odmowa `public.get_place_occupancy` (#116): zajętość placów widzi ośrodek i pensjonariusz, którego koń stoi
 * w ośrodku w tym dniu. Strona pokazuje ją jako stan pusty, nie awarię.
 */
export const PLACE_OCCUPANCY_REFUSED = "SB054";

export const PLACE_OCCUPANCY_REFUSED_MESSAGE = [
  "Twój koń nie stoi w tym dniu w ośrodku.",
  "Zajętość placów widzisz w dniach pobytu swojego konia.",
] as const;

export function isPlaceOccupancyRefusal(error: unknown): boolean {
  return errorCode(error) === PLACE_OCCUPANCY_REFUSED;
}
