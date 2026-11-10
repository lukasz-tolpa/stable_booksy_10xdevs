/**
 * Polskie etykiety przedziałów serii czasowej: krótka pod słupek wykresu i pełna
 * do tabeli z danymi wykresu (tekstowy odpowiednik dla czytników ekranu).
 */

import type { TimeBucket, TimeGranularity } from "@/lib/stats/time-series";

export interface BucketLabels {
  short: string;
  long: string;
}

// Daty kalendarzowe, nie punkty w czasie - formatowane w UTC, żeby strefa środowiska
// nie przesunęła ich o dobę.
const dayFormat = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthFormat = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric", timeZone: "UTC" });

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** `2026-11-09` → `9.11` — zwarty zapis dnia pod słupek. */
function shortDay(iso: string): string {
  return `${String(Number(iso.slice(8, 10)))}.${iso.slice(5, 7)}`;
}

export function bucketLabels(bucket: TimeBucket, granularity: TimeGranularity): BucketLabels {
  if (granularity === "month") {
    return {
      short: `${bucket.from.slice(5, 7)}.${bucket.from.slice(0, 4)}`,
      long: monthFormat.format(toUtc(bucket.from)),
    };
  }

  if (granularity === "week" && bucket.from !== bucket.to) {
    return {
      short: shortDay(bucket.from),
      long: `${dayFormat.format(toUtc(bucket.from))} – ${dayFormat.format(toUtc(bucket.to))}`,
    };
  }

  return { short: shortDay(bucket.from), long: dayFormat.format(toUtc(bucket.from)) };
}

const GRANULARITY_NAMES: Record<TimeGranularity, { bucket: string; phrase: string }> = {
  day: { bucket: "Dzień", phrase: "dzień po dniu" },
  week: { bucket: "Tydzień", phrase: "tydzień po tygodniu" },
  month: { bucket: "Miesiąc", phrase: "miesiąc po miesiącu" },
};

/** Nazwa przedziału do nagłówka tabeli („Dzień") i do opisu wykresu („dzień po dniu"). */
export function granularityNames(granularity: TimeGranularity): { bucket: string; phrase: string } {
  return GRANULARITY_NAMES[granularity];
}
