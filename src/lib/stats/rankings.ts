/**
 * Serie wykresów rankingowych strony statystyk: obciążenie koni i pierwsza dziesiątka
 * jeźdźców. Część modułu statystyk — wołana wyłącznie przez `computeStableStats`.
 *
 * Serie powstają z gotowych wierszy tabel, a nie z zapisów, więc wartość każdego słupka
 * jest z konstrukcji równa wartości w tabeli koni albo tabeli jeźdźców.
 */

import type { StatsRiderRow } from "@/lib/stats/riders";
import type { StatsHorseRow } from "@/lib/stats/stats";

/** Słupek wykresu obciążenia koni. */
export interface HorseWorkloadPoint {
  horseId: number;
  /** `null`, gdy konia nie ma na liście stada — strona pokazuje tekst zastępczy. */
  name: string | null;
  /** Obciążenie konia: godziny jazd tego konia w okresie. */
  rideHours: number;
}

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

/**
 * Seria wykresu obciążenia koni: jeden słupek na wiersz tabeli koni, w jej kolejności
 * (od najbardziej obciążonego). Koń bez jazd zostaje z zerem, tak jak w tabeli.
 */
export function buildHorseWorkloadSeries(horseRows: StatsHorseRow[]): HorseWorkloadPoint[] {
  return horseRows.map((row) => ({ horseId: row.horseId, name: row.name, rideHours: row.rideHours }));
}
