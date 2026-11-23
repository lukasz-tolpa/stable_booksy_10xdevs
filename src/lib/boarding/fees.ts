/**
 * Opłata za pensjonat (GLOSSARY, #117) — jedyne miejsce, które ją rozstrzyga. Dane to zmiany opłaty
 * z tabeli `public.boarding_fees`: kwota dla jednego konia pensjonatowego od wskazanego miesiąca, wzorem
 * stawki — zmiana nie przelicza minionych miesięcy, a pierwsza opłata konia obowiązuje też wstecz (jak
 * pierwsza stawka ośrodka), więc od razu rozlicza miesiące pobytu przed jej ustawieniem.
 * Do rozliczenia pensjonariusza opłata wchodzi w całości za każdy miesiąc, na który zachodzi pobyt
 * (`stayOverlapsMonth`) — to składa `riderAmounts` (`@/lib/settlements/settlements`).
 */

/** Jedna zmiana opłaty (wiersz `public.boarding_fees`); miesiąc `RRRR-MM`, kwota w groszach. */
export interface BoardingFeeChange {
  id: number;
  horseId: number;
  /** Miesiąc „od” `RRRR-MM`. */
  fromMonth: string;
  /** Grosze, 0..10 000 000. */
  amount: number;
}

/** Zmiany opłaty konia, od najwcześniejszej. */
function horseChanges(changes: readonly BoardingFeeChange[], horseId: number): BoardingFeeChange[] {
  return changes.filter((change) => change.horseId === horseId).sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
}

/**
 * Opłata za pensjonat konia w miesiącu `RRRR-MM` w groszach: najpóźniejsza zmiana z miesiącem „od” ≤ miesiąc,
 * a gdy żadnej — pierwsza zmiana konia (wstecz). `null` — koń bez opłaty.
 */
export function boardingFeeFor(changes: readonly BoardingFeeChange[], horseId: number, month: string): number | null {
  const sorted = horseChanges(changes, horseId);
  const first = sorted.at(0);
  if (!first) {
    return null;
  }
  return (sorted.filter((change) => change.fromMonth <= month).at(-1) ?? first).amount;
}

/** Zaplanowana zmiana opłaty — od miesiąca późniejszego niż bieżący; można ją usunąć. */
export interface PlannedBoardingFee {
  id: number;
  fromMonth: string;
  amount: number;
}

/** Opłata konia dziś i zaplanowana zmiana — „Pensjonariusze” (właściciel) i „Moje konie” (pensjonariusz). */
export interface BoardingFeeSchedule {
  /** Grosze w bieżącym miesiącu; `null` — koń bez opłaty. */
  current: number | null;
  /** Zmiana od następnego miesiąca (baza nie przyjmie późniejszej); `null` — brak. */
  planned: PlannedBoardingFee | null;
}

/** Opłata konia w bieżącym miesiącu (`RRRR-MM`, strefa ośrodka) i zaplanowana zmiana. */
export function boardingFeeSchedule(
  changes: readonly BoardingFeeChange[],
  horseId: number,
  currentMonth: string,
): BoardingFeeSchedule {
  const planned = horseChanges(changes, horseId).find((change) => change.fromMonth > currentMonth);
  return {
    current: boardingFeeFor(changes, horseId, currentMonth),
    planned: planned ? { id: planned.id, fromMonth: planned.fromMonth, amount: planned.amount } : null,
  };
}
