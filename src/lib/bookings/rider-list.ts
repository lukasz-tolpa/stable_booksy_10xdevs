import type { RiderBooking } from "@/lib/bookings/queries";
import { slotEndedAt } from "@/lib/bookings/rides";
import { hasSlotStarted, unknownInstructorName } from "@/lib/bookings/slots";
import {
  bookingStateAt,
  cancelledByLabel,
  isActiveBooking,
  isPendingOrActive,
  type BookingState,
} from "@/lib/bookings/status";
import type { BookingStatus } from "@/types";

/**
 * Lista zapisów jeźdźca: podział na „nadchodzące" i „historię" (minione lub odwołane, bez akcji)
 * oraz podpisy wiersza — instruktor, koń albo informacja o oczekiwaniu na przydział, stan zapisu
 * („Czeka na przyjęcie”, „Wygasł — ośrodek nie zdecydował przed terminem”), kto odwołał.
 *
 * Nadchodzące: zapisy aktywne i oczekujące, których slot się nie zaczął (z odwołaniem), oraz wygasłe
 * (GLOSSARY „Wygaśnięcie zapisu”) i odrzucone („Odrzucony: <powód>”, GLOSSARY „Odrzucenie zapisu”) do końca
 * swojego slotu (bez odwołania); potem trafiają do historii jak odwołane.
 * Próg „slot się zaczął" to `hasSlotStarted` — ten sam co przy zapisie i odwołaniu, wygaśnięcie wyprowadza
 * `bookingStateAt`. `now` jest wstrzykiwane parametrem, żeby testy nie zależały od zegara.
 */

export interface RiderBookingRow {
  id: number;
  day: string;
  hour: number;
  stableName: string;
  instructorName: string;
  /** Koń albo informacja o przydziale; `null` przy zapisie odwołanym (koń jest tylko przy aktywnym). */
  horseLabel: string | null;
  status: BookingStatus;
  /** Stan widoczny dla jeźdźca — z wyprowadzonym wygaśnięciem (`bookingStateAt`). */
  state: BookingState;
  /** „Czeka na przyjęcie” / „Wygasł — ośrodek nie zdecydował przed terminem” / „Odrzucony: <powód>”; `null` przy aktywnym i odwołanym. */
  stateLabel: string | null;
  /** Wiersz ma „Odwołaj”: zapis aktywny albo oczekujący, którego slot się nie zaczął. */
  cancellable: boolean;
  /** „przez Ciebie" / „przez ośrodek" przy zapisie odwołanym, inaczej `null`. */
  cancelledByLabel: string | null;
}

export interface RiderBookingSections {
  /** Aktywne i oczekujące zapisy, które się nie zaczęły, i wygasłe albo odrzucone do końca slotu — rosnąco. */
  upcoming: RiderBookingRow[];
  /** Minione i odwołane — sortowane malejąco (najnowsze na górze). */
  history: RiderBookingRow[];
}

/** Przed przydziałem konia — żeby brak konia nie wyglądał na błąd (US 52). */
export const HORSE_PENDING = "Koń zostanie przydzielony";
/** Miniona jazda, do której ośrodek nie przydzielił konia. */
export const HORSE_NOT_ASSIGNED = "Bez przydzielonego konia";
/** Zapis oczekujący (GLOSSARY „Zapis oczekujący”). */
export const PENDING_LABEL = "Czeka na przyjęcie";
/** Zapis wygasły — ośrodek nie zdecydował do startu slotu (GLOSSARY „Wygaśnięcie zapisu”). */
export const EXPIRED_LABEL = "Wygasł — ośrodek nie zdecydował przed terminem";

/** Zapis odrzucony z powodem, który ośrodek podał albo który dało odrzucenie automatyczne („Brak miejsc”). */
export function rejectedLabel(reason: string): string {
  return `Odrzucony: ${reason}`;
}

const STATE_LABELS: Partial<Record<BookingState, string>> = { pending: PENDING_LABEL, expired: EXPIRED_LABEL };

function stateLabel(booking: RiderBooking, state: BookingState): string | null {
  // CHECK spójności: odrzucony zapis zawsze ma powód.
  if (state === "rejected") return rejectedLabel(booking.rejectionReason ?? "");
  return STATE_LABELS[state] ?? null;
}

function byDayHourAsc(a: RiderBookingRow, b: RiderBookingRow): number {
  // Daty ISO porównują się poprawnie jako ciągi - ten sam idiom co `isPastDate`.
  if (a.day !== b.day) {
    return a.day < b.day ? -1 : 1;
  }
  return a.hour - b.hour;
}

function horseLabel(booking: RiderBooking, state: BookingState, upcoming: boolean): string | null {
  // Zapis oczekujący ma konia tylko z zapisu (slot treningowy); przydziału ośrodka nie obiecuje.
  if (state === "pending") return booking.horseName;
  if (!isActiveBooking(booking)) return null;
  if (booking.horseName !== null) return booking.horseName;
  return upcoming ? HORSE_PENDING : HORSE_NOT_ASSIGNED;
}

function cancelledByLine(booking: RiderBooking): string | null {
  if (booking.status !== "cancelled") return null;
  // CHECK spójności: odwołany zapis zawsze ma `cancelled_by`.
  return cancelledByLabel(booking.cancelledBy ?? "rider", "rider");
}

export function splitRiderBookings(bookings: RiderBooking[], now: Date = new Date()): RiderBookingSections {
  const upcoming: RiderBookingRow[] = [];
  const history: RiderBookingRow[] = [];
  const ended = slotEndedAt(now);

  for (const booking of bookings) {
    const state = bookingStateAt(booking, now);
    const cancellable = isPendingOrActive({ status: state }) && !hasSlotStarted(booking.day, booking.hour, now);
    // Wygasły i odrzucony zostają widoczne do końca swojego slotu, potem są historią.
    const decided = state === "expired" || state === "rejected";
    const isUpcoming = cancellable || (decided && !ended(booking.day, booking.hour));
    const row: RiderBookingRow = {
      id: booking.id,
      day: booking.day,
      hour: booking.hour,
      stableName: booking.stableName,
      instructorName: booking.instructorName ?? unknownInstructorName(booking.instructorId),
      horseLabel: horseLabel(booking, state, isUpcoming),
      status: booking.status,
      state,
      stateLabel: stateLabel(booking, state),
      cancellable,
      cancelledByLabel: cancelledByLine(booking),
    };

    (isUpcoming ? upcoming : history).push(row);
  }

  upcoming.sort(byDayHourAsc);
  history.sort((a, b) => byDayHourAsc(b, a));

  return { upcoming, history };
}
