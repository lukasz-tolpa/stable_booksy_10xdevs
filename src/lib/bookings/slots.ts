import { isPastDate, SCHEDULE_TIME_ZONE, todayIso } from "@/lib/schedule/dates";
import type { SlotSeats } from "@/lib/schedule/queries";

/**
 * Sloty dnia widziane przez jeźdźca (ADR-0002, GLOSSARY „Slot", „Limit miejsc") — jedyne
 * miejsce, w którym żyje reguła odczytu. Strona `.astro` tylko renderuje wynik.
 *
 * Slot to jedna godzina jednego instruktora z limitem miejsc. Godziny pracy to przedział
 * półotwarty [openHour, closeHour). Pomijane są sloty z limitem zero i godziny, które się
 * zaczęły; godzina bez żadnego pokazanego slotu znika w całości.
 */

/** Liczba aktywnych zapisów w slocie — z `get_slot_occupancy`, bez tożsamości jeźdźców. */
export interface SlotOccupancy {
  instructorId: number;
  hour: number;
  taken: number;
}

/** Własny aktywny zapis jeźdźca w oglądanym dniu. */
export interface MySlot {
  instructorId: number;
  hour: number;
}

/**
 * `free` — są wolne miejsca; `mine` — własny aktywny zapis; `full` — brak wolnych miejsc;
 * `unavailable` — jeździec ma już aktywny zapis o tej godzinie u innego instruktora (baza
 * odmówiłaby drugiego zapisu na tę godzinę).
 */
export type SlotStatus = "free" | "mine" | "full" | "unavailable";

const SLOT_STATUS_LABELS: Record<Exclude<SlotStatus, "free">, string> = {
  mine: "Twój zapis",
  full: "Brak miejsc",
  unavailable: "Masz już zapis o tej godzinie",
};

/** Podpis pigułki slotu, na który nie da się zapisać; `null` — wolny slot ma przycisk zapisu. */
export function slotStatusLabel(status: SlotStatus): string | null {
  return status === "free" ? null : SLOT_STATUS_LABELS[status];
}

export interface RiderSlot {
  instructorId: number;
  instructorName: string;
  seats: number;
  freeSeats: number;
  status: SlotStatus;
}

export interface SlotHour {
  hour: number;
  slots: RiderSlot[];
}

export interface SlotHoursInput {
  openHour: number;
  closeHour: number;
  /** Instruktorzy stadniny (także nieaktywni — ich sloty zostają otwarte) — źródło nazw. */
  instructors: { id: number; name: string }[];
  /** Limity miejsc dnia (`ScheduleDayData.seats`). */
  seats: SlotSeats[];
  occupancy: SlotOccupancy[];
  myBookings: MySlot[];
  /**
   * Bieżąca godzina w strefie Europe/Warsaw, gdy oglądany dzień to dziś; `null` dla
   * dni przyszłych. Slot o godzinie <= currentHour uznajemy za rozpoczęty (jazda już trwa).
   */
  currentHour: number | null;
}

/** Nazwa zastępcza instruktora spoza listy — wiersz z identyfikatorem zamiast wywróconego widoku. */
export function unknownInstructorName(instructorId: number): string {
  return `(instruktor #${String(instructorId)})`;
}

/** Klucz slotu dnia (instruktor × godzina) w mapach zajętości i własnych zapisów. */
function slotKey(instructorId: number, hour: number): string {
  return `${String(instructorId)}:${String(hour)}`;
}

function statusOf(slot: SlotSeats, freeSeats: number, mine: Set<string>, myHours: Set<number>): SlotStatus {
  if (mine.has(slotKey(slot.instructorId, slot.hour))) return "mine";
  if (myHours.has(slot.hour)) return "unavailable";
  return freeSeats > 0 ? "free" : "full";
}

export function computeSlotHours(input: SlotHoursInput): SlotHour[] {
  const names = new Map(input.instructors.map((instructor) => [instructor.id, instructor.name]));
  const taken = new Map(input.occupancy.map((entry) => [slotKey(entry.instructorId, entry.hour), entry.taken]));
  const mine = new Set(input.myBookings.map((booking) => slotKey(booking.instructorId, booking.hour)));
  const myHours = new Set(input.myBookings.map((booking) => booking.hour));
  const byHour = new Map<number, RiderSlot[]>();

  for (const slot of input.seats) {
    if (slot.seats <= 0) continue;
    if (slot.hour < input.openHour || slot.hour >= input.closeHour) continue;
    if (input.currentHour !== null && slot.hour <= input.currentHour) continue;

    const freeSeats = Math.max(0, slot.seats - (taken.get(slotKey(slot.instructorId, slot.hour)) ?? 0));
    const slots = byHour.get(slot.hour) ?? [];
    slots.push({
      instructorId: slot.instructorId,
      instructorName: names.get(slot.instructorId) ?? unknownInstructorName(slot.instructorId),
      seats: slot.seats,
      freeSeats,
      status: statusOf(slot, freeSeats, mine, myHours),
    });
    byHour.set(slot.hour, slots);
  }

  return [...byHour]
    .sort(([a], [b]) => a - b)
    .map(([hour, slots]) => ({
      hour,
      slots: slots.sort(
        (a, b) => a.instructorName.localeCompare(b.instructorName, "pl") || a.instructorId - b.instructorId,
      ),
    }));
}

/**
 * Bieżąca godzina w strefie Europe/Warsaw — próg filtra rozpoczętych slotów.
 *
 * Liczona jawnie w strefie ośrodka, nie środowiska: aplikacja stoi na Cloudflare
 * Workers (UTC), więc `new Date().getHours()` myliłoby się o godzinę lub dwie.
 * `now` jest wstrzykiwane parametrem, żeby testy nie zależały od zegara.
 */
export function currentWarsawHour(now: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHEDULE_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);

  return Number(formatted);
}

/**
 * Czy slot (dzień grafiku × godzina) już się zaczął — jedyna definicja progu „godzina już się
 * zaczęła" (Europe/Warsaw): dzień miniony w całości, a dziś godzina <= bieżąca (jazda trwa).
 * Po tym progu jeździec nie zapisze się ani nie odwoła, a ośrodek nie odwoła zapisu; baza go
 * nie pilnuje, więc w endpointach to jedyna linia obrony.
 */
export function hasSlotStarted(day: string, hour: number, now: Date = new Date()): boolean {
  const today = todayIso(now);
  return isPastDate(day, today) || (day === today && hour <= currentWarsawHour(now));
}
