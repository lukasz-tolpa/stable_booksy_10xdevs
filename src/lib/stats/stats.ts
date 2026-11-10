/**
 * Statystyki ośrodka — jedyne miejsce, które cokolwiek liczy. Strona `.astro`
 * wyłącznie renderuje zwrócony model widoku (słownictwo: GLOSSARY.md).
 */

import { currentWarsawHour } from "@/lib/bookings/slots";
import { computeRiderRows, type StatsRider, type StatsRiderRow } from "@/lib/stats/riders";
import { todayIso } from "@/lib/schedule/dates";

/** Okres statystyk: zakres dat `RRRR-MM-DD`, oba krańce włącznie. */
export interface StatsPeriod {
  from: string;
  to: string;
}

/** Dzień grafiku z godzinami pracy `[openHour, closeHour)` i końmi przydzielonymi do dnia. */
export interface StatsScheduleDay {
  day: string;
  openHour: number;
  closeHour: number;
  horseIds: number[];
}

/** Zapis (aktywny albo odwołany) z terminem: dniem grafiku i godziną. */
export interface StatsBooking {
  day: string;
  horseId: number;
  hour: number;
  status: string;
  /** Konto jeźdźca, który złożył zapis. */
  riderId: string;
}

/** Koń stadniny — aktywny albo zdezaktywowany; statystyki potrzebują tylko nazwy. */
export interface StatsHorse {
  id: number;
  name: string;
}

export interface StatsInput {
  period: StatsPeriod;
  days: StatsScheduleDay[];
  bookings: StatsBooking[];
  /** Jeźdźcy występujący w zapisach — źródło nazw do tabeli jeźdźców. */
  riders: StatsRider[];
  /** Wszystkie konie stadniny, także zdezaktywowane — historia okresu ich nie gubi. */
  horses: StatsHorse[];
}

/** Wiersz tabeli koni: obciążenie konia w okresie. */
export interface StatsHorseRow {
  horseId: number;
  /** `null`, gdy konia nie ma na liście stada — strona pokazuje tekst zastępczy. */
  name: string | null;
  rides: number;
  /** Obciążenie konia: godziny jazd tego konia w okresie. */
  rideHours: number;
}

export interface StatsSummary {
  /** Liczba jazd: aktywnych zapisów, których godzina już się skończyła. */
  rides: number;
  /** Godziny jazd: suma czasu trwania jazd. */
  rideHours: number;
  /**
   * Obłożenie grafiku w procentach (jazdy ÷ minione wystawione sloty), zaokrąglone
   * do całości. `null` = brak danych: w okresie nie ma ani jednego minionego slotu.
   */
  occupancyPercent: number | null;
  /**
   * Odwołania przypisane do okresu według terminu zapisu, nie daty odwołania —
   * liczone dopiero, gdy godzina odwołanego slotu już się skończyła.
   */
  cancellations: number;
}

/** Kompletny model widoku strony statystyk; kolejne sekcje dokładają tu swoje pola. */
export interface StatsView {
  summary: StatsSummary;
  /** Tabela jeźdźców, od najaktywniejszego; jej sumy zgadzają się z podsumowaniem. */
  riders: StatsRiderRow[];
  /** Okres bez jazd i odwołań — strona pokazuje stan pusty zamiast zer. */
  isEmpty: boolean;
  /** Tabela koni, od najbardziej obciążonego. */
  horses: StatsHorseRow[];
}

/**
 * Czas trwania slotu w godzinach. Dziś każdy slot trwa godzinę; wartość jest jawna,
 * żeby zmiana definicji slotu (FR-010) nie zmieniła znaczenia „godzin jazd".
 */
export const SLOT_DURATION_HOURS = 1;

/** Czy dzień leży w okresie — porównanie leksykograficzne dat `RRRR-MM-DD`. */
function inPeriod(day: string, period: StatsPeriod): boolean {
  return day >= period.from && day <= period.to;
}

/**
 * Predykat „godzina slotu już się skończyła" względem `now` w strefie ośrodka.
 * Godzina trwająca nie jest zakończona; kończąca się dokładnie teraz — jest.
 */
function slotEndedAt(now: Date): (day: string, hour: number) => boolean {
  const today = todayIso(now);
  const currentHour = currentWarsawHour(now);

  return (day, hour) => day < today || (day === today && hour + SLOT_DURATION_HOURS <= currentHour);
}

/**
 * Model widoku statystyk dla okresu. `now` jest wstrzykiwane parametrem (wzorzec
 * `todayIso(now)`), a „teraz" liczone w strefie `Europe/Warsaw`.
 *
 * Wiersze spoza okresu są ignorowane, więc wołający nie musi ich odfiltrować.
 */
export function computeStableStats(input: StatsInput, now: Date = new Date()): StatsView {
  const ended = slotEndedAt(now);
  // Statystyki opisują wyłącznie przeszłość: i jazda, i odwołanie liczą się dopiero,
  // gdy godzina slotu już się skończyła.
  const pastBookings = input.bookings.filter(
    (booking) => inPeriod(booking.day, input.period) && ended(booking.day, booking.hour),
  );

  const rideBookings = pastBookings.filter((booking) => booking.status === "active");
  // Odwołanie liczy się według terminu zapisu, bez względu na to, kiedy je kliknięto.
  const cancelledBookings = pastBookings.filter((booking) => booking.status === "cancelled");
  const rides = rideBookings.length;
  const cancellations = cancelledBookings.length;

  // Wystawiony slot to para (godzina z zakresu pracy dnia, koń przydzielony do dnia);
  // do mianownika obłożenia wchodzą tylko sloty, których godzina już minęła.
  let pastSlots = 0;
  for (const day of input.days) {
    if (!inPeriod(day.day, input.period)) continue;
    for (let hour = day.openHour; hour < day.closeHour; hour++) {
      if (ended(day.day, hour)) pastSlots += day.horseIds.length;
    }
  }

  return {
    summary: {
      rides,
      rideHours: rides * SLOT_DURATION_HOURS,
      occupancyPercent: pastSlots === 0 ? null : Math.round((rides / pastSlots) * 100),
      cancellations,
    },
    riders: computeRiderRows({
      rides: rideBookings,
      cancellations: cancelledBookings,
      riders: input.riders,
      horses: input.horses,
      slotDurationHours: SLOT_DURATION_HOURS,
    }),
    isEmpty: rides === 0 && cancellations === 0,
    horses: computeHorseRows(input, ended),
  };
}

// --- Tabela koni (obciążenie konia) ---

/**
 * Wiersze tabeli koni. W tabeli jest każdy koń, który w okresie miał jazdę albo był
 * przydzielony do dnia grafiku z co najmniej jednym minionym slotem — koń stojący
 * bezczynnie dostaje zero. Koń przydzielony wyłącznie do godzin, które jeszcze nie
 * minęły, nie jest „bezczynny": statystyki opisują tylko to, co się odbyło.
 *
 * Aktywność konia nie ma znaczenia — zdezaktywowany po okresie zostaje w historii.
 * Kolejność: godziny jazd malejąco, potem liczba jazd, potem nazwa.
 */
function computeHorseRows(input: StatsInput, ended: (day: string, hour: number) => boolean): StatsHorseRow[] {
  const ridesByHorse = new Map<number, number>();

  for (const day of input.days) {
    if (!inPeriod(day.day, input.period)) continue;
    // Godziny pracy rosną, więc dzień ma miniony slot dokładnie wtedy, gdy minął pierwszy.
    if (day.openHour >= day.closeHour || !ended(day.day, day.openHour)) continue;
    for (const horseId of day.horseIds) {
      if (!ridesByHorse.has(horseId)) ridesByHorse.set(horseId, 0);
    }
  }

  for (const booking of input.bookings) {
    if (!inPeriod(booking.day, input.period)) continue;
    if (booking.status !== "active" || !ended(booking.day, booking.hour)) continue;
    ridesByHorse.set(booking.horseId, (ridesByHorse.get(booking.horseId) ?? 0) + 1);
  }

  const names = new Map(input.horses.map((horse) => [horse.id, horse.name]));
  const rows = [...ridesByHorse].map(
    ([horseId, rides]): StatsHorseRow => ({
      horseId,
      name: names.get(horseId) ?? null,
      rides,
      rideHours: rides * SLOT_DURATION_HOURS,
    }),
  );

  return rows.sort(
    (a, b) =>
      b.rideHours - a.rideHours ||
      b.rides - a.rides ||
      (a.name ?? "").localeCompare(b.name ?? "", "pl") ||
      a.horseId - b.horseId,
  );
}
