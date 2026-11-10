/**
 * Statystyki ośrodka — jedyne miejsce, które cokolwiek liczy. Strona `.astro`
 * wyłącznie renderuje zwrócony model widoku (słownictwo: GLOSSARY.md).
 */

import { currentWarsawHour } from "@/lib/bookings/slots";
import { computeRiderRows, type StatsHorse, type StatsRider, type StatsRiderRow } from "@/lib/stats/riders";
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

export interface StatsInput {
  period: StatsPeriod;
  days: StatsScheduleDay[];
  bookings: StatsBooking[];
  /** Jeźdźcy występujący w zapisach — źródło nazw do tabeli jeźdźców. */
  riders: StatsRider[];
  /** Konie występujące w grafiku okresu — źródło nazw koni. */
  horses: StatsHorse[];
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
  };
}
