/**
 * Podsumowanie miesiąca właściciela (`/osrodek/podsumowanie`, #88): wszyscy jeźdźcy ośrodka.
 * Dane to wiersze statystyk (`getStatsRows` dla granic miesiąca — zapisy z instruktorem slotu),
 * stado i instruktorzy ośrodka; tu są mapowane na wspólny kształt `SummaryBooking`.
 */

import { unknownHorseName } from "@/lib/bookings/rows";
import { unknownInstructorName } from "@/lib/bookings/slots";
import { STABLE_DAY_BOOKINGS_ROUTE } from "@/lib/bookings/stable-redirect";
import { monthSearch, type SummaryMonth } from "@/lib/month-summary/month";
import {
  composeMonthSummary,
  monthRides,
  type MonthSummaryView,
  type SummaryBooking,
  type SummaryInstructor,
} from "@/lib/month-summary/summary";
import { MONTH_SUMMARY_TEXTS } from "@/lib/month-summary/texts";
import type { StatsRider } from "@/lib/stats/riders";
import type { StatsBooking, StatsHorse } from "@/lib/stats/stats";

/** Strona Podsumowania miesiąca właściciela (miesiąc w `?miesiac=RRRR-MM`). */
export const OWNER_MONTH_SUMMARY_ROUTE = "/osrodek/podsumowanie";

/** Parametr adresu z filtrem instruktora (`?instruktor=<id>`); brak albo pusty — wszyscy instruktorzy. */
export const INSTRUCTOR_PARAM = "instruktor";

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
  /** Surowa wartość `?instruktor=` — nieznany instruktor albo bez jazd w miesiącu daje wszystkich. */
  instructorParam?: string | null;
}

/** Pozycja listy wyboru instruktora; `value: ""` — „Wszyscy instruktorzy”. */
export interface InstructorFilterOption {
  value: string;
  label: string;
  selected: boolean;
}

/** Filtr instruktora (#89): formularz GET z wyborem instruktora. */
export interface InstructorFilter {
  options: InstructorFilterOption[];
}

/** Widok właściciela: podsumowanie (zawężone filtrem) i filtr instruktora. */
export interface OwnerMonthSummaryView extends MonthSummaryView {
  filter: InstructorFilter;
}

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

/** Adres Podsumowania miesiąca właściciela dla miesiąca `RRRR-MM`, z filtrem instruktora albo bez. */
export function ownerMonthHref(month: string, instructorId: number | null = null): string {
  const filter = instructorId === null ? "" : `&${INSTRUCTOR_PARAM}=${String(instructorId)}`;
  return `${OWNER_MONTH_SUMMARY_ROUTE}${monthSearch(month)}${filter}`;
}

/**
 * Widok właściciela: data jazdy prowadzi do Zapisów tego dnia. Filtr instruktora zawęża zapisy przed
 * podsumowaniem, a listę wyboru buduje z jazd całego miesiąca. Wybrany instruktor zostaje w adresach
 * strzałek miesiąca. `now` jak w statystykach.
 */
export function composeOwnerMonthSummary(input: OwnerMonthSummaryInput, now: Date = new Date()): OwnerMonthSummaryView {
  const bookings = ownerSummaryBookings(input);
  const instructors = rideInstructors(bookings, input.month, now);
  const selected = selectedInstructor(input.instructorParam, instructors);
  const summary = composeMonthSummary(
    {
      month: input.month,
      bookings: selected === null ? bookings : bookings.filter((booking) => booking.instructor.id === selected),
      viewer: "owner",
      monthHref: (month) => ownerMonthHref(month, selected),
      dayHref: (day) => `${STABLE_DAY_BOOKINGS_ROUTE}?dzien=${day}`,
    },
    now,
  );
  return { ...summary, filter: { options: filterOptions(instructors, selected) } };
}

/** Id z adresu, jeśli to instruktor z jazdami w miesiącu; inaczej `null` — wszyscy instruktorzy. */
function selectedInstructor(raw: string | null | undefined, instructors: SummaryInstructor[]): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return instructors.some((instructor) => instructor.id === id) ? id : null;
}

/** Instruktorzy, którzy mieli jazdy w miesiącu (także zdezaktywowani i właściciel), alfabetycznie. */
function rideInstructors(bookings: SummaryBooking[], month: SummaryMonth, now: Date): SummaryInstructor[] {
  const byId = new Map<number, SummaryInstructor>();
  for (const ride of monthRides(bookings, month, now)) {
    byId.set(ride.instructor.id, ride.instructor);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pl") || a.id - b.id);
}

function filterOptions(instructors: SummaryInstructor[], selected: number | null): InstructorFilterOption[] {
  return [
    { value: "", label: MONTH_SUMMARY_TEXTS.owner.filter.all, selected: selected === null },
    ...instructors.map((instructor) => ({
      value: String(instructor.id),
      label: instructor.name,
      selected: instructor.id === selected,
    })),
  ];
}
