/**
 * Logika arkusza grafiku dnia (wiersz = godzina jazd, kolumna = instruktor pracujący tego dnia).
 * Formularz tylko renderuje wyniki tych funkcji.
 */
import { formatClockHour } from "@/lib/format";

/** Limity miejsc w formularzu: klucz `seatKey(instruktor, godzina)` → limit. Brak wpisu to limit 0. */
export type SeatMap = Record<string, number>;

export function seatKey(instructorId: number, hour: number): string {
  return `${String(instructorId)}.${String(hour)}`;
}

export function seatAt(seats: SeatMap, instructorId: number, hour: number): number {
  return seats[seatKey(instructorId, hour)] ?? 0;
}

/** Stan godziny wobec koni dnia: suma limitów < konie | suma == konie (i > 0) | suma > konie. */
export type HourFill = "free" | "full" | "over";

export interface HourRow {
  hour: number;
  total: number;
  fill: HourFill;
}

/**
 * Wiersze arkusza z kolumną „Koni zajętych”. Liczą się tylko instruktorzy pracujący tego dnia,
 * a brak wpisu limitu to 0 — tak samo jak w `save_schedule_day`.
 */
export function sheetRows(hours: number[], instructorIds: number[], seats: SeatMap, horseCount: number): HourRow[] {
  return hours.map((hour) => {
    const total = instructorIds.reduce((sum, instructorId) => sum + seatAt(seats, instructorId, hour), 0);

    return { hour, total, fill: hourFill(total, horseCount) };
  });
}

function hourFill(total: number, horseCount: number): HourFill {
  if (total > horseCount) {
    return "over";
  }

  return total === horseCount && total > 0 ? "full" : "free";
}

/**
 * Godziny jazd dnia z pól godzin pracy: przedział półotwarty [otwarcie, zamknięcie). Zakres,
 * którego nie przyjmie `scheduleDaySchema` (niewybrana godzina, pusty, odwrócony, poza dobą,
 * niecałe godziny), nie daje żadnej godziny.
 */
export function workingHours(openText: string, closeText: string): number[] {
  const open = fieldHour(openText);
  const close = fieldHour(closeText);
  const valid = open !== null && close !== null && close <= 24 && close > open;

  return valid ? Array.from({ length: close - open }, (_, index) => open + index) : [];
}

/** Godzina z pola formularza: sam ciąg cyfr, tak jak `formInt` w schemacie; inaczej `null`. */
function fieldHour(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text) : null;
}

/**
 * Skrót z nagłówka kolumny („wszędzie N”, „wyczyść” to 0): ten sam limit instruktora we
 * wszystkich podanych godzinach. Limity innych instruktorów i godzin spoza zakresu zostają.
 */
export function fillAll(seats: SeatMap, instructorId: number, hours: number[], value: number): SeatMap {
  return { ...seats, ...Object.fromEntries(hours.map((hour) => [seatKey(instructorId, hour), value])) };
}

/**
 * Usuwa wszystkie wpisy limitów danego instruktora, także z godzin spoza zakresu; wpisy innych
 * instruktorów zostają. Brak wpisu to limit 0.
 */
export function withoutInstructor(seats: SeatMap, instructorId: number): SeatMap {
  const prefix = `${String(instructorId)}.`;

  return Object.fromEntries(Object.entries(seats).filter(([key]) => !key.startsWith(prefix)));
}

/**
 * Limit miejsc z tekstu pola komórki, liczony przy opuszczeniu pola i przed wysłaniem:
 * puste, ujemne albo nie-liczba to 0, ułamek obcina do całych miejsc.
 */
export function parseSeatInput(text: string): number {
  const typed = Math.trunc(Number(text));

  return Number.isFinite(typed) && typed > 0 ? typed : 0;
}

/** Przycisk − / + w komórce arkusza; limit miejsc nigdy nie schodzi poniżej zera. */
export function stepSeat(current: number, delta: 1 | -1): number {
  return Math.max(0, current + delta);
}

/** Podpowiedź przy godzinach pracy: koniec zakresu to zamknięcie, a nie ostatnia jazda. */
export function lastRideLabel(open: string, close: string): string | null {
  const hours = workingHours(open, close);

  return hours.length > 0 ? `ostatnia jazda o ${formatClockHour(hours[hours.length - 1])}` : null;
}
