/**
 * Zapis liczb i godzin w interfejsie — jedyne miejsce, które o nim decyduje. Korzystają
 * z niego strona statystyk, jej tabele i wykres słupkowy, żeby ta sama wartość wszędzie
 * wyglądała tak samo.
 */

import { SCHEDULE_TIME_ZONE } from "@/lib/schedule/dates";

/** Liczba w zapisie polskim (przecinek dziesiętny, tysiące oddzielone spacją). */
export function formatNumber(value: number): string {
  return value.toLocaleString("pl-PL");
}

/** Jednostka godzin; tabele i kafle dokładają ją osobnym, wyszarzonym elementem. */
export const HOURS_UNIT = "h";

/** Godzina zegarowa slotu, np. `13:00` (godziny w grafiku są pełne). */
export function formatClockHour(hour: number): string {
  return `${String(hour)}:00`;
}

/** Wolne miejsca slotu wobec limitu, np. `2 z 4 wolne`. */
export function formatFreeSeats(freeSeats: number, seats: number): string {
  return `${formatNumber(freeSeats)} z ${formatNumber(seats)} wolne`;
}

/** Zajęte miejsca slotu wobec limitu, np. `zajęte 1 z 2` — widok instruktora „Moje sloty”. */
export function formatTakenSeats(taken: number, seats: number): string {
  return `zajęte ${formatNumber(taken)} z ${formatNumber(seats)}`;
}

/**
 * Dzień grafiku (`RRRR-MM-DD`) z dniem tygodnia, bez roku, np. `środa, 18 listopada`. Data
 * kalendarzowa, więc formatowana w UTC — strefa środowiska nie przesunie doby.
 */
export function formatLongDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * Dzień (`RRRR-MM-DD`) z dniem tygodnia i rokiem, np. `środa, 18 listopada 2026` — data w nawigacji
 * dniami (grafik, zapisy dnia, strona ośrodka). Data kalendarzowa, więc w UTC, jak `formatLongDate`.
 */
export function formatLongDateWithYear(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const SHORT_WEEKDAY = new Intl.DateTimeFormat("pl-PL", { weekday: "short", timeZone: "UTC" });
const SHORT_DAY_MONTH = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", timeZone: "UTC" });

/** Skrót dnia tygodnia dnia grafiku (`RRRR-MM-DD`), np. `pt.` — data kalendarzowa, więc w UTC. */
export function formatShortWeekday(iso: string): string {
  return SHORT_WEEKDAY.format(new Date(`${iso}T00:00:00Z`));
}

/** Dzień i skrót miesiąca dnia grafiku (`RRRR-MM-DD`), np. `20 lis` — data kalendarzowa, więc w UTC. */
export function formatShortDate(iso: string): string {
  return SHORT_DAY_MONTH.format(new Date(`${iso}T00:00:00Z`));
}

/** Godziny pracy dnia `[open, close)`, np. `10:00–16:00` — od pierwszego slotu do końca ostatniego. */
export function formatHourRange(openHour: number, closeHour: number): string {
  return `${formatClockHour(openHour)}–${formatClockHour(closeHour)}`;
}

const DAY_MONTH = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: SCHEDULE_TIME_ZONE });

/** Dzień i miesiąc chwili w strefie ośrodka, np. `21 maja` — do terminów typu „ważne do …”. */
export function formatDayMonth(at: Date): string {
  return DAY_MONTH.format(at);
}

/** Godziny jako jeden tekst, np. `3 h` — do etykiet wykresów i ich tabel z danymi. */
export function formatHours(hours: number): string {
  return `${formatNumber(hours)} ${HOURS_UNIT}`;
}

/** Procent jako jeden tekst, np. `67%` — w panelu ośrodka i na kafelkach statystyk. */
export function formatPercent(percent: number): string {
  return `${formatNumber(percent)}%`;
}

/** Trzy formy polskiego rzeczownika po liczebniku: `1 zapis`, `2 zapisy`, `5 zapisów`. */
export interface PluralForms {
  one: string;
  few: string;
  many: string;
}

/**
 * Forma rzeczownika po liczbie: dokładnie 1 — `one`; końcówka 2–4 poza nastkami 12–14 — `few`;
 * reszta (0, 5+, 11–14, 21, 25…) — `many`.
 */
export function pluralForm(count: number, forms: PluralForms): string {
  const abs = Math.abs(count);
  const lastTwo = abs % 100;
  const last = abs % 10;

  if (abs === 1) {
    return forms.one;
  }
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return forms.few;
  }
  return forms.many;
}

/** Liczba z odmienionym rzeczownikiem, np. `5 zapisów`, `1 dzień`. */
export function formatCount(count: number, forms: PluralForms): string {
  return `${formatNumber(count)} ${pluralForm(count, forms)}`;
}

/** Odmiana „zapis” — wspólna dla komunikatów grafiku i panelu ośrodka. */
export const BOOKING_FORMS: PluralForms = { one: "zapis", few: "zapisy", many: "zapisów" };
