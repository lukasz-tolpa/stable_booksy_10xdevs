// PROTOTYPE — wspólne propsy wariantów rozliczenia jeźdźca (?variant=). Throwaway, gałąź prototype/rozliczenie-jezdzca-ux.
import type { SummaryRideRow } from "@/lib/month-summary/summary";
import type { RiderSettlementView } from "@/lib/settlements/rider";
import type { RiderRateView } from "@/lib/settlements/rider-rate";

export interface VariantProps {
  view: RiderSettlementView;
  riderRate: RiderRateView | null;
  riderKey: string;
  /** Oglądany miesiąc `RRRR-MM`. */
  month: string;
  /** Lista „Rozliczenia” tego miesiąca. */
  listHref: string;
  saved: boolean;
  error: string | null;
}

/** PROTOTYPE: jazdy pogrupowane po tygodniach (pon.–niedz.), z etykietą „3–9 lis”. */
export function groupByWeek(rows: SummaryRideRow[]): { key: string; label: string; rows: SummaryRideRow[] }[] {
  const fmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", timeZone: "UTC" });
  const groups = new Map<string, { key: string; label: string; rows: SummaryRideRow[] }>();
  for (const row of rows) {
    const d = new Date(`${row.day}T00:00:00Z`);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const key = monday.toISOString().slice(0, 10);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label:
          monday.getUTCMonth() === sunday.getUTCMonth()
            ? `${monday.getUTCDate()}–${fmt.format(sunday)}`
            : `${fmt.format(monday)} – ${fmt.format(sunday)}`,
        rows: [],
      });
    }
    groups.get(key)?.rows.push(row);
  }
  return [...groups.values()];
}

/** PROTOTYPE: liczba jazd na wartość (instruktor / koń), malejąco. */
export function countBy(rows: SummaryRideRow[], pick: (row: SummaryRideRow) => string | null): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const k = pick(row);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}
