import { bookingStateAt } from "@/lib/bookings/status";
import type { SlotKind } from "@/lib/schedule/kind";

/**
 * „Zapisy do przyjęcia” ośrodka (#124, GLOSSARY „Zapis oczekujący”, „Przyjęcie zapisu”): zapisy oczekujące
 * jego slotów, najbliższe terminy na górze, pogrupowane po dniach. Zapis, którego slot się zaczął, jest
 * wygasły (`bookingStateAt`) i znika z listy — o nim ośrodek już nie decyduje. `now` jest wstrzykiwane.
 */

/** Zapis oczekujący z `get_pending_bookings` — jeździec, slot i zajęte miejsca slotu. */
export interface PendingBooking {
  id: number;
  day: string;
  hour: number;
  instructorId: number;
  instructorName: string;
  /** `null` — slotu nie ma już w grafiku. */
  placeName: string | null;
  kind: SlotKind;
  /** Limit miejsc slotu (0 — slotu nie ma w grafiku). */
  seats: number;
  /** Aktywne zapisy slotu. */
  taken: number;
  riderName: string | null;
  riderEmail: string | null;
  createdAt: string;
  /** Ośrodek odrzucił już ręcznie temu jeźdźcowi zapis na ten slot (#125, US 27). */
  rejectedBefore: boolean;
}

export interface PendingBookingRow {
  id: number;
  hour: number;
  riderName: string;
  /** `null` — adresu nie udało się odczytać. */
  riderEmail: string | null;
  instructorName: string;
  placeName: string;
  kind: SlotKind;
  freeSeats: number;
  seats: number;
  /** „Wcześniej odrzucony na ten slot” — ośrodek odrzucił już temu jeźdźcowi zapis na ten slot. */
  rejectedBefore: boolean;
}

export interface PendingBookingsDay {
  day: string;
  rows: PendingBookingRow[];
}

const UNKNOWN_RIDER = "(jeździec)";
const UNKNOWN_PLACE = "(plac)";

function byTerm(a: PendingBooking, b: PendingBooking): number {
  // Daty ISO i znaczniki czasu porównują się poprawnie jako ciągi.
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  if (a.hour !== b.hour) return a.hour - b.hour;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id - b.id;
}

export function composePendingBookings(bookings: PendingBooking[], now: Date = new Date()): PendingBookingsDay[] {
  const days: PendingBookingsDay[] = [];

  for (const booking of [...bookings].sort(byTerm)) {
    if (bookingStateAt({ status: "pending", day: booking.day, hour: booking.hour }, now) !== "pending") continue;

    let day = days.at(-1);
    if (day?.day !== booking.day) {
      day = { day: booking.day, rows: [] };
      days.push(day);
    }
    day.rows.push({
      id: booking.id,
      hour: booking.hour,
      riderName: booking.riderName ?? UNKNOWN_RIDER,
      riderEmail: booking.riderEmail,
      instructorName: booking.instructorName,
      placeName: booking.placeName ?? UNKNOWN_PLACE,
      kind: booking.kind,
      freeSeats: Math.max(0, booking.seats - booking.taken),
      seats: booking.seats,
      rejectedBefore: booking.rejectedBefore,
    });
  }

  return days;
}
