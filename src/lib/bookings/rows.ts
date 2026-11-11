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

/**
 * Fallback dla profilu bez imienia i nazwiska — rejestracja go nie wymusza. Jedyna
 * definicja: ten sam tekst pokazują lista zapisów dnia i statystyki ośrodka.
 */
export const UNNAMED_RIDER = "(bez nazwiska)";

/**
 * Nazwa zastępcza konia, którego nie ma na liście stada. Taki koń nie powinien wystąpić
 * (FK przez `schedule_day_horses`), ale wiersz z identyfikatorem jest lepszy niż
 * wywrócenie listy albo tabeli. Jedyna definicja dla listy zapisów dnia i statystyk.
 */
export function unknownHorseName(horseId: number): string {
  return `(koń #${String(horseId)})`;
}

/** Miniony zapis, którego jeździec usunął konto (jeździec zanonimizowany, ADR-0001). */
const ANONYMISED_RIDER = "Usunięty jeździec";

export function composeBookingRows(bookings: DayBooking[], horses: { id: number; name: string }[]): BookingRow[] {
  const horseNames = new Map(horses.map((horse) => [horse.id, horse.name]));

  return bookings
    .map((booking) => ({
      hour: booking.hour,
      horseName: horseNames.get(booking.horseId) ?? unknownHorseName(booking.horseId),
      riderName: booking.anonymised ? ANONYMISED_RIDER : (booking.riderName ?? UNNAMED_RIDER),
    }))
    .sort((a, b) => a.hour - b.hour || a.horseName.localeCompare(b.horseName, "pl"));
}
