import type { RiderBooking } from "@/lib/bookings/queries";

/**
 * Podział zapisów jeźdźca na „nadchodzące" (z akcją odwołania) i „historię"
 * (minione lub odwołane, bez akcji) — jedyna logika slice'a S-06.
 *
 * Próg „slot się zaczął" jest identyczny z regułą zapisu z S-04: slot o godzinie
 * <= bieżącej (Europe/Warsaw) w dniu dzisiejszym uznajemy za rozpoczęty.
 * `today`/`currentHour` są wstrzykiwane parametrami, żeby testy nie zależały
 * od zegara.
 */

export interface RiderBookingRow {
  id: number;
  day: string;
  hour: number;
  horseName: string;
  stableName: string;
  status: string;
}

export interface RiderBookingSections {
  /** Aktywne zapisy, które się nie zaczęły — sortowane rosnąco (data, godzina). */
  upcoming: RiderBookingRow[];
  /** Minione i odwołane — sortowane malejąco (najnowsze na górze). */
  history: RiderBookingRow[];
}

function byDayHourAsc(a: RiderBookingRow, b: RiderBookingRow): number {
  // Daty ISO porównują się poprawnie jako ciągi - ten sam idiom co `isPastDate`.
  if (a.day !== b.day) {
    return a.day < b.day ? -1 : 1;
  }
  return a.hour - b.hour;
}

export function splitRiderBookings(
  bookings: RiderBooking[],
  now: { today: string; currentHour: number },
): RiderBookingSections {
  const upcoming: RiderBookingRow[] = [];
  const history: RiderBookingRow[] = [];

  for (const booking of bookings) {
    const row: RiderBookingRow = {
      id: booking.id,
      day: booking.day,
      hour: booking.hour,
      horseName: booking.horseName ?? `(koń #${String(booking.horseId)})`,
      stableName: booking.stableName,
      status: booking.status,
    };

    const started = booking.day < now.today || (booking.day === now.today && booking.hour <= now.currentHour);
    if (booking.status === "active" && !started) {
      upcoming.push(row);
    } else {
      history.push(row);
    }
  }

  upcoming.sort(byDayHourAsc);
  history.sort((a, b) => byDayHourAsc(b, a));

  return { upcoming, history };
}
