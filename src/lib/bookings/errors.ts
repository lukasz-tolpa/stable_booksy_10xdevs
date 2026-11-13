/**
 * Tłumaczenie kodów błędu bazy na komunikaty dla jeźdźca.
 *
 * Odpowiednik `scheduleErrorMessage`, w osobnym module, bo odbiorcą jest jeździec, nie
 * ośrodek. Guardraile żyją w bazie (migracja `20261114090000_bookings_on_instructor_seats.sql`);
 * aplikacja ich nie powiela, tylko interpretuje kody — a tam, gdzie kilka ograniczeń dzieli
 * jeden SQLSTATE, także nazwę ograniczenia (`errorConstraint`).
 */

/** Brak wolnych miejsc w slocie — wyzwalacz `bookings_seat_limit` (także slot z limitem zero). */
export const NO_SEATS_LEFT = "SB009";
/**
 * Naruszenie indeksu unikalnego: drugi aktywny zapis jeźdźca na tę samą godzinę dnia
 * (`bookings_rider_hour_key`) albo koń zajęty o tej godzinie (`bookings_horse_hour_key`).
 */
export const ALREADY_BOOKED_THIS_HOUR = "23505";
/** Godzina poza zakresem [open_hour, close_hour) — wyzwalacz `bookings_seat_limit` (bez nazwy ograniczenia). */
export const HOUR_OUTSIDE_WORKING_HOURS = "23514";
/** Dzień grafiku albo slot instruktora zniknął w międzyczasie — wyzwalacz `bookings_seat_limit` albo FK. */
export const SCHEDULE_CHANGED = "23503";

const RIDER_HOUR_KEY = "bookings_rider_hour_key";
const HORSE_HOUR_KEY = "bookings_horse_hour_key";
/** CHECK zakresu godziny — jedyny CHECK z 23514, który mówi o godzinie. */
const HOUR_CHECK = "bookings_hour_check";

const FALLBACK = "Nie udało się zapisać na jazdę. Spróbuj ponownie.";

/**
 * Komunikat dla jeźdźca. Odmowa przy ostatnim miejscu to projektowany UX, nie awaria.
 * `constraint` — nazwa naruszonego ograniczenia (`errorConstraint`), gdy baza ją podała.
 */
export function bookingErrorMessage(code: string | undefined, constraint?: string): string {
  switch (code) {
    case NO_SEATS_LEFT:
      return "W tym slocie nie ma już wolnych miejsc. Wybierz inną godzinę albo innego instruktora.";
    case ALREADY_BOOKED_THIS_HOUR:
      if (constraint === RIDER_HOUR_KEY) {
        return "Masz już zapis o tej godzinie w tym ośrodku. Żeby jeździć u innego instruktora, najpierw odwołaj tamten zapis.";
      }
      if (constraint === HORSE_HOUR_KEY) {
        return "Koń przydzielony do tej jazdy jest już zajęty o tej godzinie. Odśwież stronę i wybierz inny slot.";
      }
      return FALLBACK;
    case HOUR_OUTSIDE_WORKING_HOURS:
      return constraint === undefined || constraint === HOUR_CHECK
        ? "Wybrana godzina jest poza zakresem pracy ośrodka w tym dniu."
        : FALLBACK;
    case SCHEDULE_CHANGED:
      return "Grafik ośrodka zmienił się w międzyczasie — instruktor nie prowadzi już jazdy o tej godzinie. Odśwież stronę i wybierz inny slot.";
    default:
      return FALLBACK;
  }
}
