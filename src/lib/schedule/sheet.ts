/**
 * Logika arkusza grafiku dnia (wiersz = godzina jazd, kolumna = instruktor pracujący tego dnia).
 * Formularz tylko renderuje wyniki tych funkcji.
 */
import { formatClockHour } from "@/lib/format";
import { SLOT_KIND, type SlotKind } from "@/lib/schedule/kind";

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
 * Wiersze arkusza z kolumną „Koni zajętych”. Liczą się tylko instruktorzy pracujący tego dnia
 * i tylko sloty rekreacyjne (`kindAt`) — sloty treningowe nie zużywają koni ośrodka (#115) — a brak
 * wpisu limitu to 0, tak samo jak w `save_schedule_day`.
 */
export function sheetRows(
  hours: number[],
  instructorIds: number[],
  seats: SeatMap,
  horseCount: number,
  kinds: KindMap = {},
): HourRow[] {
  return hours.map((hour) => {
    const total = instructorIds
      .filter((instructorId) => kindAt(kinds, instructorId, hour) === SLOT_KIND.recreation)
      .reduce((sum, instructorId) => sum + seatAt(seats, instructorId, hour), 0);

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

/**
 * Wartość komórki z poprawką godziny: wpis jej godziny, a bez niego wartość wiersza instruktora (z jego
 * najwcześniejszej godziny z wpisem), a bez niego `fallback`. Wspólny kształt placu i rodzaju slotu.
 */
function cellValueAt<T>(map: Record<string, T>, instructorId: number, hour: number, fallback: T): T {
  const key = seatKey(instructorId, hour);
  if (key in map) {
    return map[key];
  }

  const prefix = `${String(instructorId)}.`;
  const row = Object.entries(map)
    .filter(([entry]) => entry.startsWith(prefix))
    .map(([entry, value]) => ({ hour: Number(entry.slice(prefix.length)), value }))
    .sort((a, b) => a.hour - b.hour);

  return row.length > 0 ? row[0].value : fallback;
}

/** Jedna wartość całego wiersza instruktora w podanych godzinach albo `null`, gdy godziny się różnią. */
function columnValue<T>(values: T[]): T | null {
  const distinct = new Set(values);

  return distinct.size === 1 ? [...distinct][0] : null;
}

/** Ta sama wartość we wszystkich podanych godzinach instruktora; wpisy innych instruktorów zostają. */
function fillColumn<T>(map: Record<string, T>, instructorId: number, hours: number[], value: T): Record<string, T> {
  return { ...map, ...Object.fromEntries(hours.map((hour) => [seatKey(instructorId, hour), value])) };
}

/**
 * Place slotów w formularzu: klucz `seatKey(instruktor, godzina)` → plac. Plac ustawia się dla całego
 * wiersza instruktora (`fillPlace`), z poprawką pojedynczej godziny (wpis tej godziny).
 */
export type PlaceMap = Record<string, number>;

/**
 * Plac slotu: wpis jego godziny, a bez niego plac wiersza instruktora (z jego najwcześniejszej godziny
 * z placem), a bez niego `fallback` (pierwszy aktywny plac ośrodka — jak w `save_schedule_day`).
 */
export function placeAt(places: PlaceMap, instructorId: number, hour: number, fallback: number | null): number | null {
  return cellValueAt<number | null>(places, instructorId, hour, fallback);
}

/** Plac całego wiersza instruktora w podanych godzinach albo `null`, gdy godziny są na różnych placach. */
export function columnPlace(
  places: PlaceMap,
  instructorId: number,
  hours: number[],
  fallback: number | null,
): number | null {
  return columnValue(hours.map((hour) => placeAt(places, instructorId, hour, fallback)));
}

/** Plac dla całego wiersza instruktora: ten sam plac we wszystkich podanych godzinach. */
export function fillPlace(places: PlaceMap, instructorId: number, hours: number[], placeId: number): PlaceMap {
  return fillColumn(places, instructorId, hours, placeId);
}

/**
 * Rodzaje slotów w formularzu (#115): klucz `seatKey(instruktor, godzina)` → rodzaj. Rodzaj ustawia się
 * dla całego wiersza instruktora (`fillKind`), z poprawką pojedynczej godziny — jak plac.
 */
export type KindMap = Record<string, SlotKind>;

/** Rodzaj slotu: wpis jego godziny, a bez niego rodzaj wiersza instruktora, a bez niego rekreacyjny (jak w bazie). */
export function kindAt(kinds: KindMap, instructorId: number, hour: number): SlotKind {
  return cellValueAt<SlotKind>(kinds, instructorId, hour, SLOT_KIND.recreation);
}

/** Rodzaj całego wiersza instruktora w podanych godzinach albo `null`, gdy godziny mają różne rodzaje. */
export function columnKind(kinds: KindMap, instructorId: number, hours: number[]): SlotKind | null {
  return columnValue(hours.map((hour) => kindAt(kinds, instructorId, hour)));
}

/** Rodzaj dla całego wiersza instruktora: ten sam rodzaj we wszystkich podanych godzinach. */
export function fillKind(kinds: KindMap, instructorId: number, hours: number[], kind: SlotKind): KindMap {
  return fillColumn(kinds, instructorId, hours, kind);
}
