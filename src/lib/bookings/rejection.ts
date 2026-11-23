import { NOT_AMONG_MY_PENDING_BOOKINGS } from "@/lib/bookings/acceptance";

/**
 * Odrzucenie zapisu przez ośrodek (#125, GLOSSARY „Odrzucenie zapisu”): kody odmów funkcji
 * `public.reject_booking` (migracja `20261210090000_booking_rejection.sql`) na komunikaty dla ośrodka.
 * Osobno od `acceptanceErrorMessage` — te same kody SB064–SB066 mówią tu o odrzuceniu.
 */

/** Limit długości powodu odrzucenia — CHECK `bookings_rejection_reason_check` i SB071. */
export const REJECTION_REASON_MAX = 300;

/** Brak powodu (pusty albo z samych białych znaków). */
export const REJECT_NO_REASON = "SB070";
/** Powód dłuższy niż `REJECTION_REASON_MAX` znaków. */
export const REJECT_REASON_TOO_LONG = "SB071";
/** Slot już się zaczął — zapis oczekujący wygasł (kod z przyjęcia, #124). */
const SLOT_STARTED = "SB064";
/** Zapis nie jest już oczekujący (kod z przyjęcia, #124). */
const NOT_PENDING = "SB065";
/** Wołający nie decyduje o tym zapisie (właściciel ośrodka, instruktor slotu — #126) albo zapisu nie ma (kod z przyjęcia, #124). */
const NOT_ALLOWED = "SB066";

export const REJECTION_FAILED = "Nie udało się odrzucić zapisu. Spróbuj ponownie.";

const MESSAGES = new Map<string, string>([
  [REJECT_NO_REASON, "Podaj powód odrzucenia — jeździec go zobaczy."],
  [REJECT_REASON_TOO_LONG, `Powód odrzucenia może mieć najwyżej ${String(REJECTION_REASON_MAX)} znaków.`],
  [SLOT_STARTED, "Ten slot już się zaczął — zapisu nie można już odrzucić."],
  [
    NOT_PENDING,
    "Ten zapis nie czeka już na przyjęcie — jeździec mógł go odwołać albo zapis został przyjęty lub odrzucony.",
  ],
  [NOT_ALLOWED, NOT_AMONG_MY_PENDING_BOOKINGS],
]);

/** Komunikat odmowy odrzucenia; nieznany kod i awaria — wariant domyślny (zbiór zamknięty). */
export function rejectionErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : MESSAGES.get(code)) ?? REJECTION_FAILED;
}
