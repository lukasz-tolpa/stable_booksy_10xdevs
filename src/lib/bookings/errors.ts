/**
 * Tłumaczenie kodów błędu bazy na komunikaty dla jeźdźca.
 *
 * Odpowiednik `scheduleErrorMessage`, w osobnym module, bo odbiorcą jest jeździec, nie
 * ośrodek. Guardraile żyją w bazie (migracja `20261114090000_bookings_on_instructor_seats.sql`);
 * aplikacja ich nie powiela, tylko interpretuje kody — a tam, gdzie kilka ograniczeń dzieli
 * jeden SQLSTATE, także nazwę ograniczenia (`errorConstraint`). Odmowy rodzaju slotu SB049–SB053
 * podnosi wyzwalacz `bookings_slot_rules` (migracja `20261202090000_training_slots.sql`, #115).
 */

/** Brak wolnych miejsc w slocie — wyzwalacz `bookings_seat_limit` (także slot z limitem zero). */
export const NO_SEATS_LEFT = "SB009";
/**
 * Naruszenie indeksu unikalnego: drugi aktywny zapis jeźdźca na tę samą godzinę dnia
 * (`bookings_rider_hour_key`) albo koń zajęty o tej godzinie (`bookings_horse_hour_key`).
 */
export const ALREADY_BOOKED_THIS_HOUR = "23505";
/** Godzina poza zakresem [open_hour, close_hour) — wyzwalacz `bookings_seat_limit` (bez nazwy ograniczenia). */
export const HOUR_OUTSIDE_WORKING_HOURS = "23514";
/** Dzień grafiku albo slot instruktora zniknął w międzyczasie — wyzwalacz `bookings_seat_limit` albo FK. */
export const SCHEDULE_CHANGED = "23503";
/** Pensjonariusz (w miesiącu dnia slotu) zapisuje się na slot rekreacyjny. */
export const BOARDER_ON_RECREATION_SLOT = "SB049";
/** Jeździec niebędący pensjonariuszem zapisuje się na slot treningowy. */
export const NOT_A_BOARDER_ON_TRAINING_SLOT = "SB050";
/** Koń przy slocie treningowym nie jest koniem pensjonatowym jeźdźca z pobytem w dniu jazdy (też przydział). */
export const NOT_MY_BOARDING_HORSE = "SB051";
/** Pensjonariusz z kilkoma końmi w dniu jazdy nie wybrał konia. */
export const TRAINING_HORSE_NOT_CHOSEN = "SB052";
/** Żaden koń pensjonariusza nie stoi w ośrodku w dniu jazdy. */
export const NO_HORSE_ON_RIDE_DAY = "SB053";
/**
 * Slot już się zaczął — wyzwalacz `bookings_state_machine` (#124, migracja `20261209090000_booking_acceptance.sql`);
 * ten sam próg co `hasSlotStarted` w endpoincie, który odpowiada wcześniej tym samym zdaniem.
 */
export const SLOT_STARTED = "SB064";

/** Odmowy rodzaju slotu i progu czasu — jeden kod, jeden komunikat. */
const SLOT_KIND_MESSAGES = new Map<string, string>([
  [BOARDER_ON_RECREATION_SLOT, "Jako pensjonariusz jeździsz na swoim koniu — zapisz się na slot treningowy."],
  [
    NOT_A_BOARDER_ON_TRAINING_SLOT,
    "Na slot treningowy zapisują się tylko pensjonariusze ośrodka. Wybierz slot rekreacyjny.",
  ],
  [
    NOT_MY_BOARDING_HORSE,
    "Na slot treningowy zapisujesz się na swoim koniu, który stoi w ośrodku w dniu jazdy. Wybierz swojego konia.",
  ],
  [TRAINING_HORSE_NOT_CHOSEN, "Masz w ośrodku kilka koni — wybierz, na którym jedziesz."],
  [
    NO_HORSE_ON_RIDE_DAY,
    "Żaden z Twoich koni nie stoi w ośrodku w dniu jazdy, więc nie zapiszesz się na slot treningowy.",
  ],
  [SLOT_STARTED, "Ta godzina już minęła. Wybierz późniejszy slot."],
]);

const RIDER_HOUR_KEY = "bookings_rider_hour_key";
const HORSE_HOUR_KEY = "bookings_horse_hour_key";
/** CHECK zakresu godziny — jedyny CHECK z 23514, który mówi o godzinie. */
const HOUR_CHECK = "bookings_hour_check";

const FALLBACK = "Nie udało się zapisać na jazdę. Spróbuj ponownie.";

/**
 * Komunikat dla jeźdźca. Odmowa przy ostatnim miejscu to projektowany UX, nie awaria.
 * `constraint` — nazwa naruszonego ograniczenia (`errorConstraint`), gdy baza ją podała.
 */
export function bookingErrorMessage(code: string | undefined, constraint?: string): string {
  switch (code) {
    case NO_SEATS_LEFT:
      return "W tym slocie nie ma już wolnych miejsc. Wybierz inną godzinę albo innego instruktora.";
    case ALREADY_BOOKED_THIS_HOUR:
      if (constraint === RIDER_HOUR_KEY) {
        return "Masz już zapis o tej godzinie w tym ośrodku. Żeby jeździć u innego instruktora, najpierw odwołaj tamten zapis.";
      }
      if (constraint === HORSE_HOUR_KEY) {
        return "Koń przydzielony do tej jazdy jest już zajęty o tej godzinie. Odśwież stronę i wybierz inny slot.";
      }
      return FALLBACK;
    case HOUR_OUTSIDE_WORKING_HOURS:
      return constraint === undefined || constraint === HOUR_CHECK
        ? "Wybrana godzina jest poza zakresem pracy ośrodka w tym dniu."
        : FALLBACK;
    case SCHEDULE_CHANGED:
      return "Grafik ośrodka zmienił się w międzyczasie — instruktor nie prowadzi już jazdy o tej godzinie. Odśwież stronę i wybierz inny slot.";
    default:
      return (code === undefined ? undefined : SLOT_KIND_MESSAGES.get(code)) ?? FALLBACK;
  }
}
