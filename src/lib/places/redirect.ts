import type { APIContext } from "astro";

/** Strona „Place” ośrodka (#113) — cel powrotu z dodania, zmiany nazwy i przełączenia placu. */
export const PLACES_ROUTE = "/osrodek/place";

/** Powrót na stronę placów, z komunikatem błędu albo bez (sukces). */
export function backToPlaces(context: APIContext, error?: string) {
  return context.redirect(error ? `${PLACES_ROUTE}?error=${encodeURIComponent(error)}` : PLACES_ROUTE);
}
