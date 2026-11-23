import { hasSlotStarted } from "@/lib/bookings/slots";
import type { BookingStatus, CancelledBy, UserRole } from "@/types";

/**
 * Stan zapisu (GLOSSARY „Zapis”): zawężanie kolumn `text` (`status`, `cancelled_by`) do unii
 * domenowych, stan wyprowadzony „wygasły”, wspólna reguła „tylko aktywne” i podpis „kto odwołał”.
 * Jedna definicja dla listy dnia ośrodka, „Moich zapisów”, statystyk, panelu i podsumowań.
 *
 * Wartość spoza unii oznacza, że schemat dostał nową wartość, o której aplikacja nie wie —
 * wyjątek (strona loguje go i pokazuje stan awarii) jest lepszy niż ciche pominięcie albo
 * policzenie takiego zapisu.
 */

const BOOKING_STATUSES: readonly BookingStatus[] = ["pending", "active", "rejected", "cancelled"];

export function toBookingStatus(status: string): BookingStatus {
  const known = BOOKING_STATUSES.find((entry) => entry === status);
  if (known !== undefined) return known;
  throw new Error(`Nieznany status zapisu: ${status}`);
}

/** `null` — zapis nieodwołany (CHECK `bookings_cancelled_by_consistency_check`). */
export function toCancelledBy(value: string | null): CancelledBy | null {
  if (value === null || value === "rider" || value === "stable") return value;
  throw new Error(`Nieznana strona odwołania zapisu: ${value}`);
}

/**
 * Stan zapisu widoczny w aplikacji: stan z bazy albo `expired` — zapis oczekujący, o którym ośrodek
 * nie zdecydował do startu slotu (GLOSSARY „Wygaśnięcie zapisu”). Wygaśnięcie nie jest zapisywane
 * w bazie, tylko wyprowadzane przy odczycie z tym samym progiem co zapis i odwołanie (`hasSlotStarted`).
 */
export type BookingState = BookingStatus | "expired";

export function bookingStateAt(
  booking: { status: BookingStatus; day: string; hour: number },
  now: Date = new Date(),
): BookingState {
  if (booking.status === "pending" && hasSlotStarted(booking.day, booking.hour, now)) return "expired";
  return booking.status;
}

/**
 * Reguła „tylko aktywne” (ADR 0006): miejsce w slocie zajmuje wyłącznie zapis aktywny. Każdy odczyt,
 * który liczy albo pokazuje zajęte miejsca i jazdy, filtruje przez nią — zapis oczekujący, odrzucony
 * ani odwołany nie zmienia żadnej liczby. W SQL to samo robi warunek `status = 'active'`.
 */
export function isActiveBooking(booking: { status: BookingStatus }): boolean {
  return booking.status === "active";
}

/**
 * Odwołanie, które liczą statystyki odwołań: odwołany zapis, który był przyjęty (aktywny) —
 * znacznik `wasAccepted` z kolumny `bookings.accepted_at`. Wycofanie zapisu oczekującego nie
 * jest odwołaniem jazdy.
 */
export function isCancellationOfAccepted(booking: { status: BookingStatus; wasAccepted: boolean }): boolean {
  return booking.status === "cancelled" && booking.wasAccepted;
}

const CANCELLED_BY_LABELS: Record<UserRole, Record<CancelledBy, string>> = {
  instructor: { rider: "przez jeźdźca", stable: "przez ośrodek" },
  rider: { rider: "przez Ciebie", stable: "przez ośrodek" },
};

/** Podpis odwołanego zapisu: kto odwołał, z perspektywy oglądającego (`viewer`). */
export function cancelledByLabel(cancelledBy: CancelledBy, viewer: UserRole): string {
  return CANCELLED_BY_LABELS[viewer][cancelledBy];
}
