/**
 * Dane wykresów statystyk w kształcie, który rysuje `@/components/ui/BarChart.astro`. Typ słupka
 * żyje tutaj, żeby moduły w `src/lib` mogły go zwracać; komponent go re-eksportuje.
 */

import { formatHours } from "@/lib/format";
import type { RideHoursSeries } from "@/lib/stats/time-series";
import { bucketLabels } from "@/lib/stats/time-series-labels";

export interface BarChartItem {
  /** Krótka etykieta przy słupku (np. `9.11`, nazwa konia). */
  label: string;
  /** Pełna etykieta do tabeli i podpowiedzi; domyślnie `label`. */
  longLabel?: string;
  /** Wartość nieujemna — wyznacza długość słupka. */
  value: number;
  /** Wartość do odczytu (np. `3 h`); domyślnie liczba w zapisie polskim. */
  valueText?: string;
}

/** Słupki wykresu godzin jazd w czasie — po jednym na przedział serii, z jego etykietami. */
export function rideHoursBars(series: RideHoursSeries): BarChartItem[] {
  return series.buckets.map((bucket) => {
    const labels = bucketLabels(bucket, series.granularity);
    return {
      label: labels.short,
      longLabel: labels.long,
      value: bucket.rideHours,
      valueText: formatHours(bucket.rideHours),
    };
  });
}
