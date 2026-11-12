import type { DayBooking } from "@/lib/bookings/queries";
import { unknownInstructorName } from "@/lib/bookings/slots";

/**
 * Składanie wierszy listy zapisów dnia ośrodka (FR-005): godzina, instruktor, jeździec, koń.
 *
 * Koń przy zapisie jest opcjonalny (ADR-0002) — przydziela go ośrodek. Nazwy koni dokłada się
 * z listy stada, bo `bookings` wskazuje konia przez przydział do dnia, nie wprost.
 */

export interface BookingRow {
  hour: number;
  instructorName: string;
  riderName: string;
  /** Nazwa przydzielonego konia albo `NO_HORSE`. */
  horseName: string;
}

/**
 * Fallback dla profilu bez imienia i nazwiska — rejestracja go nie wymusza. Jedyna
 * definicja: ten sam tekst pokazują lista zapisów dnia i statystyki ośrodka.
 */
export const UNNAMED_RIDER = "(bez nazwiska)";

/** Zapis jeszcze bez przydzielonego konia na liście dnia ośrodka. */
export const NO_HORSE = "bez konia";

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
      instructorName: booking.instructorName ?? unknownInstructorName(booking.instructorId),
      riderName: booking.anonymised ? ANONYMISED_RIDER : (booking.riderName ?? UNNAMED_RIDER),
      horseName:
        booking.horseId === null ? NO_HORSE : (horseNames.get(booking.horseId) ?? unknownHorseName(booking.horseId)),
    }))
    .sort(
      (a, b) =>
        a.hour - b.hour ||
        a.instructorName.localeCompare(b.instructorName, "pl") ||
        a.riderName.localeCompare(b.riderName, "pl"),
    );
}
