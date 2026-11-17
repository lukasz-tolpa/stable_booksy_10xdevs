import { ANONYMISED_RIDER, NO_HORSE, UNNAMED_RIDER } from "@/lib/bookings/rows";

/**
 * „Moje sloty” instruktora (#72): dni od dziś, w każdym jego godziny z limitem > 0, zajęte
 * miejsca wobec limitu i zapisani jeźdźcy z przydzielonym koniem albo „bez konia”. Tylko odczyt.
 * Limit zero znaczy „nie prowadzę jazdy w tej godzinie” (GLOSSARY „Limit miejsc”), więc taka
 * godzina nie trafia na listę, a dzień bez żadnej prowadzonej godziny — też nie.
 */

/** Slot instruktora: godzina dnia z limitem miejsc (`schedule_slots`). */
export interface MySlotInput {
  day: string;
  hour: number;
  seats: number;
}

/** Aktywny zapis na slot instruktora — z `get_my_slot_bookings`. */
export interface MySlotBookingInput {
  day: string;
  hour: number;
  /** `null` — jeździec bez imienia i nazwiska albo zanonimizowany. */
  riderName: string | null;
  /** `null` — zapis jeszcze bez konia. */
  horseName: string | null;
  /** Jeździec usunął konto (ADR-0001). */
  anonymised: boolean;
}

export interface MySlotRider {
  name: string;
  /** Nazwa konia albo `NO_HORSE`. */
  horse: string;
  hasHorse: boolean;
}

export interface MySlotView {
  hour: number;
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
}

function riderName(booking: MySlotBookingInput): string {
  return booking.anonymised ? ANONYMISED_RIDER : (booking.riderName ?? UNNAMED_RIDER);
}

const slotKey = (day: string, hour: number) => `${day} ${String(hour)}`;

export function composeMySlots(input: MySlotsInput): MySlotsDay[] {
  const ridersBySlot = new Map<string, MySlotRider[]>();
  for (const booking of input.bookings) {
    const key = slotKey(booking.day, booking.hour);
    const riders = ridersBySlot.get(key) ?? [];
    riders.push({
      name: riderName(booking),
      horse: booking.horseName ?? NO_HORSE,
      hasHorse: booking.horseName !== null,
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
    daySlots.push({ hour: slot.hour, seats: slot.seats, taken: riders.length, riders });
    days.set(slot.day, daySlots);
  }

  return [...days].map(([day, slots]) => ({ day, slots }));
}
