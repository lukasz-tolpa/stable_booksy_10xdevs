import { formatDayMonth } from "@/lib/format";
import { countDaysWithOpenSeats, openSeatsNote, type OpenSeatRow } from "@/lib/instructors/open-seats";
import type { InstructorListItem, LiveInvitation } from "@/lib/instructors/queries";

/**
 * Stan konta instruktora na liście (#74): ma konto, czeka na nie z żywym zaproszeniem
 * (z adresem, dla którego zaproszenie działa) albo nie ma ani jednego, ani drugiego.
 */
export type AccountState =
  | { kind: "account"; label: string }
  | { kind: "invited"; label: string; email: string }
  | { kind: "none"; label: string };

/** Aktywny instruktor; `owner` — właściciel ośrodka (oznaczony, bez przełącznika dezaktywacji). */
export interface ActiveInstructorItem extends InstructorListItem {
  owner: boolean;
  account: AccountState;
}

/** Nieaktywny instruktor z notką o wciąż wystawionych miejscach (US 73); `null` — bez notki. */
export interface InactiveInstructorItem extends InstructorListItem {
  note: string | null;
  account: AccountState;
}

/** Model widoku strony instruktorów: aktywni, a pod nimi nieaktywni z notką. */
export interface InstructorList {
  active: ActiveInstructorItem[];
  inactive: InactiveInstructorItem[];
}

const WITH_ACCOUNT: AccountState = { kind: "account", label: "Z kontem" };
const WITHOUT_ACCOUNT: AccountState = { kind: "none", label: "Bez konta" };

/**
 * Konto wygrywa z zaproszeniem; zaproszenie liczy się tylko u aktywnego — baza i tak nie
 * listuje zaproszeń nieaktywnych, a przyjęcie wymaga aktywnego instruktora.
 */
function accountState(instructor: InstructorListItem, invitation: LiveInvitation | undefined): AccountState {
  if (instructor.account_id !== null) {
    return WITH_ACCOUNT;
  }
  if (instructor.active && invitation) {
    return {
      kind: "invited",
      label: `Zaproszenie ważne do ${formatDayMonth(new Date(invitation.expires_at))}`,
      email: invitation.email,
    };
  }
  return WITHOUT_ACCOUNT;
}

/**
 * Lista instruktorów ośrodka podzielona na aktywnych i nieaktywnych (kolejność z
 * `listStableInstructors`). Właścicielem jest instruktor powiązany z kontem właściciela
 * ośrodka (`stables.owner_id`); baza nie pozwala go dezaktywować (SB012), więc stoi wśród
 * aktywnych. Nieaktywny dostaje notkę, w ilu dniach ma jeszcze miejsca, na które jeździec
 * może się zapisać. Każdy dostaje stan konta z żywych zaproszeń ośrodka (`invitations`).
 */
export function composeInstructorList(
  instructors: InstructorListItem[],
  openSeatRows: OpenSeatRow[],
  invitations: LiveInvitation[],
  ownerAccountId: string,
  now: Date = new Date(),
): InstructorList {
  const openSeatDays = countDaysWithOpenSeats(openSeatRows, now);
  const invitationOf = new Map(invitations.map((invitation) => [invitation.instructor_id, invitation]));

  return {
    active: instructors
      .filter((instructor) => instructor.active)
      .map((instructor) => ({
        ...instructor,
        owner: instructor.account_id === ownerAccountId,
        account: accountState(instructor, invitationOf.get(instructor.id)),
      })),
    inactive: instructors
      .filter((instructor) => !instructor.active)
      .map((instructor) => ({
        ...instructor,
        note: openSeatsNote(openSeatDays.get(instructor.id) ?? 0),
        account: accountState(instructor, invitationOf.get(instructor.id)),
      })),
  };
}
