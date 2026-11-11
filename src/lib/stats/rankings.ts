/**
 * Seria wykresu pierwszej dziesiątki jeźdźców. Część modułu statystyk — wołana
 * wyłącznie przez `computeStableStats`.
 *
 * Seria powstaje z gotowych wierszy tabeli jeźdźców, a nie z zapisów, więc wartość
 * każdego słupka jest z konstrukcji równa wartości w tabeli. Wykres obciążenia koni
 * nie ma własnej serii: strona rysuje go wprost z wierszy tabeli koni.
 */

import type { StatsRiderRow } from "@/lib/stats/riders";

/** Ilu jeźdźców mieści wykres „pierwsza dziesiątka". */
export const TOP_RIDERS_LIMIT = 10;

/** Słupek wykresu pierwszej dziesiątki jeźdźców. */
export interface TopRiderPoint {
  /** Konto jeźdźca — dwie osoby o tej samej nazwie to dwa słupki. */
  riderId: string;
  name: string;
  rideHours: number;
}

/**
 * Seria wykresu pierwszej dziesiątki jeźdźców według godzin jazd — jedyne miejsce,
 * które decyduje, które wiersze tabeli jeźdźców trafiają na wykres. Kolejność jest
 * kolejnością tabeli (od najaktywniejszego).
 *
 * Jeździec bez godzin jazd (same odwołania) nie należy do rankingu według godzin jazd.
 * Wiersz zbiorczy „Usunięci jeźdźcy" (`riderId === null`) też nie: to suma wielu osób,
 * nie jeździec (ADR-0001).
 */
export function buildTopRidersSeries(riderRows: StatsRiderRow[]): TopRiderPoint[] {
  const points: TopRiderPoint[] = [];

  for (const row of riderRows) {
    if (row.riderId === null || row.rideHours <= 0) continue;
    if (points.length === TOP_RIDERS_LIMIT) break;
    points.push({ riderId: row.riderId, name: row.name, rideHours: row.rideHours });
  }

  return points;
}
