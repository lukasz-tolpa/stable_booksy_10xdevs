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

/** Zaplanowana zmiana stawki — od miesiąca późniejszego niż bieżący; można ją usunąć. */
export interface PlannedRate {
  id: number;
  fromMonth: string;
  amount: number;
}

/** Stawka ośrodka na górze strony „Rozliczenia”. */
export interface StableRateSchedule {
  /** Grosze w bieżącym miesiącu; `null` — ośrodek bez stawki („Ustaw stawkę ośrodka”). */
  current: number | null;
  /** Zmiana od następnego miesiąca (baza nie przyjmie późniejszej); `null` — brak. */
  planned: PlannedRate | null;
}

/** Stawka ośrodka w bieżącym miesiącu (`RRRR-MM`, strefa ośrodka) i zaplanowana zmiana. */
export function stableRateSchedule(changes: readonly RateChange[], currentMonth: string): StableRateSchedule {
  const planned = stableChanges(changes).find((change) => change.fromMonth > currentMonth);
  return {
    current: stableRateFor(changes, currentMonth)?.amount ?? null,
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
