import { bookingStateAt } from "@/lib/bookings/status";
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

export interface PendingBookingRow {
  id: number;
  hour: number;
  riderName: string;
  /** `null` — adresu nie udało się odczytać. */
  riderEmail: string | null;
  instructorName: string;
  placeName: string;
  kind: SlotKind;
  freeSeats: number;
  seats: number;
  /** „Wcześniej odrzucony na ten slot” — ośrodek odrzucił już temu jeźdźcowi zapis na ten slot. */
  rejectedBefore: boolean;
  /** Pozostałe zapisy oczekujące tego samego slotu (#128, US 26). */
  othersWaiting: number;
}

export interface PendingBookingsDay {
  day: string;
  rows: PendingBookingRow[];
}

const UNKNOWN_RIDER = "(jeździec)";
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

function freeSeatsOf(booking: PendingBooking): number {
  return Math.max(0, booking.seats - booking.taken);
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
      id: booking.id,
      hour: booking.hour,
      riderName: booking.riderName ?? UNKNOWN_RIDER,
      riderEmail: booking.riderEmail,
      instructorName: booking.instructorName,
      placeName: booking.placeName ?? UNKNOWN_PLACE,
      kind: booking.kind,
      freeSeats: freeSeatsOf(booking),
      seats: booking.seats,
      rejectedBefore: booking.rejectedBefore,
      othersWaiting: (waiting.get(slotKey(booking)) ?? 1) - 1,
    });
  }

  return days;
}

/** Jeździec zapisu oczekującego przy slocie na liście dnia ośrodka. */
export interface PendingSlotRider {
  id: number;
  riderName: string;
  riderEmail: string | null;
  rejectedBefore: boolean;
}

/** Slot dnia z zapisami oczekującymi (#128, US 32): wolne miejsca, liczba czekających i jeźdźcy. */
export interface PendingSlot {
  hour: number;
  instructorName: string;
  placeName: string;
  kind: SlotKind;
  freeSeats: number;
  seats: number;
  /** Zapisy oczekujące slotu — ośrodek widzi tę liczbę zawsze (ADR 0006). */
  waiting: number;
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
  const slots = new Map<string, PendingSlot>();

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
        freeSeats: freeSeatsOf(booking),
        seats: booking.seats,
        waiting: 0,
        rows: [],
      };
      slots.set(key, slot);
    }
    slot.waiting += 1;
    slot.rows.push({
      id: booking.id,
      riderName: booking.riderName ?? UNKNOWN_RIDER,
      riderEmail: booking.riderEmail,
      rejectedBefore: booking.rejectedBefore,
    });
  }

  return [...slots.values()].sort((a, b) => a.hour - b.hour || a.instructorName.localeCompare(b.instructorName, "pl"));
}
