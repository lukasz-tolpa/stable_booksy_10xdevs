/**
 * Podsumowanie miesiąca jeźdźca (`/jezdziec/podsumowanie`, #91): własne jazdy, osobno w każdym
 * ośrodku. Dane to zapisy jeźdźca z „Moje zapisy” (`getRiderBookings` zawężone do miesiąca), tu
 * mapowane na wspólny kształt `SummaryBooking`; jazdy odsiewa i składa rdzeń (`summary.ts`).
 */

import type { RiderBooking } from "@/lib/bookings/queries";
import { unknownInstructorName } from "@/lib/bookings/slots";
import { formatCount, RIDE_FORMS } from "@/lib/format";
import { monthSearch, type SummaryMonth } from "@/lib/month-summary/month";
import {
  composeMonthNav,
  composeSummaryList,
  emptyMonthText,
  monthRides,
  type MonthNav,
  type SummaryBooking,
  type SummaryRideRow,
} from "@/lib/month-summary/summary";

/** Strona Podsumowania miesiąca jeźdźca (miesiąc w `?miesiac=RRRR-MM`). */
export const RIDER_MONTH_SUMMARY_ROUTE = "/jezdziec/podsumowanie";

/** Klucz jeźdźca we wspólnym kształcie — wszystkie zapisy są jego własne, więc jeden dla wszystkich. */
const OWN_RIDER_KEY = "ja";

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

function summaryBooking(booking: RiderBooking): SummaryBooking {
  return {
    day: booking.day,
    hour: booking.hour,
    status: booking.status,
    riderKey: OWN_RIDER_KEY,
    riderName: null,
    instructor: {
      id: booking.instructorId,
      name: booking.instructorName ?? unknownInstructorName(booking.instructorId),
    },
    horseName: booking.horseName,
    stable: { id: booking.stableId, name: booking.stableName },
  };
}

/** Widok jeźdźca: ośrodek po ośrodku, ośrodki bez jazd pominięte. `now` jak w statystykach. */
export function composeRiderMonthSummary(input: RiderMonthSummaryInput, now: Date = new Date()): RiderMonthSummaryView {
  // Grupy po ośrodku (po identyfikatorze, nie po nazwie).
  const byStable = new Map<number, { name: string; bookings: SummaryBooking[] }>();
  for (const booking of input.bookings) {
    const group = byStable.get(booking.stableId);
    if (group) {
      group.bookings.push(summaryBooking(booking));
    } else {
      byStable.set(booking.stableId, { name: booking.stableName, bookings: [summaryBooking(booking)] });
    }
  }

  const stables: RiderStableSummary[] = [];
  for (const [stableId, group] of byStable) {
    const rides = monthRides(group.bookings, input.month, now);
    // Ośrodek bez jazd w miesiącu (same odwołania, nadchodzące, inny miesiąc) się nie pokazuje.
    if (rides.length === 0) {
      continue;
    }
    // Jeden jeździec, więc lista rdzenia ma jeden wiersz — jego jazdy w tym ośrodku, chronologicznie.
    const list = composeSummaryList(rides, { viewer: "rider", dayHref: null });
    stables.push({
      stableId,
      name: group.name,
      rides: list.rides,
      ridesText: formatCount(list.rides, RIDE_FORMS),
      list: list.rows.flatMap((row) => row.list),
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
