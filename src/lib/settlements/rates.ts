import { shiftMonth } from "@/lib/month-summary/month";

/**
 * Obowiązująca stawka (GLOSSARY „Stawka”, spec #93) — jedyne miejsce, które ją rozstrzyga. Dane to
 * zmiany stawki z tabeli `public.rates`: stawka obowiązuje od wskazanego miesiąca, więc jej zmiana nie
 * przelicza minionych miesięcy; tylko pierwsza stawka ośrodka obowiązuje też wstecz.
 */

/** Jedna zmiana stawki (wiersz `public.rates`); miesiące jako `RRRR-MM`, kwoty w groszach. */
export interface RateChange {
  id: number;
  /** `null` — stawka ośrodka; inaczej stawka indywidualna jeźdźca (klucz = konto, #97). */
  riderKey: string | null;
  /** Miesiąc „od” `RRRR-MM`. */
  fromMonth: string;
  /** Grosze. `null` tylko przy stawce indywidualnej: od tego miesiąca wraca stawka ośrodka (#97). */
  amount: number | null;
}

/** Skąd pochodzi stawka jazd jeźdźca w miesiącu — dopisek „stawka ośrodka” / „stawka indywidualna”. */
export type RateSource = "stable" | "individual";

/** Stawka, po której liczą się wszystkie jazdy jeźdźca w jednym miesiącu. */
export interface EffectiveRate {
  /** Grosze za jedną jazdę. */
  amount: number;
  source: RateSource;
}

/** Zmiany stawki ośrodka z kwotą, od najwcześniejszej. */
function stableChanges(changes: readonly RateChange[]): (RateChange & { amount: number })[] {
  return changes
    .filter((change): change is RateChange & { amount: number } => change.riderKey === null && change.amount !== null)
    .sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
}

/**
 * Stawka ośrodka w miesiącu `RRRR-MM`: najpóźniejsza zmiana ośrodka z miesiącem „od” ≤ miesiąc, a gdy
 * żadnej — najwcześniejsza zmiana ośrodka (pierwsza stawka działa wstecz). `null` — ośrodek bez stawki.
 */
export function stableRateFor(changes: readonly RateChange[], month: string): EffectiveRate | null {
  const sorted = stableChanges(changes);
  const first = sorted.at(0);
  if (!first) {
    return null;
  }
  const inForce = sorted.filter((change) => change.fromMonth <= month).at(-1) ?? first;
  return { amount: inForce.amount, source: "stable" };
}

/** Zmiany stawki indywidualnej jeźdźca (także powroty do stawki ośrodka), od najwcześniejszej. */
function riderChanges(changes: readonly RateChange[], riderKey: string): RateChange[] {
  return changes
    .filter((change) => change.riderKey === riderKey)
    .sort((a, b) => a.fromMonth.localeCompare(b.fromMonth));
}

/**
 * Stawka jazd jeźdźca w miesiącu `RRRR-MM` (#97): najpóźniejsza zmiana jeźdźca z miesiącem „od” ≤ miesiąc
 * — z kwotą zastępuje stawkę ośrodka, pusta wraca do niej; bez takiej zmiany liczy się stawka ośrodka.
 * Stawka indywidualna nie działa wstecz. `riderKey` `null` (jeździec zanonimizowany) — stawka ośrodka.
 * `null` — ani stawki indywidualnej, ani stawki ośrodka.
 */
export function effectiveRate(
  changes: readonly RateChange[],
  month: string,
  riderKey: string | null,
): EffectiveRate | null {
  const inForce =
    riderKey === null
      ? undefined
      : riderChanges(changes, riderKey)
          .filter((change) => change.fromMonth <= month)
          .at(-1);
  if (inForce !== undefined && inForce.amount !== null) {
    return { amount: inForce.amount, source: "individual" };
  }
  return stableRateFor(changes, month);
}

/**
 * Zaplanowana zmiana stawki — od miesiąca późniejszego niż bieżący; można ją usunąć. `amount` `null`
 * tylko przy stawce jeźdźca: od tego miesiąca wraca stawka ośrodka.
 */
export interface PlannedRate {
  id: number;
  fromMonth: string;
  amount: number | null;
}

/** Stawka dziś i zaplanowana zmiana — karta stawki ośrodka („Rozliczenia”) i stawki jeźdźca (#97). */
export interface RateSchedule {
  /** Stawka w bieżącym miesiącu (ze źródłem); `null` — ośrodek bez stawki („Ustaw stawkę ośrodka”). */
  current: EffectiveRate | null;
  /** Zmiana od następnego miesiąca (baza nie przyjmie późniejszej); `null` — brak. */
  planned: PlannedRate | null;
}

/**
 * Stawka w bieżącym miesiącu (`RRRR-MM`, strefa ośrodka) i zaplanowana zmiana: `riderKey` `null` —
 * stawka ośrodka i jej zmiany; inaczej stawka, po której płaci jeździec, i zmiany tego jeźdźca.
 */
export function rateSchedule(
  changes: readonly RateChange[],
  riderKey: string | null,
  currentMonth: string,
): RateSchedule {
  const own = riderKey === null ? stableChanges(changes) : riderChanges(changes, riderKey);
  const planned = own.find((change) => change.fromMonth > currentMonth);
  return {
    current: effectiveRate(changes, currentMonth, riderKey),
    planned: planned ? { id: planned.id, fromMonth: planned.fromMonth, amount: planned.amount } : null,
  };
}

/** Wybór „od kiedy” w formularzu stawki — wartość pola `od` (polska, jak inne parametry w adresie). */
export const RATE_FROM = { current: "biezacy", next: "nastepny" } as const;
export type RateFrom = (typeof RATE_FROM)[keyof typeof RATE_FROM];

/** Miesiąc „od” (`RRRR-MM`) dla wyboru z formularza względem bieżącego miesiąca ośrodka. */
export function rateFromMonth(from: RateFrom, currentMonth: string): string {
  return from === RATE_FROM.current ? currentMonth : shiftMonth(currentMonth, 1);
}
