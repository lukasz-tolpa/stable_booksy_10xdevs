import type { DayBooking } from "@/lib/bookings/queries";

/**
 * Składanie wierszy listy zapisów dnia (FR-005) — jedyna logika slice'a S-05.
 *
 * `bookings` nie ma klucza obcego wprost do `horses` (identyfikacja konia idzie
 * przez `schedule_day_horses`), więc nazwy koni dokłada się z listy stada —
 * ten sam wzorzec co widok slotów jeźdźca w S-04.
 */

export interface BookingRow {
  hour: number;
  horseName: string;
  riderName: string;
}

/** Fallback dla profilu bez imienia i nazwiska — rejestracja go nie wymusza. */
const UNNAMED_RIDER = "(bez nazwiska)";

export function composeBookingRows(bookings: DayBooking[], horses: { id: number; name: string }[]): BookingRow[] {
  const horseNames = new Map(horses.map((horse) => [horse.id, horse.name]));

  return bookings
    .map((booking) => ({
      hour: booking.hour,
      // Koń spoza listy stada nie powinien wystąpić (FK przez schedule_day_horses),
      // ale wiersz z identyfikatorem jest lepszy niż wywrócenie listy.
      horseName: horseNames.get(booking.horseId) ?? `(koń #${String(booking.horseId)})`,
      riderName: booking.riderName ?? UNNAMED_RIDER,
    }))
    .sort((a, b) => a.hour - b.hour || a.horseName.localeCompare(b.horseName, "pl"));
}
