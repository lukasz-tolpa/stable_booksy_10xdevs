/**
 * Tłumaczenie kodów błędu bazy przy przydziale konia przez ośrodek (#42) na komunikaty.
 *
 * Osobno od `bookingErrorMessage` (odbiorcą jest jeździec) i `scheduleErrorMessage` (zapis
 * grafiku). Gwarancje żyją w bazie (migracje `20261114090000_bookings_on_instructor_seats.sql`
 * i `20261115090000_horse_assignment_by_stable.sql`); aplikacja tylko interpretuje kody.
 * UPDATE samego `horse_id` nie dotyka indeksu jeźdźca ani limitu miejsc, więc każdy z tych
 * kodów ma przy przydziale jedno źródło.
 */

/** Koń ma już aktywny zapis o tej godzinie dnia — indeks `bookings_horse_hour_key`. */
export const HORSE_TAKEN_THIS_HOUR = "23505";
/** Koń nie pracuje tego dnia — FK `bookings_assigned_horse_fkey` do `schedule_day_horses`. */
export const HORSE_NOT_WORKING_THIS_DAY = "23503";
/** Zapis nie jest już aktywny — CHECK `bookings_horse_only_when_active_check`. */
export const BOOKING_NOT_ACTIVE = "23514";

const FALLBACK = "Nie udało się przydzielić konia. Spróbuj ponownie.";

export function horseAssignmentErrorMessage(code: string | undefined): string {
  switch (code) {
    case HORSE_TAKEN_THIS_HOUR:
      return "Ten koń ma już jazdę o tej godzinie. Wybierz innego konia albo najpierw zmień tamten przydział.";
    case HORSE_NOT_WORKING_THIS_DAY:
      return "Ten koń nie pracuje tego dnia. Dodaj go w grafiku dnia albo wybierz innego.";
    case BOOKING_NOT_ACTIVE:
      return "Zapis został odwołany — konia przydziela się tylko do aktywnych zapisów.";
    default:
      return FALLBACK;
  }
}
