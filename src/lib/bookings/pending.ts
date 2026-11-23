import { bookingStateAt } from "@/lib/bookings/status";
import { formatOthersWaiting, formatWaitingCount } from "@/lib/bookings/waiting";
import { formatFreeSeats } from "@/lib/format";
import type { SlotKind } from "@/lib/schedule/kind";

/**
 * „Zapisy do przyjęcia” ośrodka (#124, GLOSSARY „Zapis oczekujący”, „Przyjęcie zapisu”): zapisy oczekujące
 * jego slotów, najbliższe terminy na górze, pogrupowane po dniach. Zapis, którego slot się zaczął, jest
 * wygasły (`bookingStateAt`) i znika z listy — o nim ośrodek już nie decyduje. `now` jest wstrzykiwane.
 */

/** Zapis oczekujący z `get_pending_bookings` — jeździec, slot i zajęte miejsca slotu. */
export interface PendingBooking {
  id: number;
  day: string;
  hour: number;
  instructorId: number;
  instructorName: string;
  /** `null` — slotu nie ma już w grafiku. */
  placeName: string | null;
  kind: SlotKind;
  /** Limit miejsc slotu (0 — slotu nie ma w grafiku). */
  seats: number;
  /** Aktywne zapisy slotu. */
  taken: number;
  riderName: string | null;
  riderEmail: string | null;
  createdAt: string;
  /** Ośrodek odrzucił już ręcznie temu jeźdźcowi zapis na ten slot (#125, US 27). */
  rejectedBefore: boolean;
}

/** Wolne miejsca slotu zapisu oczekującego: podpis i to, czy slot jest pełny (wtedy podpis to „Brak miejsc”). */
export interface PendingSlotSeats {
  /** `full` — slot pełny: przyjęcie ponad limit odrzuci baza. */
  full: boolean;
  /** „Brak miejsc” albo np. „2 z 4 wolne”. */
  seatsLabel: string;
}

/** Jeździec zapisu oczekującego — wspólny wiersz „Zapisów do przyjęcia” i zapisów oczekujących dnia. */
export interface PendingSlotRider {
  id: number;
  riderName: string;
  /** `null` — adresu nie udało się odczytać. */
  riderEmail: string | null;
  /** „Wcześniej odrzucony na ten slot” — ośrodek odrzucił już temu jeźdźcowi zapis na ten slot. */
  rejectedBefore: boolean;
}

export interface PendingBookingRow extends PendingSlotRider, PendingSlotSeats {
  hour: number;
  instructorName: string;
  placeName: string;
  kind: SlotKind;
  /** Np. „inni czekający na ten slot: 2” (#128, US 26); `null` — nikt inny nie czeka. */
  othersWaitingLabel: string | null;
}

export interface PendingBookingsDay {
  day: string;
  rows: PendingBookingRow[];
}

/**
 * Jeździec zapisu, którego imienia odczyt nie oddał (profil bez imienia, jeździec anonimizowany). Jedyna definicja:
 * „Zapisy do przyjęcia”, zapisy oczekujące dnia i powiadomienia ośrodka.
 */
export const UNKNOWN_RIDER = "(jeździec)";
const UNKNOWN_PLACE = "(plac)";

function byTerm(a: PendingBooking, b: PendingBooking): number {
  // Daty ISO i znaczniki czasu porównują się poprawnie jako ciągi.
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  if (a.hour !== b.hour) return a.hour - b.hour;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id - b.id;
}

/** Klucz slotu zapisu: dzień × instruktor × godzina. */
function slotKey(booking: PendingBooking): string {
  return `${booking.day}:${String(booking.instructorId)}:${String(booking.hour)}`;
}

/** Zapisy, o których ośrodek jeszcze decyduje (bez wygasłych), w kolejności terminów. */
function undecided(bookings: readonly PendingBooking[], now: Date): PendingBooking[] {
  return [...bookings]
    .filter((booking) => bookingStateAt({ status: "pending", day: booking.day, hour: booking.hour }, now) === "pending")
    .sort(byTerm);
}

/** Liczba zapisów oczekujących każdego slotu. */
function waitingBySlot(bookings: readonly PendingBooking[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const booking of bookings) {
    counts.set(slotKey(booking), (counts.get(slotKey(booking)) ?? 0) + 1);
  }
  return counts;
}

/** Podpis „Brak miejsc” przy pełnym slocie (także limit obniżony poniżej zajętych). */
export const NO_SEATS_LABEL = "Brak miejsc";

function seatsOf(booking: PendingBooking): PendingSlotSeats {
  const freeSeats = Math.max(0, booking.seats - booking.taken);
  return freeSeats === 0
    ? { full: true, seatsLabel: NO_SEATS_LABEL }
    : { full: false, seatsLabel: formatFreeSeats(freeSeats, booking.seats) };
}

function riderOf(booking: PendingBooking): PendingSlotRider {
  return {
    id: booking.id,
    riderName: booking.riderName ?? UNKNOWN_RIDER,
    riderEmail: booking.riderEmail,
    rejectedBefore: booking.rejectedBefore,
  };
}

export function composePendingBookings(bookings: PendingBooking[], now: Date = new Date()): PendingBookingsDay[] {
  const days: PendingBookingsDay[] = [];
  const open = undecided(bookings, now);
  const waiting = waitingBySlot(open);

  for (const booking of open) {
    let day = days.at(-1);
    if (day?.day !== booking.day) {
      day = { day: booking.day, rows: [] };
      days.push(day);
    }
    day.rows.push({
      ...riderOf(booking),
      hour: booking.hour,
      instructorName: booking.instructorName,
      placeName: booking.placeName ?? UNKNOWN_PLACE,
      kind: booking.kind,
      ...seatsOf(booking),
      othersWaitingLabel: formatOthersWaiting((waiting.get(slotKey(booking)) ?? 1) - 1),
    });
  }

  return days;
}

/** Slot dnia z zapisami oczekującymi (#128, US 32): wolne miejsca, liczba czekających i jeźdźcy. */
export interface PendingSlot extends PendingSlotSeats {
  hour: number;
  instructorName: string;
  placeName: string;
  kind: SlotKind;
  /** Zapisy oczekujące slotu, np. „2 czekają” — ośrodek widzi tę liczbę zawsze (ADR 0006). */
  waitingLabel: string;
  /** Kto pierwszy się zapisał, ten wyżej. */
  rows: PendingSlotRider[];
}

/**
 * Zapisy oczekujące jednego dnia przy swoich slotach — „Zapisy dnia” ośrodka (#128): sloty po godzinie
 * i instruktorze, w slocie jeźdźcy w kolejności zapisów. Wygasłe (slot się zaczął) znikają jak na „Zapisach
 * do przyjęcia”.
 */
export function composeDayPendingSlots(
  bookings: readonly PendingBooking[],
  day: string,
  now: Date = new Date(),
): PendingSlot[] {
  const slots = new Map<string, Omit<PendingSlot, "waitingLabel">>();

  for (const booking of undecided(
    bookings.filter((booking) => booking.day === day),
    now,
  )) {
    const key = slotKey(booking);
    let slot = slots.get(key);
    if (!slot) {
      slot = {
        hour: booking.hour,
        instructorName: booking.instructorName,
        placeName: booking.placeName ?? UNKNOWN_PLACE,
        kind: booking.kind,
        ...seatsOf(booking),
        rows: [],
      };
      slots.set(key, slot);
    }
    slot.rows.push(riderOf(booking));
  }

  return [...slots.values()]
    .map((slot) => ({ ...slot, waitingLabel: formatWaitingCount(slot.rows.length) }))
    .sort((a, b) => a.hour - b.hour || a.instructorName.localeCompare(b.instructorName, "pl"));
}
