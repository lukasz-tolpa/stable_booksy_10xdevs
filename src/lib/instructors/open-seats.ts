/**
 * Wystawione miejsca nieaktywnego instruktora (US 73, ADR-0002).
 *
 * Dezaktywacja nie rusza dni już ułożonych: sloty instruktora zostają otwarte na zapisy,
 * dopóki ośrodek sam nie wyzeruje limitów. Strona instruktorów mówi więc, w ilu dniach —
 * od dziś, bo dziś jeźdźcy nadal mogą się zapisać — instruktor ma jeszcze miejsca.
 */

/** Slot z limitem większym od zera: instruktor i dzień grafiku (ISO). */
export interface OpenSeatRow {
  instructorId: number;
  day: string;
}

/** Liczba dni od `today` włącznie, w których instruktor ma choć jeden slot z miejscami. */
export function countDaysWithOpenSeats(rows: OpenSeatRow[], today: string): Map<number, number> {
  const days = new Map<number, Set<string>>();

  for (const row of rows) {
    if (row.day < today) {
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
