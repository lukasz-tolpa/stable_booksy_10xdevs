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
/** Suma limitów miejsc w jednej godzinie przekracza liczbę koni dnia; DETAIL niesie godzinę. */
export const SEATS_EXCEED_HORSES = "SB007";
/** Grafik na dzień miniony (czas Europe/Warsaw). */
export const SCHEDULE_DAY_PAST = "SB008";
/** Limit miejsc poniżej liczby aktywnych zapisów w slocie; DETAIL niesie godzinę. */
export const SEATS_BELOW_BOOKINGS = "SB010";
/** Wypisanie z dnia instruktora, który ma w nim aktywne zapisy; DETAIL niesie ich liczbę. */
export const INSTRUCTOR_HAS_BOOKINGS = "SB011";

const FALLBACK = "Nie udało się zapisać grafiku. Spróbuj ponownie.";

/**
 * Liczby odmowy z pola DETAIL błędu bazy (PostgREST: `details`). Kontrakt z migracją
 * `20261116090000_structured_schedule_refusal_details.sql`: obiekt JSON z kluczami
 * `bookings` (SB001, SB002, SB011), `hour`/`seats`/`bookings` (SB010), `hour`/`seats`/`horses`
 * (SB007). Treść komunikatu (`message`) może się zmieniać dowolnie — nie jest czytana.
 */
export interface RefusalDetail {
  hour?: number;
  seats?: number;
  bookings?: number;
  horses?: number;
}

const DETAIL_KEYS = ["hour", "seats", "bookings", "horses"] as const;

/** Odczyt DETAIL; pole spoza kontraktu (nie-JSON, nie-obiekt, nie-liczba) jest pomijane. */
export function parseRefusalDetail(detail: string | undefined): RefusalDetail {
  let parsed: unknown;
  try {
    parsed = detail ? JSON.parse(detail) : null;
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }

  const result: RefusalDetail = {};
  for (const key of DETAIL_KEYS) {
    const value: unknown = (parsed as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      result[key] = value;
    }
  }
  return result;
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

/**
 * Komunikat dla ośrodka. Treść mówi, CO blokuje zmianę i ILU zapisów dotyczy — decyzja
 * produktowa wymaga od ośrodka doprowadzenia do ich odwołania, więc samo „nie można"
 * zostawiłoby go w ślepym zaułku. `dbDetail` to pole DETAIL błędu bazy (`errorDetails`).
 */
export function scheduleErrorMessage(code: string | undefined, dbDetail?: string): string {
  const detail = parseRefusalDetail(dbDetail);
  const count = detail.bookings ?? null;
  const howMany = count === null ? " aktywne zapisy" : ` ${String(count)} ${pluralizeBookings(count)}`;
  // Przy jednym zapisie „ich odwołania" brzmi jak błąd - zaimek musi iść za liczbą.
  const theirCancellation = count === 1 ? "jego odwołania" : "ich odwołania";

  switch (code) {
    case SCHEDULE_HOURS_CONFLICT:
      return `Nie można zawęzić godzin pracy — poza nowym zakresem znalazłoby się${howMany}. Najpierw doprowadź do ${theirCancellation}.`;
    case SCHEDULE_DATE_CONFLICT:
      return `Nie można zmienić daty dnia, który ma${howMany}.`;
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
      const { hour, seats, horses } = detail;
      return hour !== undefined && seats !== undefined && horses !== undefined
        ? `O ${formatClockHour(hour)} suma limitów miejsc (${String(seats)}) przekracza liczbę koni pracujących tego dnia (${String(horses)}). Obniż limity w tej godzinie albo dodaj konia.`
        : "W jednej z godzin suma limitów miejsc przekracza liczbę koni pracujących tego dnia. Obniż limity albo dodaj konia.";
    }
    case SEATS_BELOW_BOOKINGS: {
      const { hour, seats } = detail;
      const advice = "Podnieś limit albo najpierw doprowadź do odwołania zapisów.";
      return hour !== undefined && seats !== undefined && count !== null
        ? `O ${formatClockHour(hour)} limit miejsc (${String(seats)}) jest niższy niż liczba aktywnych zapisów w slocie (${String(count)}). ${advice}`
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
