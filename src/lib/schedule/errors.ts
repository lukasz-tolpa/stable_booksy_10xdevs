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
/** Odpięcie konia mającego zapis w tym dniu (ON DELETE RESTRICT z F-01). */
export const FOREIGN_KEY_VIOLATION = "23503";

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
    case FOREIGN_KEY_VIOLATION:
      return "Nie można wypisać konia, który ma zapisy w tym dniu. Najpierw doprowadź do ich odwołania.";
    default:
      return FALLBACK;
  }
}
