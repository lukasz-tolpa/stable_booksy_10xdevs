/**
 * Tłumaczenie kodów błędu bazy na komunikaty dla ośrodka.
 *
 * To jedyne miejsce, w którym aplikacja interpretuje guardraile z migracji — sama ich
 * nie powiela. Cztery kody, cztery różne czynności po stronie użytkownika:
 */

/** Zmiana daty dnia, który ma aktywne zapisy (trigger z S-02). */
export const SCHEDULE_DATE_CONFLICT = "SB001";
/** Zawężenie godzin pod istniejącym zapisem (trigger z S-02). */
export const SCHEDULE_HOURS_CONFLICT = "SB002";
/**
 * Odpięcie konia mającego zapis w tym dniu (ON DELETE RESTRICT z F-01). FK nie filtruje po
 * statusie: odwołany zapis też przypina konia do dnia — historia zapisów zostaje przy koniu
 * (decyzja 2026-09-08, PRD Open Question #2).
 */
export const FOREIGN_KEY_VIOLATION = "23503";

/**
 * Kody walidacji wykonywanej PRZED zapisem. Baza wyłapałaby oba przypadki, ale dopiero
 * w połowie wielokrokowej operacji — a wtedy wcześniejsze kroki są już wykonane.
 * `23503` w dodatku oznacza obie sytuacje naraz, więc bez tego rozróżnienia ośrodek
 * dostawał komunikat o zapisach także wtedy, gdy problemem był cudzy koń.
 */
export const HORSE_NOT_IN_STABLE = "APP001";
export const HORSE_HAS_BOOKINGS = "APP002";

/** Błąd walidacji przed zapisem; niesie `code` czytany tak samo jak kod Postgresa. */
export class ScheduleSaveError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ScheduleSaveError";
    this.code = code;
  }
}

const FALLBACK = "Nie udało się zapisać grafiku. Spróbuj ponownie.";

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
      // Bez rady „doprowadź do odwołania": odwołany zapis też przypina konia, więc odwołanie
      // niczego tu nie odblokuje — mówimy, co jest, i co da się zrobić.
      return "Nie można wypisać konia, który ma zapisy w tym dniu — także odwołane, bo historia zapisów zostaje przy koniu. Wypisać można tylko konia bez zapisów tego dnia.";
    default:
      return FALLBACK;
  }
}
