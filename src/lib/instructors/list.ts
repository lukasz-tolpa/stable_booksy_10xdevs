import { countDaysWithOpenSeats, openSeatsNote, type OpenSeatRow } from "@/lib/instructors/open-seats";
import type { InstructorListItem } from "@/lib/instructors/queries";

/** Nieaktywny instruktor z notką o wciąż wystawionych miejscach (US 73); `null` — bez notki. */
export interface InactiveInstructorItem extends InstructorListItem {
  note: string | null;
}

/** Model widoku strony instruktorów: aktywni, a pod nimi nieaktywni z notką. */
export interface InstructorList {
  active: InstructorListItem[];
  inactive: InactiveInstructorItem[];
}

/**
 * Lista instruktorów ośrodka podzielona na aktywnych i nieaktywnych (kolejność z
 * `listStableInstructors`). Nieaktywny dostaje notkę, w ilu dniach ma jeszcze miejsca,
 * na które jeździec może się zapisać.
 */
export function composeInstructorList(
  instructors: InstructorListItem[],
  openSeatRows: OpenSeatRow[],
  now: Date = new Date(),
): InstructorList {
  const openSeatDays = countDaysWithOpenSeats(openSeatRows, now);

  return {
    active: instructors.filter((instructor) => instructor.active),
    inactive: instructors
      .filter((instructor) => !instructor.active)
      .map((instructor) => ({ ...instructor, note: openSeatsNote(openSeatDays.get(instructor.id) ?? 0) })),
  };
}
