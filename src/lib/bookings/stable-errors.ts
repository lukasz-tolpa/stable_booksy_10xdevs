/**
 * Tłumaczenie kodów błędu bazy przy przydziale konia przez ośrodek (#42) na komunikaty.
 *
 * Osobno od `bookingErrorMessage` (odbiorcą jest jeździec) i `scheduleErrorMessage` (zapis
 * grafiku). Gwarancje żyją w bazie (migracje `20261114090000_bookings_on_instructor_seats.sql`
 * i `20261115090000_horse_assignment_by_stable.sql`); aplikacja tylko interpretuje kody.
 * UPDATE samego `horse_id` nie dotyka indeksu jeźdźca ani limitu miejsc, więc każdy z tych
 * kodów ma przy przydziale jedno źródło.
 */

import { INSUFFICIENT_PRIVILEGE } from "@/lib/db-errors";

/** Koń ma już aktywny zapis o tej godzinie dnia — indeks `bookings_horse_hour_key`. */
export const HORSE_TAKEN_THIS_HOUR = "23505";
/**
 * Koń nie pracuje tego dnia — przy slocie rekreacyjnym wyzwalacz `bookings_slot_rules` (#115) z nazwą dawnego
 * klucza obcego `bookings_assigned_horse_fkey` do `schedule_day_horses`.
 */
export const HORSE_NOT_WORKING_THIS_DAY = "23503";
/** Zapis nie jest już aktywny — CHECK `bookings_horse_only_when_active_check`. */
export const BOOKING_NOT_ACTIVE = "23514";
/**
 * Przy slocie treningowym koń spoza koni pensjonatowych zapisanego pensjonariusza z pobytem w dniu jazdy —
 * wyzwalacz `bookings_slot_rules` (#115).
 */
export const NOT_RIDERS_BOARDING_HORSE = "SB051";
/** Cofnięcie konia („bez konia”) przy zapisie na slot treningowy — wyzwalacz `bookings_slot_rules` (#112). */
export const TRAINING_BOOKING_NEEDS_HORSE = "SB063";

const FALLBACK = "Nie udało się przydzielić konia. Spróbuj ponownie.";

/** Zapis spoza grafiku ośrodka, nieistniejący albo już nieaktywny (przydział i odwołanie). */
export const STABLE_BOOKING_NOT_FOUND = "Nie znaleziono aktywnego zapisu w Twoim grafiku.";
/** Odwołanie zapisu, którego slot już się zaczął (`hasSlotStarted`). */
export const STABLE_CANCEL_SLOT_STARTED = "Nie można odwołać jazdy, która już się zaczęła.";
/** Odwołanie przez ośrodek nie powiodło się z przyczyny spoza reguł (awaria). */
export const STABLE_CANCEL_FAILED = "Nie udało się odwołać zapisu. Spróbuj ponownie.";

/**
 * Zapis spoza slotów instruktora, nieistniejący albo instruktor nieaktywny — odmowa 42501
 * funkcji `assign_my_slot_horse` (#81).
 */
export const NOT_MY_SLOT_BOOKING = INSUFFICIENT_PRIVILEGE;

/** Odmowy reguły przydziału przez ośrodek — zamknięty zbiór kodów z polskim komunikatem. */
const OWNER_MESSAGES = new Map<string, string>([
  [
    HORSE_TAKEN_THIS_HOUR,
    "Ten koń ma już jazdę o tej godzinie. Wybierz innego konia albo najpierw zmień tamten przydział.",
  ],
  [HORSE_NOT_WORKING_THIS_DAY, "Ten koń nie pracuje tego dnia. Dodaj go w grafiku dnia albo wybierz innego."],
  [BOOKING_NOT_ACTIVE, "Zapis został odwołany — konia przydziela się tylko do aktywnych zapisów."],
  [
    NOT_RIDERS_BOARDING_HORSE,
    "Przy slocie treningowym jeździec jedzie na swoim koniu pensjonatowym, który stoi w ośrodku w dniu jazdy. Wybierz jednego z jego koni.",
  ],
  [
    TRAINING_BOOKING_NEEDS_HORSE,
    "Przy slocie treningowym jeździec zawsze jedzie na swoim koniu pensjonatowym — nie da się zostawić zapisu bez konia. Wybierz jednego z jego koni.",
  ],
]);

/**
 * Te same odmowy przy przydziale konia przez instruktora w „Moje sloty” (#81) — komunikaty ośrodka
 * z nadpisaniami. Instruktor nie dodaje koni do grafiku dnia ani nie zmienia przydziału na cudzym
 * slocie, więc komunikat każe mu tylko wybrać innego konia; dochodzi odmowa zapisu spoza jego slotów.
 */
const INSTRUCTOR_MESSAGES = new Map<string, string>([
  ...OWNER_MESSAGES,
  [HORSE_TAKEN_THIS_HOUR, "Ten koń ma już jazdę o tej godzinie. Wybierz innego konia."],
  [HORSE_NOT_WORKING_THIS_DAY, "Ten koń nie pracuje tego dnia. Wybierz innego konia."],
  [NOT_MY_SLOT_BOOKING, "Nie znaleziono aktywnego zapisu na Twój slot."],
]);

/** Czy kod to odmowa reguły przydziału (decyzja ośrodka), a nie awaria warta logu. */
export function isHorseAssignmentRefusal(code: string | undefined): boolean {
  return code !== undefined && OWNER_MESSAGES.has(code);
}

export function horseAssignmentErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : OWNER_MESSAGES.get(code)) ?? FALLBACK;
}

/** Czy kod to odmowa przydziału przez instruktora (reguła albo zapis spoza jego slotów), a nie awaria. */
export function isInstructorHorseAssignmentRefusal(code: string | undefined): boolean {
  return code !== undefined && INSTRUCTOR_MESSAGES.has(code);
}

/** Komunikat odmowy przydziału przez instruktora w „Moje sloty”. */
export function instructorHorseAssignmentErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : INSTRUCTOR_MESSAGES.get(code)) ?? FALLBACK;
}
