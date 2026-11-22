import { ANONYMISED_RIDER, NO_HORSE, UNNAMED_RIDER } from "@/lib/bookings/rows";

/**
 * „Moje sloty” instruktora (#72): dni od dziś, w każdym jego godziny z limitem > 0, zajęte
 * miejsca wobec limitu i zapisani jeźdźcy z przydzielonym koniem albo „bez konia”, a przy każdym
 * zapisie konie do przydziału (#81): pracujące tego dnia, zajęte o tej godzinie oznaczone „zajęty”.
 * Limit zero znaczy „nie prowadzę jazdy w tej godzinie” (GLOSSARY „Limit miejsc”), więc taka
 * godzina nie trafia na listę, a dzień bez żadnej prowadzonej godziny — też nie.
 */

/** Slot instruktora: godzina dnia z limitem miejsc (`schedule_slots`). */
export interface MySlotInput {
  day: string;
  hour: number;
  seats: number;
  /** Plac slotu (#113). */
  placeName: string;
}

/** Aktywny zapis na slot instruktora — z `get_my_slot_bookings`. */
export interface MySlotBookingInput {
  bookingId: number;
  day: string;
  hour: number;
  /** `null` — jeździec bez imienia i nazwiska albo zanonimizowany. */
  riderName: string | null;
  /** `null` — zapis jeszcze bez konia. */
  horseId: number | null;
  horseName: string | null;
  /** Jeździec usunął konto (ADR-0001). */
  anonymised: boolean;
}

/** Koń do przydziału przy zapisie — z `get_my_slot_horse_options`. */
export interface MySlotHorseOptionInput {
  bookingId: number;
  horseId: number;
  horseName: string;
  /** Koń przydzielony innemu aktywnemu zapisowi o tej godzinie (także na cudzym slocie). */
  taken: boolean;
}

/** Pozycja listy przydziału konia; zajętej nie da się wybrać. */
export interface MySlotHorseChoice {
  id: number;
  /** Nazwa konia, przy zajętym z dopiskiem `HORSE_TAKEN_LABEL`. */
  label: string;
  taken: boolean;
  /** Koń przydzielony temu zapisowi. */
  selected: boolean;
}

/** Dopisek przy koniu zajętym o tej godzinie. */
export const HORSE_TAKEN_LABEL = "zajęty";

export interface MySlotRider {
  bookingId: number;
  name: string;
  /** Nazwa konia albo `NO_HORSE`. */
  horse: string;
  hasHorse: boolean;
  /** Konie pracujące tego dnia, alfabetycznie; „bez konia” dokłada formularz. */
  horseChoices: MySlotHorseChoice[];
}

export interface MySlotView {
  hour: number;
  placeName: string;
  seats: number;
  taken: number;
  riders: MySlotRider[];
}

export interface MySlotsDay {
  day: string;
  slots: MySlotView[];
}

export interface MySlotsInput {
  slots: MySlotInput[];
  bookings: MySlotBookingInput[];
  horseOptions?: MySlotHorseOptionInput[];
}

function riderName(booking: MySlotBookingInput): string {
  return booking.anonymised ? ANONYMISED_RIDER : (booking.riderName ?? UNNAMED_RIDER);
}

const slotKey = (day: string, hour: number) => `${day} ${String(hour)}`;

function horseChoices(booking: MySlotBookingInput, options: MySlotHorseOptionInput[]): MySlotHorseChoice[] {
  return [...options]
    .sort((a, b) => a.horseName.localeCompare(b.horseName, "pl"))
    .map((option) => ({
      id: option.horseId,
      label: option.taken ? `${option.horseName} — ${HORSE_TAKEN_LABEL}` : option.horseName,
      taken: option.taken,
      selected: option.horseId === booking.horseId,
    }));
}

export function composeMySlots(input: MySlotsInput): MySlotsDay[] {
  const optionsByBooking = new Map<number, MySlotHorseOptionInput[]>();
  for (const option of input.horseOptions ?? []) {
    const options = optionsByBooking.get(option.bookingId) ?? [];
    options.push(option);
    optionsByBooking.set(option.bookingId, options);
  }

  const ridersBySlot = new Map<string, MySlotRider[]>();
  for (const booking of input.bookings) {
    const key = slotKey(booking.day, booking.hour);
    const riders = ridersBySlot.get(key) ?? [];
    riders.push({
      bookingId: booking.bookingId,
      name: riderName(booking),
      horse: booking.horseName ?? NO_HORSE,
      hasHorse: booking.horseName !== null,
      horseChoices: horseChoices(booking, optionsByBooking.get(booking.bookingId) ?? []),
    });
    ridersBySlot.set(key, riders);
  }

  const days = new Map<string, MySlotView[]>();
  const taught = input.slots
    .filter((slot) => slot.seats > 0)
    .sort((a, b) => a.day.localeCompare(b.day) || a.hour - b.hour);

  for (const slot of taught) {
    const riders = (ridersBySlot.get(slotKey(slot.day, slot.hour)) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name, "pl"),
    );
    const daySlots = days.get(slot.day) ?? [];
    daySlots.push({ hour: slot.hour, placeName: slot.placeName, seats: slot.seats, taken: riders.length, riders });
    days.set(slot.day, daySlots);
  }

  return [...days].map(([day, slots]) => ({ day, slots }));
}
