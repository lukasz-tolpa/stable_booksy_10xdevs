import type { APIContext } from "astro";

/** Strona „Pensjonariusze” właściciela (#114) — cel powrotu formularzy koni pensjonatowych i pobytów. */
export const STABLE_BOARDERS_ROUTE = "/osrodek/pensjonariusze";

/** Koń pensjonatowy na stronie „Pensjonariusze” (kotwica nagłówka konia) — tam ustawia się opłatę za pensjonat (#117). */
export function boardingHorseHref(horseId: number): string {
  return `${STABLE_BOARDERS_ROUTE}#${horseAnchor(horseId)}`;
}

/** Strona „Moje konie” pensjonariusza (#114) — cel powrotu z zakończenia pobytu. */
export const MY_HORSES_ROUTE = "/jezdziec/konie";

/**
 * Pole formularza dnia wyjazdu: `stable` (strona „Pensjonariusze”) albo `rider` („Moje konie”). Wybiera
 * tylko stronę powrotu — kto ustawia dzień wyjazdu, bierze baza z sesji.
 */
export const DEPARTURE_SIDE_FIELD = "strona";

/** Parametr adresu z wynikiem udanej czynności (`?sukces=…`) — strona wybiera z niego zdanie. */
export const SUCCESS_PARAM = "sukces";

/** Co się udało — wartość `?sukces=`. */
export const BOARDING_OUTCOME = {
  horse: "kon",
  stay: "pobyt",
  departure: "wyjazd",
  fee: "oplata",
  feeDeleted: "oplata-usunieta",
} as const;

export type BoardingOutcome = (typeof BOARDING_OUTCOME)[keyof typeof BOARDING_OUTCOME];

/**
 * Powrót na stronę z komunikatem błędu albo z wynikiem sukcesu; `anchor` — kotwica na stronie (np. koń
 * `horse-7`, przy którym była czynność).
 */
export function backTo(
  context: APIContext,
  route: string,
  result: { error: string } | { outcome: BoardingOutcome },
  anchor?: string,
) {
  const search =
    "error" in result
      ? `error=${encodeURIComponent(result.error)}`
      : `${SUCCESS_PARAM}=${encodeURIComponent(result.outcome)}`;
  return context.redirect(`${route}?${search}${anchor ? `#${anchor}` : ""}`);
}

/** Kotwica konia pensjonatowego na stronie „Pensjonariusze” (id nagłówka w `BoardingHorse.astro`). */
export function horseAnchor(horseId: number): string {
  return `horse-${String(horseId)}`;
}
