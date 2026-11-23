/**
 * Przyjęcie zapisu przez ośrodek (#124, GLOSSARY „Przyjęcie zapisu”): kody odmów funkcji
 * `public.accept_booking` (migracja `20261209090000_booking_acceptance.sql`) na komunikaty dla ośrodka.
 * Osobno od `bookingErrorMessage` (odbiorcą jest jeździec). Limit miejsc pilnuje wyzwalacz
 * `bookings_seat_limit` (blokada wiersza slotu — także dwa równoczesne przyjęcia), więc „ponad limit” to SB009.
 */

/** Slot już się zaczął — zapisu oczekującego nie da się przyjąć (wygasł). */
export const ACCEPT_SLOT_STARTED = "SB064";
/** Zapis nie jest już oczekujący (przyjęty, odwołany przez jeźdźca albo odrzucony). */
export const ACCEPT_NOT_PENDING = "SB065";
/** Wołający nie jest właścicielem ośrodka zapisu albo zapisu nie ma — bez wyroczni istnienia. */
export const ACCEPT_NOT_ALLOWED = "SB066";
/** Brak wolnych miejsc w slocie — wyzwalacz `bookings_seat_limit`. */
const NO_SEATS_LEFT = "SB009";
/** Slotu nie ma już w grafiku — wyzwalacz `bookings_seat_limit`. */
const SLOT_GONE = "23503";

export const ACCEPTANCE_FAILED = "Nie udało się przyjąć zapisu. Spróbuj ponownie.";

const MESSAGES = new Map<string, string>([
  [NO_SEATS_LEFT, "W tym slocie nie ma już wolnych miejsc — przyjęcie ponad limit miejsc nie jest możliwe."],
  [ACCEPT_SLOT_STARTED, "Ten slot już się zaczął — zapisu nie można już przyjąć."],
  [ACCEPT_NOT_PENDING, "Ten zapis nie czeka już na przyjęcie — jeździec mógł go odwołać."],
  [ACCEPT_NOT_ALLOWED, "Nie znaleziono zapisu do przyjęcia w Twoim ośrodku."],
  [SLOT_GONE, "Tego slotu nie ma już w grafiku — zapisu nie można przyjąć."],
]);

/** Komunikat odmowy przyjęcia; nieznany kod i awaria — wariant domyślny (zbiór zamknięty). */
export function acceptanceErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : MESSAGES.get(code)) ?? ACCEPTANCE_FAILED;
}
