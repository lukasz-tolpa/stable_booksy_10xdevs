/**
 * Odmowy bazy przy stawkach (`public.rates`, #94) jako zamknięty zestaw polskich komunikatów.
 * Interfejs pilnuje tych samych reguł, więc kody docierają tu ze starej strony (np. otwartej przez
 * przełom miesiąca) albo ze spreparowanego formularza. Tekst dostawcy nigdy nie trafia do interfejsu.
 */

import { formatMoney } from "@/lib/format";
import { EXTRA_COST_AMOUNT, RATE_AMOUNT } from "@/lib/settlements/amounts";
import { COST_NAME_MAX } from "@/lib/settlements/schemas";

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

const DELETE_REFUSALS = new Map<string, string>([
  [RATE_IN_FORCE, "Ta zmiana stawki już obowiązuje, więc nie można jej usunąć. Możesz ustawić nową stawkę."],
]);

export function rateSaveErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : SAVE_REFUSALS.get(code)) ?? RATE_SAVE_FAILED;
}

export function rateDeleteErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : DELETE_REFUSALS.get(code)) ?? RATE_DELETE_FAILED;
}

/** Odmowa wynikająca z reguł stawek, nie awaria — endpoint jej nie loguje. */
export function isExpectedRateRefusal(code: string | undefined): boolean {
  return code !== undefined && (SAVE_REFUSALS.has(code) || DELETE_REFUSALS.has(code));
}

/** Koszt dodatkowy w przyszłym miesiącu — wyzwalacz `extra_costs_month_rules` (#96). */
export const COST_MONTH_IN_FUTURE = "SB029";
/** Kwota albo nazwa poza granicami — CHECK-i tabeli `extra_costs`. */
const COST_CHECK = "23514";
/** RLS: jeździec spoza ośrodka (albo konto nie jest właścicielem). */
const COST_FORBIDDEN = "42501";

/** Zapis kosztu dodatkowego nie powiódł się z przyczyny spoza reguł (awaria). */
export const COST_SAVE_FAILED = "Nie udało się zapisać kosztu dodatkowego. Spróbuj ponownie.";
/** Usunięcie kosztu dodatkowego nie powiodło się — usunięcie nie ma reguł bazy, więc to zawsze awaria. */
export const COST_DELETE_FAILED = "Nie udało się usunąć kosztu dodatkowego. Spróbuj ponownie.";
/** Poprawka albo usunięcie bez skutku: kosztu nie ma (usunięty w innej karcie) albo nie należy do ośrodka. */
export const COST_NOT_FOUND = "Nie ma już takiego kosztu dodatkowego.";

const COST_SAVE_REFUSALS = new Map<string, string>([
  [COST_MONTH_IN_FUTURE, "Koszt dodatkowy możesz dopisać tylko w bieżącym albo minionym miesiącu."],
  [
    COST_CHECK,
    `Koszt musi wynosić od 0,01 do ${formatMoney(EXTRA_COST_AMOUNT.max)}, a jego nazwa mieć od 1 do ${String(COST_NAME_MAX)} znaków.`,
  ],
  [COST_FORBIDDEN, "Koszt dodatkowy możesz dopisać tylko jeźdźcowi, który miał zapis w Twoim ośrodku."],
]);

export function costSaveErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : COST_SAVE_REFUSALS.get(code)) ?? COST_SAVE_FAILED;
}

/** Odmowa wynikająca z reguł kosztów dodatkowych, nie awaria — endpoint jej nie loguje. */
export function isExpectedCostRefusal(code: string | undefined): boolean {
  return code !== undefined && COST_SAVE_REFUSALS.has(code);
}
