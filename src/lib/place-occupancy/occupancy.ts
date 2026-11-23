import { horsesOnDay, type BoardingHorse } from "@/lib/boarding/month";
import { formatClockHour, formatCount } from "@/lib/format";
import { PLACE_OCCUPANCY_TEXTS, TAKEN_SEAT_FORMS } from "@/lib/place-occupancy/texts";
import { placeNamer } from "@/lib/places/names";
import type { PlaceListItem } from "@/lib/places/queries";
import type { SlotKind } from "@/lib/schedule/kind";

/**
 * Zajętość placów (GLOSSARY „Zajętość placów”, #116): dla dnia ośrodka siatka godzina × plac — w komórce
 * sloty na placu w tej godzinie z instruktorem, rodzajem slotu i liczbą zajętych miejsc, bez jeźdźców i koni.
 * Jeden model dla strony pensjonariusza i widoku właściciela; strony tylko go rysują.
 */

/** Slot dnia na placu — wiersz `public.get_place_occupancy` (sloty bez miejsc i zapisów baza pomija). */
export interface OccupancySlot {
  placeId: number;
  hour: number;
  instructorName: string;
  kind: SlotKind;
  /** Aktywne zapisy slotu. */
  taken: number;
}

export interface PlaceOccupancyInput {
  /** Godziny pracy dnia; `null` — ośrodek nie ułożył grafiku na ten dzień. */
  day: { openHour: number; closeHour: number } | null;
  /** Wszystkie place ośrodka, także nieaktywne (`listStablePlaces`). */
  places: PlaceListItem[];
  slots: OccupancySlot[];
}

export interface OccupancyCellSlot {
  instructorName: string;
  kind: SlotKind;
  /** `slot rekreacyjny` / `slot treningowy`. */
  kindLabel: string;
  /** `3 zajęte miejsca`. */
  takenLabel: string;
}

export interface OccupancyCell {
  placeId: number;
  placeName: string;
  /** Pusta lista — na placu w tej godzinie nie ma slotu. */
  slots: OccupancyCellSlot[];
  /** Suma przy kilku slotach na placu w godzinie (`Razem 5 zajętych miejsc`), inaczej `null`. */
  totalLabel: string | null;
}

export interface OccupancyHour {
  hour: number;
  label: string;
  /** Żaden plac nie ma w tej godzinie slotu. */
  empty: boolean;
  /** Jedna komórka na każdy plac dnia, w kolejności `places`. */
  cells: OccupancyCell[];
}

export type PlaceOccupancyView =
  | { scheduled: false }
  | { scheduled: true; places: { id: number; name: string }[]; hours: OccupancyHour[] };

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "pl");

function takenLabel(taken: number): string {
  return formatCount(taken, TAKEN_SEAT_FORMS);
}

export function composePlaceOccupancy(input: PlaceOccupancyInput): PlaceOccupancyView {
  if (input.day === null) {
    return { scheduled: false };
  }

  // Kolumny: place aktywne i place, na których dzień ma sloty (nieaktywny plac tylko w takim dniu).
  const nameOf = placeNamer(input.places);
  const placeIds = new Set([
    ...input.places.filter((place) => place.active).map((place) => place.id),
    ...input.slots.map((slot) => slot.placeId),
  ]);
  const places = [...placeIds].map((id) => ({ id, name: nameOf(id) })).sort(byName);

  const hourSet = new Set(input.slots.map((slot) => slot.hour));
  for (let hour = input.day.openHour; hour < input.day.closeHour; hour += 1) {
    hourSet.add(hour);
  }

  const hours = [...hourSet]
    .sort((a, b) => a - b)
    .map((hour): OccupancyHour => {
      const cells = places.map((place): OccupancyCell => {
        const slots = input.slots
          .filter((slot) => slot.hour === hour && slot.placeId === place.id)
          .sort((a, b) => a.instructorName.localeCompare(b.instructorName, "pl"));
        const total = slots.reduce((sum, slot) => sum + slot.taken, 0);
        return {
          placeId: place.id,
          placeName: place.name,
          slots: slots.map((slot) => ({
            instructorName: slot.instructorName,
            kind: slot.kind,
            kindLabel: PLACE_OCCUPANCY_TEXTS.kind[slot.kind],
            takenLabel: takenLabel(slot.taken),
          })),
          totalLabel: slots.length > 1 ? `${PLACE_OCCUPANCY_TEXTS.total} ${takenLabel(total)}` : null,
        };
      });
      return {
        hour,
        label: formatClockHour(hour),
        empty: cells.every((cell) => cell.slots.length === 0),
        cells,
      };
    });

  return { scheduled: true, places, hours };
}

/** Koń pensjonatowy jeźdźca z ośrodkiem i pobytami — źródło ośrodków zajętości placów pensjonariusza. */
export type BoarderHorseStays = Pick<BoardingHorse, "stableId" | "stableName" | "stays">;

/**
 * Ośrodki, których zajętość placów widzi pensjonariusz: te, w których jego koń stoi dziś (pobyt obejmuje
 * dzień `today`). Każdy raz, alfabetycznie. Dostęp do dnia i tak rozstrzyga baza (`get_place_occupancy`).
 */
export function boarderOccupancyStables(
  horses: readonly BoarderHorseStays[],
  today: string,
): { id: number; name: string }[] {
  const stables = new Map<number, string>();
  for (const horse of horsesOnDay(horses, today)) {
    stables.set(horse.stableId, horse.stableName);
  }
  return [...stables].map(([id, name]) => ({ id, name })).sort(byName);
}
