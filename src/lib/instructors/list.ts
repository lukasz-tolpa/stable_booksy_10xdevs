import { countDaysWithOpenSeats, openSeatsNote, type OpenSeatRow } from "@/lib/instructors/open-seats";
import type { InstructorListItem } from "@/lib/instructors/queries";

/** Aktywny instruktor; `owner` — właściciel ośrodka (oznaczony, bez przełącznika dezaktywacji). */
export interface ActiveInstructorItem extends InstructorListItem {
  owner: boolean;
}

/** Nieaktywny instruktor z notką o wciąż wystawionych miejscach (US 73); `null` — bez notki. */
export interface InactiveInstructorItem extends InstructorListItem {
  note: string | null;
}

/** Model widoku strony instruktorów: aktywni, a pod nimi nieaktywni z notką. */
export interface InstructorList {
  active: ActiveInstructorItem[];
  inactive: InactiveInstructorItem[];
}

/**
 * Lista instruktorów ośrodka podzielona na aktywnych i nieaktywnych (kolejność z
 * `listStableInstructors`). Właścicielem jest instruktor powiązany z kontem właściciela
 * ośrodka (`stables.owner_id`); baza nie pozwala go dezaktywować (SB012), więc stoi wśród
 * aktywnych. Nieaktywny dostaje notkę, w ilu dniach ma jeszcze miejsca, na które jeździec
 * może się zapisać.
 */
export function composeInstructorList(
  instructors: InstructorListItem[],
  openSeatRows: OpenSeatRow[],
  ownerAccountId: string,
  now: Date = new Date(),
): InstructorList {
  const openSeatDays = countDaysWithOpenSeats(openSeatRows, now);

  return {
    active: instructors
      .filter((instructor) => instructor.active)
      .map((instructor) => ({ ...instructor, owner: instructor.account_id === ownerAccountId })),
    inactive: instructors
      .filter((instructor) => !instructor.active)
      .map((instructor) => ({ ...instructor, note: openSeatsNote(openSeatDays.get(instructor.id) ?? 0) })),
  };
}
