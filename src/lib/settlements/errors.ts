/**
 * Odmowy bazy przy stawkach (`public.rates`, #94) jako zamknięty zestaw polskich komunikatów.
 * Interfejs pilnuje tych samych reguł, więc kody docierają tu ze starej strony (np. otwartej przez
 * przełom miesiąca) albo ze spreparowanego formularza. Tekst dostawcy nigdy nie trafia do interfejsu.
 */

import { formatMoney } from "@/lib/format";
import { RATE_AMOUNT } from "@/lib/settlements/amounts";

/** Zmiana stawki z miesiącem „od” innym niż bieżący albo następny — wyzwalacz `rates_month_rules`. */
export const RATE_MONTH_OUT_OF_RANGE = "SB026";
/** Usunięcie zmiany, która już obowiązuje — wyzwalacz `rates_month_rules`. */
export const RATE_IN_FORCE = "SB027";
/** Kwota poza granicami albo stawka ośrodka bez kwoty — CHECK-i tabeli `rates`. */
const RATE_CHECK = "23514";
/** RLS: konto nie jest właścicielem ośrodka (albo jeździec spoza ośrodka, #97). */
const RATE_FORBIDDEN = "42501";

/** Zapis stawki nie powiódł się z przyczyny spoza reguł (awaria). */
export const RATE_SAVE_FAILED = "Nie udało się zapisać stawki. Spróbuj ponownie.";
/** Usunięcie zaplanowanej zmiany nie powiodło się z przyczyny spoza reguł (awaria). */
export const RATE_DELETE_FAILED = "Nie udało się usunąć zaplanowanej zmiany. Spróbuj ponownie.";
/** Usunięcie bez skutku: zmiany nie ma (usunięta w innej karcie) albo nie należy do ośrodka. */
export const RATE_NOTHING_TO_DELETE = "Nie ma już takiej zaplanowanej zmiany stawki.";
/** Konto właściciela bez ośrodka. */
export const SETTLEMENT_NO_STABLE = "Twoje konto nie ma jeszcze stadniny";

const SAVE_REFUSALS = new Map<string, string>([
  [
    RATE_MONTH_OUT_OF_RANGE,
    "Stawkę możesz zmienić tylko od tego albo od następnego miesiąca. Odśwież stronę i spróbuj ponownie.",
  ],
  [RATE_CHECK, `Stawka musi wynosić od 0,00 do ${formatMoney(RATE_AMOUNT.max)}.`],
  [RATE_FORBIDDEN, "Nie możesz zmieniać stawek tego ośrodka."],
]);

/** Konto jeźdźca usunięte, zanim zapis stawki indywidualnej dotarł do bazy (FK `rates.rider_id`). */
const RATE_RIDER_GONE = "23503";
const RIDER_NOT_OF_STABLE = "Stawkę indywidualną możesz ustawić tylko jeźdźcowi swojego ośrodka.";

/** Stawka indywidualna (#97): reguły czasu i kwoty jak przy stawce ośrodka, odmowa RLS — o jeźdźcu. */
const RIDER_SAVE_REFUSALS = new Map<string, string>([
  ...SAVE_REFUSALS,
  [RATE_FORBIDDEN, RIDER_NOT_OF_STABLE],
  [RATE_RIDER_GONE, RIDER_NOT_OF_STABLE],
]);

const DELETE_REFUSALS = new Map<string, string>([
  [RATE_IN_FORCE, "Ta zmiana stawki już obowiązuje, więc nie można jej usunąć. Możesz ustawić nową stawkę."],
]);

export function rateSaveErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : SAVE_REFUSALS.get(code)) ?? RATE_SAVE_FAILED;
}

export function riderRateSaveErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : RIDER_SAVE_REFUSALS.get(code)) ?? RATE_SAVE_FAILED;
}

export function rateDeleteErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : DELETE_REFUSALS.get(code)) ?? RATE_DELETE_FAILED;
}

/** Odmowa wynikająca z reguł stawek, nie awaria — endpoint jej nie loguje. */
export function isExpectedRateRefusal(code: string | undefined): boolean {
  return code !== undefined && (RIDER_SAVE_REFUSALS.has(code) || DELETE_REFUSALS.has(code));
}
