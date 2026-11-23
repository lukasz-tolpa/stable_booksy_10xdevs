import { currentWarsawHour } from "@/lib/bookings/slots";
import { todayIso } from "@/lib/schedule/dates";
import { isActiveBooking } from "@/lib/bookings/status";
import type { BookingStatus } from "@/types";

/**
 * Jazda (GLOSSARY.md) — jedyna definicja w aplikacji: aktywny zapis, którego slot już się
 * skończył (Europe/Warsaw). Czytają ją Statystyki i Podsumowanie miesiąca, żeby ta sama jazda
 * liczyła się wszędzie tak samo. Ten sam próg „slot się skończył” trzyma w bazie
 * `private.booking_slot_ended` (zwolnienie przyszłych zapisów przy usunięciu konta).
 */

/**
 * Czas trwania slotu w godzinach. Dziś każdy slot trwa godzinę; wartość jest jawna,
 * żeby zmiana definicji slotu (FR-010) nie zmieniła znaczenia „godzin jazd".
 */
export const SLOT_DURATION_HOURS = 1;

/** Predykat „slot (dzień × godzina) już się skończył” — wynik `slotEndedAt(now)`. */
export type SlotEnded = (day: string, hour: number) => boolean;

/**
 * Predykat „godzina slotu już się skończyła" względem `now` w strefie ośrodka.
 * Godzina trwająca nie jest zakończona; kończąca się dokładnie teraz — jest.
 */
export function slotEndedAt(now: Date = new Date()): SlotEnded {
  const today = todayIso(now);
  const currentHour = currentWarsawHour(now);

  return (day, hour) => day < today || (day === today && hour + SLOT_DURATION_HOURS <= currentHour);
}

/** Zapis w zakresie, który rozstrzyga o jeździe: termin i status. */
export interface RideCandidate {
  day: string;
  hour: number;
  status: BookingStatus;
}

/** Czy zapis jest jazdą: aktywny, a jego slot już się skończył. */
export function isRide(booking: RideCandidate, ended: SlotEnded): boolean {
  return isActiveBooking(booking) && ended(booking.day, booking.hour);
}
