/**
 * Zapis liczb i godzin w interfejsie — jedyne miejsce, które o nim decyduje. Korzystają
 * z niego strona statystyk, jej tabele i wykres słupkowy, żeby ta sama wartość wszędzie
 * wyglądała tak samo.
 */

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

/** Godziny jako jeden tekst, np. `3 h` — do etykiet wykresów i ich tabel z danymi. */
export function formatHours(hours: number): string {
  return `${formatNumber(hours)} ${HOURS_UNIT}`;
}
