/**
 * Daty grafiku jako czyste ciągi `RRRR-MM-DD`.
 *
 * Dzień grafiku jest datą kalendarzową, nie punktem w czasie — dlatego arytmetyka idzie
 * przez UTC (przesunięcie o dobę nigdy nie zgubi ani nie doda godziny przy zmianie czasu).
 *
 * „Dziś" liczymy jawnie w strefie `Europe/Warsaw`, a NIE w strefie środowiska
 * uruchomieniowego. Poleganie na strefie lokalnej działa na maszynie w Polsce, ale
 * aplikacja stoi na Cloudflare Workers, gdzie środowisko ma UTC — granica doby
 * przesunęłaby się wtedy o dwie godziny względem tego, co widzi ośrodek, i przez
 * pierwsze godziny po północy „dziś" oznaczałoby wczoraj.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Strefa, w której ośrodek myśli o dobie. Jedyne miejsce, gdzie to założenie żyje. */
export const SCHEDULE_TIME_ZONE = "Europe/Warsaw";

/**
 * Data w formacie `RRRR-MM-DD` odczytana w podanej strefie.
 *
 * `en-CA` daje dokładnie układ `RRRR-MM-DD`, więc nie trzeba sklejać części ręcznie.
 */
export function formatIsoDate(date: Date, timeZone: string = SCHEDULE_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function todayIso(now: Date = new Date()): string {
  return formatIsoDate(now);
}

/** Czy ciąg jest poprawną datą kalendarzową — odrzuca też 2026-02-30 i 2026-13-01. */
export function isValidIsoDate(raw: string): boolean {
  if (!ISO_DATE.test(raw)) {
    return false;
  }

  const [year, month, day] = raw.split("-").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return asUtc.toISOString().slice(0, 10) === raw;
}

/** Przesunięcie daty o podaną liczbę dni. Liczone w UTC, żeby zmiana czasu nie przesunęła doby. */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));

  // Zabezpieczenie na wypadek wywolania z niezwalidowana data - `toISOString` na
  // niepoprawnej dacie rzuca wyjatkiem, a to nie jest blad wart wywracania strony.
  return Number.isNaN(shifted.getTime()) ? iso : shifted.toISOString().slice(0, 10);
}

export function isPastDate(iso: string, today: string = todayIso()): boolean {
  return iso < today;
}

/** Domyślna data ekranu grafiku: jutro. */
export function defaultScheduleDate(today: string = todayIso()): string {
  return addDays(today, 1);
}

/**
 * Data z parametru adresu, albo `null` gdy jest niepoprawna.
 *
 * Data przeszła NIE jest tu odrzucana — ekran ma ją pokazać w trybie tylko do odczytu.
 * Zapis blokuje osobno endpoint, sprawdzając `isPastDate`.
 */
export function parseScheduleDate(raw: string | null | undefined): string | null {
  if (!raw || !isValidIsoDate(raw)) {
    return null;
  }

  return raw;
}
