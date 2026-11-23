import { NO_SEATS_LEFT, SCHEDULE_CHANGED, SLOT_STARTED } from "@/lib/bookings/errors";
import type { BookingStatus } from "@/types";

/**
 * Decyzja ośrodka o zapisie oczekującym (#124, #125, #126; GLOSSARY „Przyjęcie zapisu”, „Odrzucenie zapisu”):
 * jedna tabela kodów odmów funkcji `public.accept_booking` i `public.reject_booking` z polskimi komunikatami dla
 * ośrodka, stan zapisu, który potwierdza decyzję (odczyt zwrotny), i jedno rozstrzygnięcie „odmowa reguły czy
 * awaria”. Osobno od `bookingErrorMessage` — odbiorcą jest ośrodek, nie jeździec. Limit miejsc przy przyjęciu
 * pilnuje wyzwalacz `bookings_seat_limit` (SB009), slot bez grafiku to 23503.
 */

/** Przyjęcie albo odrzucenie zapisu oczekującego. */
export type BookingDecision = "accept" | "reject";

/** Zapis nie jest już oczekujący (przyjęty, odwołany przez jeźdźca albo odrzucony — także „Brak miejsc”). */
export const NOT_PENDING = "SB065";
/**
 * Wołający nie decyduje o tym zapisie (nie jest właścicielem ośrodka zapisu ani instruktorem jego slotu, #126)
 * albo zapisu nie ma — bez wyroczni istnienia.
 */
export const NOT_ALLOWED = "SB066";
/** Odrzucenie bez powodu (pusty albo z samych białych znaków). */
export const REJECT_NO_REASON = "SB070";
/** Powód odrzucenia dłuższy niż `REJECTION_REASON_MAX` znaków. */
export const REJECT_REASON_TOO_LONG = "SB071";

/** Limit długości powodu odrzucenia — CHECK `bookings_rejection_reason_check` i SB071. */
export const REJECTION_REASON_MAX = 300;

const NOT_PENDING_MESSAGE =
  "Ten zapis nie czeka już na przyjęcie — jeździec mógł go odwołać albo zapis został przyjęty lub odrzucony.";
/** To samo zdanie dla właściciela (cały ośrodek) i instruktora z kontem (jego sloty) — każdy ma swoje „Zapisy do przyjęcia”. */
const NOT_ALLOWED_MESSAGE = "Nie znaleziono tego zapisu wśród Twoich zapisów do przyjęcia.";

/** Jedyna tabela odmów decyzji: kod → komunikat przy przyjęciu i (albo) przy odrzuceniu. */
const REFUSALS = new Map<string, Partial<Record<BookingDecision, string>>>([
  [
    NO_SEATS_LEFT,
    { accept: "W tym slocie nie ma już wolnych miejsc — przyjęcie ponad limit miejsc nie jest możliwe." },
  ],
  [
    SLOT_STARTED,
    {
      accept: "Ten slot już się zaczął — zapisu nie można już przyjąć.",
      reject: "Ten slot już się zaczął — zapisu nie można już odrzucić.",
    },
  ],
  [NOT_PENDING, { accept: NOT_PENDING_MESSAGE, reject: NOT_PENDING_MESSAGE }],
  [NOT_ALLOWED, { accept: NOT_ALLOWED_MESSAGE, reject: NOT_ALLOWED_MESSAGE }],
  [SCHEDULE_CHANGED, { accept: "Tego slotu nie ma już w grafiku — zapisu nie można przyjąć." }],
  [REJECT_NO_REASON, { reject: "Podaj powód odrzucenia — jeździec go zobaczy." }],
  [REJECT_REASON_TOO_LONG, { reject: `Powód odrzucenia może mieć najwyżej ${String(REJECTION_REASON_MAX)} znaków.` }],
]);

/** Komunikat awarii (nieznany kod, brak kodu, niepotwierdzony stan) — wariant domyślny zbioru zamkniętego. */
export const DECISION_FAILED: Record<BookingDecision, string> = {
  accept: "Nie udało się przyjąć zapisu. Spróbuj ponownie.",
  reject: "Nie udało się odrzucić zapisu. Spróbuj ponownie.",
};

/** Odmowa decyzji dla ośrodka: komunikat i to, czy kod jest znaną odmową reguły (inaczej awaria — do logu). */
export interface DecisionRefusal {
  message: string;
  /** `true` — kod spoza tabeli odmów (albo brak kodu): awaria, którą endpoint loguje. */
  unexpected: boolean;
}

/** Odmowa decyzji dla kodu bazy; nieznany kod i awaria — wariant domyślny (zbiór zamknięty). */
export function decisionRefusal(decision: BookingDecision, code: string | undefined): DecisionRefusal {
  const message = code === undefined ? undefined : REFUSALS.get(code)?.[decision];
  return message === undefined
    ? { message: DECISION_FAILED[decision], unexpected: true }
    : { message, unexpected: false };
}

/** Komunikat odmowy decyzji — `decisionRefusal(...).message`. */
export function decisionErrorMessage(decision: BookingDecision, code: string | undefined): string {
  return decisionRefusal(decision, code).message;
}

/** Stan zapisu, którym baza potwierdza decyzję: przyjęty jest aktywny, odrzucony — odrzucony. */
const CONFIRMED_STATUS: Record<BookingDecision, BookingStatus> = { accept: "active", reject: "rejected" };

/** Czy stan zapisu po decyzji (odczyt zwrotny funkcji bazy) potwierdza decyzję — dopiero wtedy sukces. */
export function isDecisionConfirmed(decision: BookingDecision, status: BookingStatus): boolean {
  return status === CONFIRMED_STATUS[decision];
}
