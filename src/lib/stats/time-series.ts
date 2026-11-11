/**
 * Seria „godziny jazd w czasie" — część modelu widoku statystyk. Wołana wyłącznie
 * przez `computeStableStats`; komponent wykresu tylko ją rysuje.
 */

import { addDays } from "@/lib/schedule/dates";
import type { StatsPeriod } from "@/lib/stats/stats";

export type TimeGranularity = "day" | "week" | "month";

/** Przedział serii: zakres dat `RRRR-MM-DD` (oba krańce włącznie) i godziny jazd w nim. */
export interface TimeBucket {
  from: string;
  to: string;
  rideHours: number;
}

export interface RideHoursSeries {
  granularity: TimeGranularity;
  /** Przedziały pokrywają cały okres bez dziur, chronologicznie; bez jazd mają zero. */
  buckets: TimeBucket[];
}

/** Najdłuższy okres rysowany dniami: każdy pełny miesiąc kalendarzowy. */
export const MAX_DAYS_FOR_DAILY = 31;
/** Najdłuższy okres rysowany tygodniami: każde pełne półrocze kalendarzowe (lipiec–grudzień to 184 dni). */
export const MAX_DAYS_FOR_WEEKLY = 184;

const MS_PER_DAY = 86_400_000;

/** Daty to dni kalendarzowe, więc arytmetyka idzie przez UTC (wzorzec `@/lib/schedule/dates`). */
function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function periodLengthInDays(period: StatsPeriod): number {
  return Math.round((toUtc(period.to).getTime() - toUtc(period.from).getTime()) / MS_PER_DAY) + 1;
}

function granularityFor(days: number): TimeGranularity {
  if (days <= MAX_DAYS_FOR_DAILY) return "day";
  if (days <= MAX_DAYS_FOR_WEEKLY) return "week";
  return "month";
}

/** Ostatni dzień przedziału zaczynającego się w `from`, jeszcze bez przycięcia do okresu. */
function bucketEnd(from: string, granularity: TimeGranularity): string {
  if (granularity === "day") return from;

  const date = toUtc(from);
  if (granularity === "week") {
    // Tydzień kończy się w niedzielę (`getUTCDay() === 0`).
    return addDays(from, (7 - date.getUTCDay()) % 7);
  }

  // Dzień 0 następnego miesiąca to ostatni dzień bieżącego.
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/**
 * Seria dla okresu z dni jazd (`rideDays`: jeden wpis na jazdę) i czasu trwania jazdy.
 * Okres odwrócony („od" po „do") daje pustą serię.
 */
export function buildRideHoursSeries(period: StatsPeriod, rideDays: string[], hoursPerRide: number): RideHoursSeries {
  const granularity = granularityFor(periodLengthInDays(period));

  const buckets: TimeBucket[] = [];
  for (let from = period.from; from <= period.to; ) {
    const end = bucketEnd(from, granularity);
    const to = end < period.to ? end : period.to;
    buckets.push({ from, to, rideHours: 0 });
    from = addDays(to, 1);
  }

  for (const day of rideDays) {
    const bucket = buckets.find((candidate) => day >= candidate.from && day <= candidate.to);
    if (bucket) bucket.rideHours += hoursPerRide;
  }

  return { granularity, buckets };
}
