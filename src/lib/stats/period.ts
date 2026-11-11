import { parseScheduleDate, todayIso } from "@/lib/schedule/dates";
import type { StatsPeriod } from "@/lib/stats/stats";

/**
 * Okres statystyk z parametrów adresu (`?od=…&do=…`).
 *
 * Okres nie ma limitu długości — statystyki liczone są w aplikacji przy małej
 * skali danych; to świadome uproszczenie.
 */

/** Okres domyślny: bieżący miesiąc od 1. dnia do dziś (dziś w strefie ośrodka). */
export function defaultStatsPeriod(today: string = todayIso()): StatsPeriod {
  return { from: `${today.slice(0, 8)}01`, to: today };
}

export interface ResolvedStatsPeriod {
  period: StatsPeriod;
  /**
   * „Od" późniejsze niż „do": `period` niesie wpisane daty (formularz ma je pokazać
   * do poprawy), a strona zamiast liczb pokazuje komunikat.
   */
  reversed: boolean;
}

/**
 * Brak albo błąd któregokolwiek parametru daje okres domyślny w całości — połowa
 * zakresu z adresu i połowa domyślna dałyby okres, którego nikt nie wybrał.
 */
export function resolveStatsPeriod(
  fromRaw: string | null | undefined,
  toRaw: string | null | undefined,
  today: string = todayIso(),
): ResolvedStatsPeriod {
  const from = parseScheduleDate(fromRaw);
  const to = parseScheduleDate(toRaw);

  if (from === null || to === null) {
    return { period: defaultStatsPeriod(today), reversed: false };
  }

  return { period: { from, to }, reversed: from > to };
}
