/**
 * Reguła „pensjonariusz w miesiącu” (GLOSSARY „Pensjonariusz”, ADR 0005, #114): jeździec jest
 * pensjonariuszem ośrodka w każdym miesiącu, na który zachodzi pobyt choć jednego jego konia w tym
 * ośrodku — w całości, także w miesiącu przyjazdu i wyjazdu.
 *
 * Bliźniak w bazie: `private.stay_overlaps_month` / `private.is_boarder_in_month`
 * (migracja 20261201100000). Obie strony sprawdzają te same przypadki
 * (`month.test.ts`, `supabase/tests/boarding_horses.sql`); zmiana reguły to zmiana obu naraz.
 */

/** Pobyt konia pensjonatowego: dzień przyjazdu i dzień wyjazdu (`RRRR-MM-DD`), `null` — trwa. */
export interface BoardingStay {
  arrivalDay: string;
  departureDay: string | null;
}

/** Czy pobyt zachodzi na miesiąc `RRRR-MM` (przyjazd nie później, wyjazd nie wcześniej niż ten miesiąc). */
export function stayOverlapsMonth(stay: BoardingStay, month: string): boolean {
  return stay.arrivalDay.slice(0, 7) <= month && (stay.departureDay === null || stay.departureDay.slice(0, 7) >= month);
}

/** Czy jeździec z tymi pobytami koni (w jednym ośrodku) jest w miesiącu `RRRR-MM` pensjonariuszem. */
export function isBoarderInMonth(stays: readonly BoardingStay[], month: string): boolean {
  return stays.some((stay) => stayOverlapsMonth(stay, month));
}
