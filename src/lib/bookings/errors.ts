/**
 * Tłumaczenie kodów błędu bazy na komunikaty dla jeźdźca.
 *
 * Odpowiednik `scheduleErrorMessage` z S-02, w osobnym module, bo odbiorcą jest
 * jeździec, nie ośrodek. Guardraile żyją w bazie (F-01); aplikacja ich nie powiela,
 * tylko interpretuje kody. Sam kod wystarcza — w odróżnieniu od SB002 nie ma tu
 * niczego do wyciągania z treści komunikatu bazy.
 */

/** Dubel slotu z częściowego indeksu `bookings_active_slot_key` (F-01). */
export const SLOT_TAKEN = "23505";
/** Godzina poza zakresem [open_hour, close_hour) — trigger z F-01. */
export const HOUR_OUTSIDE_WORKING_HOURS = "23514";
/** Koń nie pracuje już tego dnia albo dzień grafiku zniknął — złożony FK / trigger z F-01. */
export const SCHEDULE_CHANGED = "23503";

const FALLBACK = "Nie udało się zapisać na jazdę. Spróbuj ponownie.";

/** Komunikat dla jeźdźca. Odmowa współbieżna (23505) to projektowany UX, nie awaria. */
export function bookingErrorMessage(code: string | undefined): string {
  switch (code) {
    case SLOT_TAKEN:
      return "Ten slot został właśnie zajęty. Wybierz inny termin lub konia.";
    case HOUR_OUTSIDE_WORKING_HOURS:
      return "Wybrana godzina jest poza zakresem pracy ośrodka w tym dniu.";
    case SCHEDULE_CHANGED:
      return "Grafik ośrodka zmienił się w międzyczasie — wybrany koń nie pracuje tego dnia. Odśwież stronę i wybierz inny slot.";
    default:
      return FALLBACK;
  }
}
