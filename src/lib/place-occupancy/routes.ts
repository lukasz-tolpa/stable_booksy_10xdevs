/** Zajętość placów pensjonariusza (#116) — ośrodek w `?osrodek=`, dzień w `?dzien=RRRR-MM-DD`. */
export const RIDER_PLACE_OCCUPANCY_ROUTE = "/jezdziec/zajetosc-placow";

/** Zajętość placów ośrodka właściciela (#116) — dzień w `?dzien=RRRR-MM-DD`. */
export const OWNER_PLACE_OCCUPANCY_ROUTE = "/osrodek/zajetosc-placow";

export const STABLE_PARAM = "osrodek";
export const DAY_PARAM = "dzien";

/** Adres zajętości placów dnia; `stableId` tylko na stronie pensjonariusza. */
export function placeOccupancyHref(route: string, day: string, stableId?: number): string {
  const params = new URLSearchParams();
  if (stableId !== undefined) {
    params.set(STABLE_PARAM, String(stableId));
  }
  params.set(DAY_PARAM, day);
  return `${route}?${params.toString()}`;
}
