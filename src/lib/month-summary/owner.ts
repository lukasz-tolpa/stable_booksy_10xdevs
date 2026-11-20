/**
 * Podsumowanie miesiąca właściciela (`/osrodek/podsumowanie`, #88): wszyscy jeźdźcy ośrodka.
 * Dane to wiersze statystyk (`getStatsRows` dla granic miesiąca — zapisy z instruktorem slotu),
 * stado i instruktorzy ośrodka; tu są mapowane na wspólny kształt `SummaryBooking`.
 */

import { unknownHorseName } from "@/lib/bookings/rows";
import { unknownInstructorName } from "@/lib/bookings/slots";
import { STABLE_DAY_BOOKINGS_ROUTE } from "@/lib/bookings/stable-redirect";
import { monthSearch, type SummaryMonth } from "@/lib/month-summary/month";
import { composeMonthSummary, type MonthSummaryView, type SummaryBooking } from "@/lib/month-summary/summary";
import type { StatsRider } from "@/lib/stats/riders";
import type { StatsBooking, StatsHorse } from "@/lib/stats/stats";

/** Strona Podsumowania miesiąca właściciela (miesiąc w `?miesiac=RRRR-MM`). */
export const OWNER_MONTH_SUMMARY_ROUTE = "/osrodek/podsumowanie";

export interface OwnerMonthSummaryInput {
  month: SummaryMonth;
  /** Zapisy ośrodka z dni miesiąca (`getStatsRows`), także odwołane — liczą się tylko jazdy. */
  bookings: StatsBooking[];
  /** Jeźdźcy z tych zapisów — źródło nazw. */
  riders: StatsRider[];
  /** Wszystkie konie stadniny, także zdezaktywowane (`listStableHorses`) — źródło nazw. */
  horses: StatsHorse[];
  /** Wszyscy instruktorzy ośrodka, także zdezaktywowani (`listStableInstructors`) — źródło nazw. */
  instructors: { id: number; name: string }[];
}

/** Widok właściciela — kolejne zadania (filtr instruktora, #89) dokładają tu swoje pola. */
export type OwnerMonthSummaryView = MonthSummaryView;

/** Zapisy ośrodka we wspólnym kształcie podsumowania: nazwy jeźdźca, instruktora i konia rozwiązane. */
export function ownerSummaryBookings(input: OwnerMonthSummaryInput): SummaryBooking[] {
  const riderNames = new Map(input.riders.map((rider) => [rider.id, rider.name]));
  const horseNames = new Map(input.horses.map((horse) => [horse.id, horse.name]));
  const instructorNames = new Map(input.instructors.map((instructor) => [instructor.id, instructor.name]));

  return input.bookings.map((booking) => ({
    day: booking.day,
    hour: booking.hour,
    status: booking.status,
    riderKey: booking.riderId,
    riderName: booking.riderId === null ? null : (riderNames.get(booking.riderId) ?? null),
    instructor: {
      id: booking.instructorId,
      name: instructorNames.get(booking.instructorId) ?? unknownInstructorName(booking.instructorId),
    },
    horseName: booking.horseId === null ? null : (horseNames.get(booking.horseId) ?? unknownHorseName(booking.horseId)),
  }));
}

/** Adres Podsumowania miesiąca właściciela dla miesiąca `RRRR-MM`. */
export function ownerMonthHref(month: string): string {
  return `${OWNER_MONTH_SUMMARY_ROUTE}${monthSearch(month)}`;
}

/** Widok właściciela: data jazdy prowadzi do Zapisów tego dnia. `now` jak w statystykach. */
export function composeOwnerMonthSummary(input: OwnerMonthSummaryInput, now: Date = new Date()): OwnerMonthSummaryView {
  return composeMonthSummary(
    {
      month: input.month,
      bookings: ownerSummaryBookings(input),
      viewer: "owner",
      monthHref: ownerMonthHref,
      dayHref: (day) => `${STABLE_DAY_BOOKINGS_ROUTE}?dzien=${day}`,
    },
    now,
  );
}
