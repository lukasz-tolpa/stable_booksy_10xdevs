/**
 * Tłumaczenie kodów błędu bazy na komunikaty dla ośrodka.
 *
 * To jedyne miejsce, w którym aplikacja interpretuje guardraile z migracji — sama ich
 * nie powiela. Od #40 wszystkie odmowy zapisu grafiku podnosi baza: wyzwalacz z S-02
 * (SB001, SB002) i funkcja `public.save_schedule_day` (SB003–SB008, migracja
 * `20261113090000_schedule_day_instructors_and_seats.sql`; SB010, SB011 i nowe znaczenie
 * SB004 — `20261114090000_bookings_on_instructor_seats.sql`). Każdy kod to inna czynność
 * po stronie ośrodka.
 */

import { formatClockHour } from "@/lib/format";

/** Zmiana daty dnia, który ma aktywne zapisy (trigger z S-02). */
export const SCHEDULE_DATE_CONFLICT = "SB001";
/** Zawężenie godzin pod istniejącym zapisem (trigger z S-02). */
export const SCHEDULE_HOURS_CONFLICT = "SB002";
/**
 * Odpięcie konia przydzielonego do zapisu w tym dniu (FK `bookings_assigned_horse_fkey`,
 * ON DELETE RESTRICT). Konia ma tylko aktywny zapis, więc odwołane zapisy go nie przypinają.
 */
export const FOREIGN_KEY_VIOLATION = "23503";

/** Koń spoza stadniny w zapisie dnia (dawniej `APP001` w aplikacji). */
export const HORSE_NOT_IN_STABLE = "SB003";
/** Wypisanie konia przydzielonego do aktywnego zapisu w tym dniu (od #41; dawniej: jakikolwiek zapis). */
export const HORSE_HAS_BOOKINGS = "SB004";
/** Instruktor spoza stadniny w zapisie dnia. */
export const INSTRUCTOR_NOT_IN_STABLE = "SB005";
/** Nieaktywny instruktor dodawany do dnia, w którym go wcześniej nie było. */
export const INSTRUCTOR_INACTIVE = "SB006";
/** Suma limitów miejsc w jednej godzinie przekracza liczbę koni dnia; komunikat bazy niesie godzinę. */
export const SEATS_EXCEED_HORSES = "SB007";
/** Grafik na dzień miniony (czas Europe/Warsaw). */
export const SCHEDULE_DAY_PAST = "SB008";
/** Limit miejsc poniżej liczby aktywnych zapisów w slocie; komunikat bazy niesie godzinę. */
export const SEATS_BELOW_BOOKINGS = "SB010";
/** Wypisanie z dnia instruktora, który ma w nim aktywne zapisy; komunikat bazy niesie ich liczbę. */
export const INSTRUCTOR_HAS_BOOKINGS = "SB011";

const FALLBACK = "Nie udało się zapisać grafiku. Spróbuj ponownie.";

/**
 * Trzy liczby z komunikatów SB007 i SB010 („... o godzinie 13 (3) ... (2)"): godzina, limit
 * (albo suma limitów) i liczba, z którą go porównano (koni albo aktywnych zapisów); `null`,
 * gdy komunikat ma inny kształt.
 */
function parseHourComparison(message: string | undefined): { hour: number; seats: number; other: number } | null {
  const match = message ? /godzinie (\d+) \((\d+)\).*\((\d+)\)/.exec(message) : null;
  return match ? { hour: Number(match[1]), seats: Number(match[2]), other: Number(match[3]) } : null;
}

/**
 * Polska odmiana rzeczownika „zapis" po liczbie: 1 zapis, 2-4 zapisy, 5+ zapisów,
 * z wyjątkiem nastek (12-14), które zawsze idą z formą dopełniaczową.
 */
export function pluralizeBookings(count: number): string {
  const abs = Math.abs(count);
  const lastTwo = abs % 100;
  const last = abs % 10;

  if (abs === 1) {
    return "zapis";
  }

  if (lastTwo >= 12 && lastTwo <= 14) {
    return "zapisów";
  }

  if (last >= 2 && last <= 4) {
    return "zapisy";
  }

  return "zapisów";
}

/** „1 aktywny zapis", „3 aktywne zapisy", „5 aktywnych zapisów" — przymiotnik idzie za rzeczownikiem. */
function activeBookings(count: number): string {
  const noun = pluralizeBookings(count);
  const adjective = noun === "zapis" ? "aktywny" : noun === "zapisy" ? "aktywne" : "aktywnych";
  return `${String(count)} ${adjective} ${noun}`;
}

/** Liczba kolidujących zapisów z komunikatu bazy; `null`, gdy nie da się jej odczytać. */
export function extractConflictCount(message: string | undefined): number | null {
  if (!message) {
    return null;
  }

  const match = /\d+/.exec(message);
  return match ? Number(match[0]) : null;
}

/**
 * Komunikat dla ośrodka. Treść mówi, CO blokuje zmianę i ILU zapisów dotyczy — decyzja
 * produktowa wymaga od ośrodka doprowadzenia do ich odwołania, więc samo „nie można"
 * zostawiłoby go w ślepym zaułku.
 */
export function scheduleErrorMessage(code: string | undefined, dbMessage?: string): string {
  const count = extractConflictCount(dbMessage);
  const howMany = count === null ? "" : ` ${String(count)} ${pluralizeBookings(count)}`;
  // Przy jednym zapisie „ich odwołania" brzmi jak błąd - zaimek musi iść za liczbą.
  const theirCancellation = count === 1 ? "jego odwołania" : "ich odwołania";

  switch (code) {
    case SCHEDULE_HOURS_CONFLICT:
      return `Nie można zawęzić godzin pracy — poza nowym zakresem znalazłoby się${howMany}. Najpierw doprowadź do ${theirCancellation}.`;
    case SCHEDULE_DATE_CONFLICT:
      return `Nie można zmienić daty dnia, który ma${howMany || " aktywne zapisy"}.`;
    case HORSE_NOT_IN_STABLE:
      return "Wybrany koń nie należy do Twojej stadniny.";
    case HORSE_HAS_BOOKINGS:
    case FOREIGN_KEY_VIOLATION:
      return "Nie można wypisać konia, który jest przydzielony do zapisu w tym dniu. Najpierw zmień przydział konia albo doprowadź do odwołania zapisu.";
    case INSTRUCTOR_NOT_IN_STABLE:
      return "Wybrany instruktor nie należy do Twojego ośrodka.";
    case INSTRUCTOR_INACTIVE:
      return "Nieaktywnego instruktora nie można dodać do dnia, w którym wcześniej nie pracował. Najpierw go aktywuj.";
    case SEATS_EXCEED_HORSES: {
      const excess = parseHourComparison(dbMessage);
      return excess
        ? `O ${formatClockHour(excess.hour)} suma limitów miejsc (${String(excess.seats)}) przekracza liczbę koni pracujących tego dnia (${String(excess.other)}). Obniż limity w tej godzinie albo dodaj konia.`
        : "W jednej z godzin suma limitów miejsc przekracza liczbę koni pracujących tego dnia. Obniż limity albo dodaj konia.";
    }
    case SEATS_BELOW_BOOKINGS: {
      const below = parseHourComparison(dbMessage);
      const advice = "Podnieś limit albo najpierw doprowadź do odwołania zapisów.";
      return below
        ? `O ${formatClockHour(below.hour)} limit miejsc (${String(below.seats)}) jest niższy niż liczba aktywnych zapisów w slocie (${String(below.other)}). ${advice}`
        : `W jednym ze slotów limit miejsc jest niższy niż liczba aktywnych zapisów. ${advice}`;
    }
    case INSTRUCTOR_HAS_BOOKINGS:
      return `Nie można wypisać z dnia instruktora, który ma w nim ${count === null ? "aktywne zapisy" : activeBookings(count)}. Najpierw doprowadź do ${theirCancellation}.`;
    case SCHEDULE_DAY_PAST:
      return "Nie można układać grafiku na przeszłe dni";
    default:
      return FALLBACK;
  }
}
