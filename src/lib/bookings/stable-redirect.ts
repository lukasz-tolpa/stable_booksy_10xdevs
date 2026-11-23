import type { APIContext } from "astro";

/** Lista zapisów dnia ośrodka — cel powrotu z przydziału konia i odwołania zapisu. */
export const STABLE_DAY_BOOKINGS_ROUTE = "/osrodek/zapisy";

/** „Zapisy do przyjęcia” ośrodka (#124) — zapisy oczekujące; cel powrotu z przyjęcia zapisu. */
export const PENDING_BOOKINGS_ROUTE = "/osrodek/zapisy-do-przyjecia";

/** Wartości `sukces=` na „Zapisach do przyjęcia”: przyjęcie (#124) i odrzucenie (#125). */
export type PendingBookingOutcome = "przyjecie" | "odrzucenie";

const PENDING_SUCCESS_MESSAGES: Record<PendingBookingOutcome, string> = {
  przyjecie: "Zapis przyjęty. Jeździec ma miejsce w slocie.",
  odrzucenie: "Zapis odrzucony. Jeździec zobaczy powód w swoich zapisach.",
};

/** Potwierdzenie na „Zapisach do przyjęcia” dla parametru `sukces=`; `null` — brak albo nieznana wartość. */
export function pendingBookingsSuccessMessage(value: string | null): string | null {
  return value === "przyjecie" || value === "odrzucenie" ? PENDING_SUCCESS_MESSAGES[value] : null;
}

/** Powrót na „Zapisy do przyjęcia” z wynikiem przyjęcia albo odrzucenia. */
export function backToPendingBookings(
  context: APIContext,
  outcome: { error: string } | { success: PendingBookingOutcome },
) {
  const params = new URLSearchParams("error" in outcome ? { error: outcome.error } : { sukces: outcome.success });
  return context.redirect(`${PENDING_BOOKINGS_ROUTE}?${params.toString()}`);
}

/**
 * Wartości `sukces=` rozpoznawane przez stronę listy dnia — także przyjęcie i odrzucenie zapisu oczekującego
 * przy slocie (#128).
 */
export type StableBookingOutcome = "przydzial" | "odwolanie" | PendingBookingOutcome;

const SUCCESS_MESSAGES: Record<StableBookingOutcome, string> = {
  przydzial: "Przydział konia zapisany.",
  odwolanie: "Zapis został odwołany. Miejsce w slocie wróciło do puli wolnych.",
  ...PENDING_SUCCESS_MESSAGES,
};

function isStableBookingOutcome(value: string | null): value is StableBookingOutcome {
  return value !== null && Object.hasOwn(SUCCESS_MESSAGES, value);
}

/** Potwierdzenie na liście dnia dla parametru `sukces=`; `null` — brak albo nieznana wartość. */
export function stableBookingSuccessMessage(value: string | null): string | null {
  return isStableBookingOutcome(value) ? SUCCESS_MESSAGES[value] : null;
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

/**
 * Powrót po przyjęciu albo odrzuceniu zapisu oczekującego: na zapisy dnia `day`, gdy decyzja zapadła przy
 * slocie (#128), inaczej na „Zapisy do przyjęcia”.
 */
export function backAfterPendingDecision(
  context: APIContext,
  day: string | null,
  outcome: { error: string } | { success: PendingBookingOutcome },
) {
  return day === null ? backToPendingBookings(context, outcome) : backToDayBookings(context, day, outcome);
}
