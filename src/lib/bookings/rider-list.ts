import type { RiderBooking } from "@/lib/bookings/queries";
import { hasSlotStarted, unknownInstructorName } from "@/lib/bookings/slots";

/**
 * Lista zapisów jeźdźca: podział na „nadchodzące" (z akcją odwołania) i „historię"
 * (minione lub odwołane, bez akcji) oraz podpisy wiersza — instruktor, koń albo informacja
 * o oczekiwaniu na przydział, kto odwołał.
 *
 * Próg „slot się zaczął" to `hasSlotStarted` — ten sam co przy zapisie i odwołaniu. `now`
 * jest wstrzykiwane parametrem, żeby testy nie zależały od zegara.
 */

export interface RiderBookingRow {
  id: number;
  day: string;
  hour: number;
  stableName: string;
  instructorName: string;
  /** Koń albo informacja o przydziale; `null` przy zapisie odwołanym (koń jest tylko przy aktywnym). */
  horseLabel: string | null;
  status: string;
  /** „przez Ciebie" / „przez ośrodek" przy zapisie odwołanym, inaczej `null`. */
  cancelledByLabel: string | null;
}

export interface RiderBookingSections {
  /** Aktywne zapisy, które się nie zaczęły — sortowane rosnąco (data, godzina). */
  upcoming: RiderBookingRow[];
  /** Minione i odwołane — sortowane malejąco (najnowsze na górze). */
  history: RiderBookingRow[];
}

/** Przed przydziałem konia — żeby brak konia nie wyglądał na błąd (US 52). */
export const HORSE_PENDING = "Koń zostanie przydzielony";
/** Miniona jazda, do której ośrodek nie przydzielił konia. */
export const HORSE_NOT_ASSIGNED = "Bez przydzielonego konia";

function byDayHourAsc(a: RiderBookingRow, b: RiderBookingRow): number {
  // Daty ISO porównują się poprawnie jako ciągi - ten sam idiom co `isPastDate`.
  if (a.day !== b.day) {
    return a.day < b.day ? -1 : 1;
  }
  return a.hour - b.hour;
}

function horseLabel(booking: RiderBooking, upcoming: boolean): string | null {
  if (booking.status === "cancelled") return null;
  if (booking.horseName !== null) return booking.horseName;
  return upcoming ? HORSE_PENDING : HORSE_NOT_ASSIGNED;
}

function cancelledByLabel(booking: RiderBooking): string | null {
  if (booking.status !== "cancelled") return null;
  return booking.cancelledBy === "stable" ? "przez ośrodek" : "przez Ciebie";
}

export function splitRiderBookings(bookings: RiderBooking[], now: Date = new Date()): RiderBookingSections {
  const upcoming: RiderBookingRow[] = [];
  const history: RiderBookingRow[] = [];

  for (const booking of bookings) {
    const isUpcoming = booking.status === "active" && !hasSlotStarted(booking.day, booking.hour, now);
    const row: RiderBookingRow = {
      id: booking.id,
      day: booking.day,
      hour: booking.hour,
      stableName: booking.stableName,
      instructorName: booking.instructorName ?? unknownInstructorName(booking.instructorId),
      horseLabel: horseLabel(booking, isUpcoming),
      status: booking.status,
      cancelledByLabel: cancelledByLabel(booking),
    };

    (isUpcoming ? upcoming : history).push(row);
  }

  upcoming.sort(byDayHourAsc);
  history.sort((a, b) => byDayHourAsc(b, a));

  return { upcoming, history };
}
