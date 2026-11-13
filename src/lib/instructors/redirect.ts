import type { APIContext } from "astro";

/** Strona instruktorów ośrodka — cel powrotu z dodania i przełączenia instruktora. */
export const INSTRUCTORS_ROUTE = "/osrodek/instruktorzy";

/** Powrót na listę instruktorów, z komunikatem błędu albo bez (sukces). */
export function backToInstructors(context: APIContext, error?: string) {
  return context.redirect(error ? `${INSTRUCTORS_ROUTE}?error=${encodeURIComponent(error)}` : INSTRUCTORS_ROUTE);
}
