import { formatDayMonth } from "@/lib/format";
import { countDaysWithOpenSeats, openSeatsNote, type OpenSeatRow } from "@/lib/instructors/open-seats";
import type { InstructorAccount, InstructorListItem, LiveInvitation } from "@/lib/instructors/queries";

/**
 * Stan konta instruktora na liście (#74): ma konto, czeka na nie z żywym zaproszeniem
 * (z adresem, dla którego zaproszenie działa) albo nie ma ani jednego, ani drugiego.
 */
export type AccountState =
  | { kind: "account"; label: string }
  | { kind: "invited"; label: string; email: string }
  | { kind: "none"; label: string };

/**
 * Przycisk zaproszenia przy aktywnym instruktorze bez konta: „Zaproś”, a przy żywym zaproszeniu
 * „Zaproś ponownie” z adresem poprzedniego w polu formularza.
 */
export interface InviteAction {
  summary: "Zaproś" | "Zaproś ponownie";
  defaultEmail: string;
}

/**
 * Przełącznik „Układa grafik” (#78): `granted` — instruktor ma uprawnienie do układania grafiku.
 */
export interface SchedulePermissionToggle {
  granted: boolean;
}

/**
 * Aktywny instruktor; `owner` — właściciel ośrodka (oznaczony, bez przełącznika dezaktywacji);
 * `invite: null` — instruktor ma konto, zaprosić go nie można; `schedulePermission: null` — bez
 * przełącznika „Układa grafik” (właściciel ma wszystkie uprawnienia, a instruktorowi bez konta
 * baza uprawnienia nie nada).
 */
export interface ActiveInstructorItem extends InstructorListItem {
  owner: boolean;
  account: AccountState;
  invite: InviteAction | null;
  schedulePermission: SchedulePermissionToggle | null;
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
function accountState(
  instructor: InstructorListItem,
  account: InstructorAccount | undefined,
  invitation: LiveInvitation | undefined,
): AccountState {
  if (account) {
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
 * Przełącznik tylko u aktywnego instruktora z kontem, który nie jest właścicielem — dokładnie tam,
 * gdzie `set_schedule_permission` nie odmówi (SB023–SB025).
 */
function schedulePermission(account: InstructorAccount | undefined): SchedulePermissionToggle | null {
  if (!account || account.owner) {
    return null;
  }
  return { granted: account.arranges_schedule };
}

function inviteAction(account: AccountState): InviteAction | null {
  switch (account.kind) {
    case "account":
      return null;
    case "invited":
      return { summary: "Zaproś ponownie", defaultEmail: account.email };
    case "none":
      return { summary: "Zaproś", defaultEmail: "" };
  }
}

/**
 * Lista instruktorów ośrodka podzielona na aktywnych i nieaktywnych (kolejność z
 * `listStableInstructors`). Kto ma konto i kto jest właścicielem, mówi `accounts`
 * (`listInstructorAccounts`); właściciela baza nie pozwala dezaktywować (SB012), więc stoi wśród
 * aktywnych. Nieaktywny dostaje notkę, w ilu dniach ma jeszcze miejsca, na które jeździec
 * może się zapisać. Każdy dostaje stan konta z kont i żywych zaproszeń ośrodka (`invitations`);
 * aktywny z kontem (poza właścicielem) — przełącznik „Układa grafik” w stanie z `accounts`.
 */
export function composeInstructorList(
  instructors: InstructorListItem[],
  openSeatRows: OpenSeatRow[],
  invitations: LiveInvitation[],
  accounts: InstructorAccount[],
  now: Date = new Date(),
): InstructorList {
  const openSeatDays = countDaysWithOpenSeats(openSeatRows, now);
  const invitationOf = new Map(invitations.map((invitation) => [invitation.instructor_id, invitation]));
  const accountOf = new Map(accounts.map((account) => [account.instructor_id, account]));
  const stateOf = (instructor: InstructorListItem) =>
    accountState(instructor, accountOf.get(instructor.id), invitationOf.get(instructor.id));

  return {
    active: instructors
      .filter((instructor) => instructor.active)
      .map((instructor) => {
        const account = stateOf(instructor);
        const linked = accountOf.get(instructor.id);
        return {
          ...instructor,
          owner: linked?.owner ?? false,
          account,
          invite: inviteAction(account),
          schedulePermission: schedulePermission(linked),
        };
      }),
    inactive: instructors
      .filter((instructor) => !instructor.active)
      .map((instructor) => ({
        ...instructor,
        note: openSeatsNote(openSeatDays.get(instructor.id) ?? 0),
        account: stateOf(instructor),
      })),
  };
}
