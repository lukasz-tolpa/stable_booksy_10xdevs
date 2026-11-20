/**
 * Podsumowanie miesiąca jeźdźca (`/jezdziec/podsumowanie`, #91): własne jazdy, osobno w każdym
 * ośrodku. Dane to zapisy jeźdźca z „Moje zapisy” (`getRiderBookings` zawężone do miesiąca); jazdy
 * odsiewa (`monthRides`) i ich wiersze składa (`composeRideRows`) rdzeń (`summary.ts`). Jeździec jest
 * jeden, więc lista jeźdźców i jej klucz nie są potrzebne.
 */

import { RIDER_MONTH_SUMMARY_ROUTE } from "@/lib/auth/roles";
import type { RiderBooking } from "@/lib/bookings/queries";
import { unknownInstructorName } from "@/lib/bookings/slots";
import { formatCount, RIDE_FORMS } from "@/lib/format";
import { monthSearch, type SummaryMonth } from "@/lib/month-summary/month";
import {
  composeMonthNav,
  composeRideRows,
  emptyMonthText,
  monthRides,
  type MonthNav,
  type SummaryRideRow,
  type SummaryRideSource,
} from "@/lib/month-summary/summary";

export interface RiderMonthSummaryInput {
  month: SummaryMonth;
  /** Zapisy jeźdźca (każdy status); liczą się tylko jazdy z dni miesiąca. */
  bookings: RiderBooking[];
}

/** Jazdy jeźdźca w jednym ośrodku. */
export interface RiderStableSummary {
  stableId: number;
  name: string;
  rides: number;
  /** Np. `3 jazdy`. */
  ridesText: string;
  /** Jazdy chronologicznie, zawsze tyle, ile `rides`; data bez linku. */
  list: SummaryRideRow[];
}

export interface RiderMonthSummaryView {
  nav: MonthNav;
  /** Tylko ośrodki z jazdami w miesiącu, alfabetycznie. */
  stables: RiderStableSummary[];
  /** Miesiąc bez żadnej jazdy — strona pokazuje `EmptyState` z `emptyText`. */
  isEmpty: boolean;
  /** Np. `W październiku 2026 nie jeździłeś.` */
  emptyText: string;
}

/** Adres Podsumowania miesiąca jeźdźca dla miesiąca `RRRR-MM`. */
export function riderMonthHref(month: string): string {
  return `${RIDER_MONTH_SUMMARY_ROUTE}${monthSearch(month)}`;
}

function rideSource(booking: RiderBooking): SummaryRideSource {
  return {
    day: booking.day,
    hour: booking.hour,
    instructor: {
      id: booking.instructorId,
      name: booking.instructorName ?? unknownInstructorName(booking.instructorId),
    },
    horseName: booking.horseName,
  };
}

/** Widok jeźdźca: ośrodek po ośrodku, ośrodki bez jazd pominięte. `now` jak w statystykach. */
export function composeRiderMonthSummary(input: RiderMonthSummaryInput, now: Date = new Date()): RiderMonthSummaryView {
  // Grupy po ośrodku (po identyfikatorze, nie po nazwie).
  const byStable = new Map<number, { name: string; bookings: RiderBooking[] }>();
  for (const booking of input.bookings) {
    const group = byStable.get(booking.stableId);
    if (group) {
      group.bookings.push(booking);
    } else {
      byStable.set(booking.stableId, { name: booking.stableName, bookings: [booking] });
    }
  }

  const stables: RiderStableSummary[] = [];
  for (const [stableId, group] of byStable) {
    const rides = monthRides(group.bookings, input.month, now);
    // Ośrodek bez jazd w miesiącu (same odwołania, nadchodzące, inny miesiąc) się nie pokazuje.
    if (rides.length === 0) {
      continue;
    }
    stables.push({
      stableId,
      name: group.name,
      rides: rides.length,
      ridesText: formatCount(rides.length, RIDE_FORMS),
      list: composeRideRows(rides.map(rideSource), { viewer: "rider", dayHref: null }),
    });
  }
  stables.sort((a, b) => a.name.localeCompare(b.name, "pl") || a.stableId - b.stableId);

  return {
    nav: composeMonthNav(input.month, riderMonthHref),
    stables,
    isEmpty: stables.length === 0,
    emptyText: emptyMonthText(input.month, "rider"),
  };
}
