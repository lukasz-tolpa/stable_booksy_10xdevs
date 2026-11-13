import { hasSlotStarted } from "@/lib/bookings/slots";

/**
 * Wystawione miejsca nieaktywnego instruktora (US 73, ADR-0002).
 *
 * Dezaktywacja nie rusza dni już ułożonych: sloty instruktora zostają otwarte na zapisy,
 * dopóki ośrodek sam nie wyzeruje limitów. Strona instruktorów mówi więc, w ilu dniach
 * instruktor ma jeszcze miejsca, na które jeździec może się zapisać — także dziś, jeśli
 * została godzina z miejscami, która się jeszcze nie zaczęła.
 */

/** Slot z limitem większym od zera: instruktor, dzień grafiku (ISO) i godzina. */
export interface OpenSeatRow {
  instructorId: number;
  day: string;
  hour: number;
}

/** Liczba dni, w których instruktor ma choć jeden slot z miejscami, który się jeszcze nie zaczął. */
export function countDaysWithOpenSeats(rows: OpenSeatRow[], now: Date = new Date()): Map<number, number> {
  const days = new Map<number, Set<string>>();

  for (const row of rows) {
    if (hasSlotStarted(row.day, row.hour, now)) {
      continue;
    }
    const set = days.get(row.instructorId) ?? new Set<string>();
    set.add(row.day);
    days.set(row.instructorId, set);
  }

  return new Map([...days].map(([instructorId, set]) => [instructorId, set.size]));
}

/** Zdanie pod nieaktywnym instruktorem; `null`, gdy nie ma już wystawionych miejsc. */
export function openSeatsNote(dayCount: number): string | null {
  if (dayCount <= 0) {
    return null;
  }

  const days = dayCount === 1 ? "dniu" : "dniach";
  return `Nadal ma wystawione miejsca w ${String(dayCount)} ${days} — wyzeruj jego limity w grafiku.`;
}
