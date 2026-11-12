/**
 * Tłumaczenie kodów błędu bazy na komunikaty dla jeźdźca.
 *
 * Odpowiednik `scheduleErrorMessage`, w osobnym module, bo odbiorcą jest jeździec, nie
 * ośrodek. Guardraile żyją w bazie (migracja `20261114090000_bookings_on_instructor_seats.sql`);
 * aplikacja ich nie powiela, tylko interpretuje kody.
 */

/** Brak wolnych miejsc w slocie — wyzwalacz `bookings_seat_limit` (także slot z limitem zero). */
export const NO_SEATS_LEFT = "SB009";
/**
 * Drugi aktywny zapis jeźdźca na tę samą godzinę dnia — indeks `bookings_rider_hour_key`.
 * Jedyne 23505 osiągalne z zapisu jeźdźca (indeks konia dotyczy przydziału przez ośrodek).
 */
export const ALREADY_BOOKED_THIS_HOUR = "23505";
/** Godzina poza zakresem [open_hour, close_hour) — wyzwalacz `bookings_seat_limit`. */
export const HOUR_OUTSIDE_WORKING_HOURS = "23514";
/** Dzień grafiku albo slot instruktora zniknął w międzyczasie — wyzwalacz `bookings_seat_limit`. */
export const SCHEDULE_CHANGED = "23503";

const FALLBACK = "Nie udało się zapisać na jazdę. Spróbuj ponownie.";

/** Komunikat dla jeźdźca. Odmowa przy ostatnim miejscu to projektowany UX, nie awaria. */
export function bookingErrorMessage(code: string | undefined): string {
  switch (code) {
    case NO_SEATS_LEFT:
      return "W tym slocie nie ma już wolnych miejsc. Wybierz inny termin lub instruktora.";
    case ALREADY_BOOKED_THIS_HOUR:
      return "Masz już zapis o tej godzinie w tym ośrodku. Żeby jeździć u innego instruktora, najpierw odwołaj tamten zapis.";
    case HOUR_OUTSIDE_WORKING_HOURS:
      return "Wybrana godzina jest poza zakresem pracy ośrodka w tym dniu.";
    case SCHEDULE_CHANGED:
      return "Grafik ośrodka zmienił się w międzyczasie — instruktor nie prowadzi już jazdy o tej godzinie. Odśwież stronę i wybierz inny slot.";
    default:
      return FALLBACK;
  }
}
