import { isValidIsoDate } from "@/lib/schedule/dates";
import { formatLongDayMonthYear } from "@/lib/format";

/**
 * Odmowy bazy przy koniach pensjonatowych i pobytach (#114, migracja 20261201100000) jako zamknięty
 * polski zestaw — tekst dostawcy nigdy nie trafia do interfejsu. Kody: `SB040`–`SB047` (nagłówek
 * migracji); każdy inny kod to komunikat awarii danej czynności.
 */

/** Brak konta jeźdźca pod adresem e-mail — `find_rider_by_email` / `add_boarding_horse`. */
export const NO_RIDER_ACCOUNT = "SB040";

/** Formularz z ukrytymi polami (pobyt, koń) z nieczytelnym polem — spreparowany albo uszkodzony. */
export const BOARDING_FORM_INVALID = "Nieprawidłowe dane formularza";
/** Konto ośrodka bez stadniny. */
export const BOARDING_NO_STABLE = "Twoje konto nie ma jeszcze stadniny";

export const BOARDING_HORSE_FAILED = "Nie udało się dodać konia pensjonatowego. Spróbuj ponownie.";
export const STAY_FAILED = "Nie udało się dodać pobytu. Spróbuj ponownie.";
export const DEPARTURE_FAILED = "Nie udało się zapisać dnia wyjazdu. Spróbuj ponownie.";

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
    return day ? `${LAST_RIDE} (${formatLongDayMonthYear(day)}).` : `${LAST_RIDE}.`;
  }
  return refusal(DEPARTURE_REFUSALS, code, DEPARTURE_FAILED);
}

/** Odmowa wynikająca z reguł koni pensjonatowych i pobytów, nie awaria — endpoint jej nie loguje. */
export function isExpectedBoardingRefusal(code: string | undefined): boolean {
  return (
    code !== undefined && (BOARDING_HORSE_REFUSALS.has(code) || STAY_REFUSALS.has(code) || DEPARTURE_REFUSALS.has(code))
  );
}
