import type { APIContext } from "astro";

/** Lista zapisów dnia ośrodka — cel powrotu z przydziału konia i odwołania zapisu. */
export const STABLE_DAY_BOOKINGS_ROUTE = "/osrodek/zapisy";

/** „Zapisy do przyjęcia” ośrodka (#124) — zapisy oczekujące; cel powrotu z przyjęcia zapisu. */
export const PENDING_BOOKINGS_ROUTE = "/osrodek/zapisy-do-przyjecia";

/** Potwierdzenie przyjęcia na „Zapisach do przyjęcia” (`sukces=przyjecie`). */
export const ACCEPTED_MESSAGE = "Zapis przyjęty. Jeździec ma miejsce w slocie.";

/** Powrót na „Zapisy do przyjęcia” z wynikiem przyjęcia. */
export function backToPendingBookings(context: APIContext, outcome: { error: string } | { success: "przyjecie" }) {
  const params = new URLSearchParams("error" in outcome ? { error: outcome.error } : { sukces: outcome.success });
  return context.redirect(`${PENDING_BOOKINGS_ROUTE}?${params.toString()}`);
}

/** Wartości `sukces=` rozpoznawane przez stronę listy dnia. */
export type StableBookingOutcome = "przydzial" | "odwolanie";

const SUCCESS_MESSAGES: Record<StableBookingOutcome, string> = {
  przydzial: "Przydział konia zapisany.",
  odwolanie: "Zapis został odwołany. Miejsce w slocie wróciło do puli wolnych.",
};

/** Potwierdzenie na liście dnia dla parametru `sukces=`; `null` — brak albo nieznana wartość. */
export function stableBookingSuccessMessage(value: string | null): string | null {
  return value === "przydzial" || value === "odwolanie" ? SUCCESS_MESSAGES[value] : null;
}

/**
 * Powrót na listę dnia z wynikiem akcji. `day` może być `null` (np. nieczytelne pole
 * formularza) — wtedy strona pokazuje swój domyślny dzień.
 */
export function backToDayBookings(
  context: APIContext,
  day: string | null,
  outcome: { error?: string; success?: StableBookingOutcome } = {},
) {
  const params = new URLSearchParams();
  if (day) {
    params.set("dzien", day);
  }
  if (outcome.error) {
    params.set("error", outcome.error);
  } else if (outcome.success) {
    params.set("sukces", outcome.success);
  }

  const query = params.toString();
  return context.redirect(query ? `${STABLE_DAY_BOOKINGS_ROUTE}?${query}` : STABLE_DAY_BOOKINGS_ROUTE);
}
