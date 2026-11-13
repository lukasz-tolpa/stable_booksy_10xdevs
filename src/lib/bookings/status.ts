import type { BookingStatus, CancelledBy, UserRole } from "@/types";

/**
 * Zawężanie kolumn `text` zapisu (`status`, `cancelled_by`) do unii domenowych i podpis
 * „kto odwołał". Jedna definicja dla listy dnia ośrodka, „Moich zapisów" i statystyk.
 *
 * Wartość spoza unii oznacza, że schemat dostał nową wartość, o której aplikacja nie wie —
 * wyjątek (strona loguje go i pokazuje stan awarii) jest lepszy niż ciche pominięcie albo
 * policzenie takiego zapisu.
 */

export function toBookingStatus(status: string): BookingStatus {
  if (status === "active" || status === "cancelled") return status;
  throw new Error(`Nieznany status zapisu: ${status}`);
}

/** `null` — zapis aktywny (CHECK `bookings_cancelled_by_consistency_check`). */
export function toCancelledBy(value: string | null): CancelledBy | null {
  if (value === null || value === "rider" || value === "stable") return value;
  throw new Error(`Nieznana strona odwołania zapisu: ${value}`);
}

const CANCELLED_BY_LABELS: Record<UserRole, Record<CancelledBy, string>> = {
  stable: { rider: "przez jeźdźca", stable: "przez ośrodek" },
  rider: { rider: "przez Ciebie", stable: "przez ośrodek" },
};

/** Podpis odwołanego zapisu: kto odwołał, z perspektywy oglądającego (`viewer`). */
export function cancelledByLabel(cancelledBy: CancelledBy, viewer: UserRole): string {
  return CANCELLED_BY_LABELS[viewer][cancelledBy];
}
