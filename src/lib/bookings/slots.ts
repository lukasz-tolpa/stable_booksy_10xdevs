import { SCHEDULE_TIME_ZONE } from "@/lib/schedule/dates";

/**
 * Wyliczanie wolnych slotów (godzina × koń) dla jeźdźca — jedyne miejsce, w którym
 * żyje reguła alokacji po stronie odczytu. Strona `.astro` tylko renderuje wynik.
 *
 * Godziny pracy to przedział półotwarty [openHour, closeHour): zakres 10-16 daje
 * sloty o 10, 11, 12, 13, 14 i 15.
 *
 * Godzina, w której nie ma ani jednego konia `free` ani `mine`, jest pomijana
 * w całości — PRD każe pokazywać wyłącznie wolne sloty, a na telefonie krótsza
 * lista wygrywa. Godzina z własnym zapisem pozostaje widoczna, żeby jeździec
 * widział swój zapis w kontekście dnia.
 */

/** Para identyfikująca slot; wspólny kształt zajętości i własnych zapisów. */
export interface SlotKey {
  horseId: number;
  hour: number;
}

/** `free` — do wzięcia; `mine` — własny aktywny zapis (renderowany jako „Twój zapis"). */
export type SlotStatus = "free" | "mine";

export interface SlotHorse {
  id: number;
  name: string;
  status: SlotStatus;
}

export interface SlotSection {
  hour: number;
  horses: SlotHorse[];
}

export interface SlotSectionsInput {
  openHour: number;
  closeHour: number;
  /** Konie przydzielone do dnia (kontrakt bazy: FK sprawdza przydział, nie flagę `active`). */
  horses: { id: number; name: string }[];
  /** Zajęte sloty całego dnia z `get_taken_slots` — łącznie z własnymi zapisami. */
  takenSlots: SlotKey[];
  /** Własne aktywne zapisy w tym dniu; podzbiór `takenSlots`. */
  myBookings: SlotKey[];
  /**
   * Bieżąca godzina w strefie Europe/Warsaw, gdy oglądany dzień to dziś; `null` dla
   * dni przyszłych. Slot o godzinie <= currentHour uznajemy za miniony (jazda już trwa).
   */
  currentHour: number | null;
}

/**
 * Konie ofiarowane jeźdźcowi danego dnia: reguła PRD „koń przydzielony do pracy
 * tego dnia". Jedynym kryterium jest przydział (`schedule_day_horses`) — flaga
 * `active` jest celowo ignorowana, zgodnie z kontraktem bazy (FK sprawdza przydział,
 * nie flagę) i decyzją z S-04: emerytowany koń, który wciąż jest przydzielony do
 * dnia, pozostaje do wzięcia; `active` steruje wyłącznie widokiem stada ośrodka.
 *
 * Kolejność wejścia jest zachowana (strona podaje `active desc, name asc`);
 * identyfikatory przydziału bez konia w stadzie są pomijane.
 */
export function assignedHorses(
  horses: readonly { id: number; name: string; active?: boolean }[],
  assignedIds: readonly number[],
): { id: number; name: string }[] {
  const assigned = new Set(assignedIds);
  return horses.filter((horse) => assigned.has(horse.id)).map(({ id, name }) => ({ id, name }));
}

function slotKeySet(slots: SlotKey[]): Set<string> {
  return new Set(slots.map((slot) => `${String(slot.horseId)}:${String(slot.hour)}`));
}

export function computeSlotSections(input: SlotSectionsInput): SlotSection[] {
  const taken = slotKeySet(input.takenSlots);
  const mine = slotKeySet(input.myBookings);
  const sections: SlotSection[] = [];

  for (let hour = input.openHour; hour < input.closeHour; hour++) {
    if (input.currentHour !== null && hour <= input.currentHour) {
      continue;
    }

    const horses: SlotHorse[] = [];
    for (const horse of input.horses) {
      const key = `${String(horse.id)}:${String(hour)}`;
      // Kolejność sprawdzeń jest istotna: własny zapis występuje też w zajętości,
      // więc `mine` musi iść przed `taken`.
      if (mine.has(key)) {
        horses.push({ id: horse.id, name: horse.name, status: "mine" });
      } else if (!taken.has(key)) {
        horses.push({ id: horse.id, name: horse.name, status: "free" });
      }
    }

    if (horses.length > 0) {
      sections.push({ hour, horses });
    }
  }

  return sections;
}

/**
 * Bieżąca godzina w strefie Europe/Warsaw — próg filtra minionych slotów.
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
