import { isValidIsoDate } from "@/lib/schedule/dates";
import { formatDayMonthYear, formatMoney } from "@/lib/format";
import { BOARDING_FEE_AMOUNT } from "@/lib/settlements/amounts";

/**
 * Odmowy bazy przy koniach pensjonatowych i pobytach (#114, migracja 20261201100000) jako zamknięty
 * polski zestaw — tekst dostawcy nigdy nie trafia do interfejsu. Kody: `SB040`–`SB047` (nagłówek
 * migracji) i opłata za pensjonat `SB060`–`SB062` (#117, migracja 20261204090000); każdy inny kod to
 * komunikat awarii danej czynności.
 */

/** Brak konta jeźdźca pod adresem e-mail — `find_rider_by_email` / `add_boarding_horse`. */
export const NO_RIDER_ACCOUNT = "SB040";

/** Formularz z ukrytymi polami (pobyt, koń) z nieczytelnym polem — spreparowany albo uszkodzony. */
export const BOARDING_FORM_INVALID = "Nieprawidłowe dane formularza";

export const BOARDING_HORSE_FAILED = "Nie udało się dodać konia pensjonatowego. Spróbuj ponownie.";
export const STAY_FAILED = "Nie udało się dodać pobytu. Spróbuj ponownie.";
export const DEPARTURE_FAILED = "Nie udało się zapisać dnia wyjazdu. Spróbuj ponownie.";
export const BOARDING_FEE_FAILED = "Nie udało się zapisać opłaty za pensjonat. Spróbuj ponownie.";
export const BOARDING_FEE_DELETE_FAILED = "Nie udało się usunąć zaplanowanej zmiany opłaty. Spróbuj ponownie.";
/** Usunięcie bez skutku: zmiany nie ma (usunięta w innej karcie) albo nie należy do ośrodka. */
export const BOARDING_FEE_NOTHING_TO_DELETE = "Nie ma już takiej zaplanowanej zmiany opłaty za pensjonat.";

const HORSE_NOT_FOUND = "Nie znaleziono tego konia pensjonatowego w Twoim ośrodku.";
const LAST_RIDE = "Dzień wyjazdu nie może być wcześniejszy niż ostatnia jazda konia w tym pobycie";

const BOARDING_HORSE_REFUSALS = new Map<string, string>([
  [
    NO_RIDER_ACCOUNT,
    "Pod tym adresem e-mail nie ma konta jeźdźca. Pensjonariusz musi najpierw założyć konto w getona.horse.",
  ],
  ["23514", "Podaj imię konia"],
]);

const STAY_REFUSALS = new Map<string, string>([
  ["SB041", HORSE_NOT_FOUND],
  ["SB042", "Ten pobyt zachodzi na inny pobyt konia. Pobyt może zacząć się dopiero po dniu wyjazdu poprzedniego."],
  ["SB047", "Ten koń nie ma już właściciela — konto pensjonariusza usunięto, więc nie można dodać mu pobytu."],
]);

const DEPARTURE_REFUSALS = new Map<string, string>([
  ["SB041", "Nie znaleziono tego pobytu."],
  ["SB042", "Ten dzień wyjazdu zachodzi na kolejny pobyt konia."],
  ["SB043", "Dzień wyjazdu nie może być późniejszy niż dziś."],
  ["SB044", "Dzień wyjazdu nie może być wcześniejszy niż dzień przyjazdu."],
  ["SB045", `${LAST_RIDE}.`],
]);

/** Opłata za pensjonat (#117) — wzorem odmów stawki (`@/lib/settlements/errors`). */
const FEE_REFUSALS = new Map<string, string>([
  [
    "SB060",
    "Opłatę za pensjonat możesz zmienić tylko od tego albo od następnego miesiąca. Odśwież stronę i spróbuj ponownie.",
  ],
  ["SB062", "Miesiąca zmiany opłaty nie można przesunąć. Ustaw nową opłatę od wybranego miesiąca."],
  ["23514", `Opłata za pensjonat musi wynosić od 0,00 do ${formatMoney(BOARDING_FEE_AMOUNT.max)}.`],
  ["23503", "Opłatę za pensjonat ustawia się tylko koniowi pensjonatowemu Twojego ośrodka."],
  ["42501", "Nie możesz zmieniać opłat za pensjonat w tym ośrodku."],
]);

const FEE_DELETE_REFUSALS = new Map<string, string>([
  ["SB061", "Ta zmiana opłaty za pensjonat już obowiązuje, więc nie można jej usunąć. Możesz ustawić nową opłatę."],
]);

function refusal(table: Map<string, string>, code: string | undefined, fallback: string): string {
  return (code === undefined ? undefined : table.get(code)) ?? fallback;
}

export function boardingHorseErrorMessage(code: string | undefined): string {
  return refusal(BOARDING_HORSE_REFUSALS, code, BOARDING_HORSE_FAILED);
}

export function stayErrorMessage(code: string | undefined): string {
  return refusal(STAY_REFUSALS, code, STAY_FAILED);
}

/** Dzień ostatniej jazdy z DETAIL odmowy SB045 (`{"day": "RRRR-MM-DD"}`), albo `null`. */
function lastRideDay(detail: string | undefined): string | null {
  try {
    const parsed: unknown = detail ? JSON.parse(detail) : null;
    if (typeof parsed === "object" && parsed !== null && "day" in parsed && typeof parsed.day === "string") {
      return isValidIsoDate(parsed.day) ? parsed.day : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Odmowa zapisu dnia wyjazdu (`set_stay_departure`) — ośrodek i pensjonariusz dostają te same zdania. */
export function departureErrorMessage(code: string | undefined, detail: string | undefined): string {
  if (code === "SB045") {
    const day = lastRideDay(detail);
    return day ? `${LAST_RIDE} (${formatDayMonthYear(day)}).` : `${LAST_RIDE}.`;
  }
  return refusal(DEPARTURE_REFUSALS, code, DEPARTURE_FAILED);
}

/** Odmowa zapisu opłaty za pensjonat (#117). */
export function boardingFeeErrorMessage(code: string | undefined): string {
  return refusal(FEE_REFUSALS, code, BOARDING_FEE_FAILED);
}

/** Odmowa usunięcia zaplanowanej zmiany opłaty za pensjonat (#117). */
export function boardingFeeDeleteErrorMessage(code: string | undefined): string {
  return refusal(FEE_DELETE_REFUSALS, code, BOARDING_FEE_DELETE_FAILED);
}

/** Odmowa wynikająca z reguł koni pensjonatowych, pobytów i opłat, nie awaria — endpoint jej nie loguje. */
export function isExpectedBoardingRefusal(code: string | undefined): boolean {
  return (
    code !== undefined &&
    [BOARDING_HORSE_REFUSALS, STAY_REFUSALS, DEPARTURE_REFUSALS, FEE_REFUSALS, FEE_DELETE_REFUSALS].some((table) =>
      table.has(code),
    )
  );
}
