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
 * Kolejne wykluczenia wierszy (np. wiersz zbiorczy) dopisuje się w tym samym filtrze.
 */
export function buildTopRidersSeries(riderRows: StatsRiderRow[]): TopRiderPoint[] {
  return riderRows
    .filter((row) => row.rideHours > 0)
    .slice(0, TOP_RIDERS_LIMIT)
    .map((row) => ({ riderId: row.riderId, name: row.name, rideHours: row.rideHours }));
}

/**
 * Seria wykresu obciążenia koni: jeden słupek na wiersz tabeli koni, w jej kolejności
 * (od najbardziej obciążonego). Koń bez jazd zostaje z zerem, tak jak w tabeli.
 */
export function buildHorseWorkloadSeries(horseRows: StatsHorseRow[]): HorseWorkloadPoint[] {
  return horseRows.map((row) => ({ horseId: row.horseId, name: row.name, rideHours: row.rideHours }));
}
