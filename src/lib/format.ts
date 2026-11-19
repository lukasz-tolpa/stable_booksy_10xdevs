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

const DAY_MONTH = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: SCHEDULE_TIME_ZONE });

/** Dzień i miesiąc chwili w strefie ośrodka, np. `21 maja` — do terminów typu „ważne do …”. */
export function formatDayMonth(at: Date): string {
  return DAY_MONTH.format(at);
}

/** Godziny jako jeden tekst, np. `3 h` — do etykiet wykresów i ich tabel z danymi. */
export function formatHours(hours: number): string {
  return `${formatNumber(hours)} ${HOURS_UNIT}`;
}
