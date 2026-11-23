import { horsesOnDay, isBoarderWith, type BoardingHorse } from "@/lib/boarding/month";
import { placeNamer, type PlaceName } from "@/lib/places/names";
import { isPastDate, SCHEDULE_TIME_ZONE, todayIso } from "@/lib/schedule/dates";
import { SLOT_KIND, type SlotKind } from "@/lib/schedule/kind";
import type { SlotSeats } from "@/lib/schedule/queries";

/**
 * Sloty dnia widziane przez jeźdźca (ADR-0002, GLOSSARY „Slot", „Limit miejsc") — jedyne
 * miejsce, w którym żyje reguła odczytu. Strona `.astro` tylko renderuje wynik.
 *
 * Slot to jedna godzina jednego instruktora z limitem miejsc. Godziny pracy to przedział
 * półotwarty [openHour, closeHour). Pomijane są sloty z limitem zero i godziny, które się
 * zaczęły; godzina bez żadnego pokazanego slotu znika w całości.
 *
 * Rodzaj slotu wobec jeźdźca (#115, GLOSSARY „Slot treningowy”): jeździec rekreacyjny nie dostaje slotów
 * treningowych ani dni, w których są wyłącznie takie (`riderSeesDay`); pensjonariusz (reguła „pensjonariusz
 * w miesiącu”, `riderStandingOn`) dostaje sloty treningowe z końmi do zapisu, a rekreacyjne — jako nie dla
 * siebie. Odmowy i tak podnosi baza (wyzwalacz `bookings_slot_rules`); tu tylko to, co jeździec widzi.
 */

/** Liczba aktywnych zapisów w slocie — z `get_slot_occupancy`, bez tożsamości jeźdźców. */
export interface SlotOccupancy {
  instructorId: number;
  hour: number;
  taken: number;
}

/** Własny zapis jeźdźca w oglądanym dniu: aktywny albo oczekujący (`pending`). */
export interface MySlot {
  instructorId: number;
  hour: number;
  /** Zapis czeka na przyjęcie przez ośrodek (GLOSSARY „Zapis oczekujący”). */
  pending?: boolean;
}

/**
 * `free` — są wolne miejsca; `mine` — własny aktywny zapis; `pending` — własny zapis czeka na przyjęcie;
 * `full` — brak wolnych miejsc; `unavailable` — jeździec ma już zapis (aktywny albo oczekujący) o tej
 * godzinie u innego instruktora (baza odmówiłaby drugiego zapisu na tę godzinę); `not_for_me` — slot rekreacyjny u pensjonariusza (SB049);
 * `no_horse` — slot treningowy, a żaden koń pensjonariusza nie stoi tego dnia w ośrodku (SB053).
 */
export type SlotStatus = "free" | "mine" | "pending" | "full" | "unavailable" | "not_for_me" | "no_horse";

const SLOT_STATUS_LABELS: Record<Exclude<SlotStatus, "free">, string> = {
  mine: "Twój zapis",
  pending: "Czekasz na przyjęcie",
  full: "Brak miejsc",
  unavailable: "Masz już zapis o tej godzinie",
  not_for_me: "Slot rekreacyjny — nie dla pensjonariuszy",
  no_horse: "Twój koń nie stoi tego dnia w ośrodku",
};

/** Podpis pigułki slotu, na który nie da się zapisać; `null` — wolny slot ma przycisk zapisu. */
export function slotStatusLabel(status: SlotStatus): string | null {
  return status === "free" ? null : SLOT_STATUS_LABELS[status];
}

/** Koń pensjonatowy jeźdźca do zapisu na slot treningowy. */
export interface RiderHorse {
  id: number;
  name: string;
}

/**
 * Kim jest jeździec w ośrodku w oglądanym dniu: rekreacyjny albo pensjonariusz (reguła „pensjonariusz
 * w miesiącu”) z końmi, których pobyt obejmuje ten dzień.
 */
export type RiderStanding = { boarder: false } | { boarder: true; horses: RiderHorse[] };

/** Koń pensjonatowy jeźdźca w ośrodku z pobytami — z `listBoardingHorses`. */
export type StandingHorse = Pick<BoardingHorse, "horseId" | "horseName" | "stays">;

/**
 * Jeździec wobec dnia ośrodka: pensjonariusz, gdy pobyt choć jednego jego konia w tym ośrodku zachodzi
 * na miesiąc dnia (`isBoarderWith`), z końmi, których pobyt obejmuje dzień (`horsesOnDay`), alfabetycznie.
 */
export function riderStandingOn(horses: readonly StandingHorse[], day: string): RiderStanding {
  if (!isBoarderWith(horses, day.slice(0, 7))) {
    return { boarder: false };
  }

  return {
    boarder: true,
    horses: horsesOnDay(horses, day)
      .map(({ horseId, horseName }) => ({ id: horseId, name: horseName }))
      .sort((a, b) => a.name.localeCompare(b.name, "pl") || a.id - b.id),
  };
}

/**
 * Czy jeździec widzi ułożony dzień: pensjonariusz — zawsze, jeździec rekreacyjny — tylko gdy dzień ma choć
 * jeden slot rekreacyjny z miejscami (dzień z samymi slotami treningowymi jest dla niego nieułożony).
 */
export function riderSeesDay(seats: readonly SlotSeats[], standing: RiderStanding): boolean {
  return standing.boarder || seats.some((slot) => slot.kind === SLOT_KIND.recreation && slot.seats > 0);
}

export interface RiderSlot {
  instructorId: number;
  instructorName: string;
  /** Plac slotu (#113). */
  placeName: string;
  seats: number;
  freeSeats: number;
  status: SlotStatus;
  /** Rodzaj slotu (#115). */
  kind: SlotKind;
  /** Konie pensjonariusza do zapisu na slot treningowy (jeden — przydzielony od razu, kilka — wybór); inaczej pusto. */
  horses: RiderHorse[];
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
  /** Place ośrodka (także nieaktywne — zostają w dniach już ułożonych) — źródło nazw. */
  places: PlaceName[];
  /** Limity miejsc dnia (`ScheduleDayData.seats`). */
  seats: SlotSeats[];
  occupancy: SlotOccupancy[];
  myBookings: MySlot[];
  /**
   * Bieżąca godzina w strefie Europe/Warsaw, gdy oglądany dzień to dziś; `null` dla
   * dni przyszłych. Slot o godzinie <= currentHour uznajemy za rozpoczęty (jazda już trwa).
   */
  currentHour: number | null;
  /** Jeździec wobec oglądanego dnia (`riderStandingOn`). */
  standing: RiderStanding;
}

/** Nazwa zastępcza instruktora spoza listy — wiersz z identyfikatorem zamiast wywróconego widoku. */
export function unknownInstructorName(instructorId: number): string {
  return `(instruktor #${String(instructorId)})`;
}

/** Klucz slotu dnia (instruktor × godzina) w mapach zajętości i własnych zapisów. */
function slotKey(instructorId: number, hour: number): string {
  return `${String(instructorId)}:${String(hour)}`;
}

function statusOf(
  slot: SlotSeats,
  freeSeats: number,
  mine: Map<string, MySlot>,
  myHours: Set<number>,
  standing: RiderStanding,
): SlotStatus {
  const own = mine.get(slotKey(slot.instructorId, slot.hour));
  if (own) return own.pending ? "pending" : "mine";
  if (myHours.has(slot.hour)) return "unavailable";
  if (standing.boarder && slot.kind === SLOT_KIND.recreation) return "not_for_me";
  if (standing.boarder && standing.horses.length === 0) return "no_horse";
  return freeSeats > 0 ? "free" : "full";
}

export function computeSlotHours(input: SlotHoursInput): SlotHour[] {
  const names = new Map(input.instructors.map((instructor) => [instructor.id, instructor.name]));
  const placeName = placeNamer(input.places);
  const taken = new Map(input.occupancy.map((entry) => [slotKey(entry.instructorId, entry.hour), entry.taken]));
  const mine = new Map(input.myBookings.map((booking) => [slotKey(booking.instructorId, booking.hour), booking]));
  const myHours = new Set(input.myBookings.map((booking) => booking.hour));
  const byHour = new Map<number, RiderSlot[]>();

  const { standing } = input;

  for (const slot of input.seats) {
    if (slot.seats <= 0) continue;
    if (!standing.boarder && slot.kind === SLOT_KIND.training) continue;
    if (slot.hour < input.openHour || slot.hour >= input.closeHour) continue;
    if (input.currentHour !== null && slot.hour <= input.currentHour) continue;

    const freeSeats = Math.max(0, slot.seats - (taken.get(slotKey(slot.instructorId, slot.hour)) ?? 0));
    const slots = byHour.get(slot.hour) ?? [];
    slots.push({
      instructorId: slot.instructorId,
      instructorName: names.get(slot.instructorId) ?? unknownInstructorName(slot.instructorId),
      placeName: placeName(slot.placeId),
      seats: slot.seats,
      freeSeats,
      status: statusOf(slot, freeSeats, mine, myHours, standing),
      kind: slot.kind,
      horses: standing.boarder && slot.kind === SLOT_KIND.training ? standing.horses : [],
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
