import type { InstructorListItem } from "@/lib/instructors/queries";
import type { PlaceListItem } from "@/lib/places/queries";
import type { ScheduleDayData, SlotSeats } from "@/lib/schedule/queries";
import { seatKey, type KindMap, type PlaceMap } from "@/lib/schedule/sheet";
import type { HorseListItem } from "@/lib/stables/queries";

/** Pola instruktora, których potrzebuje formularz grafiku. */
export type FormInstructor = Pick<InstructorListItem, "id" | "name" | "active">;

export interface HorseDefaults {
  /** `""` — nowy dzień bez żadnego ułożonego wcześniej: pole startuje puste. */
  openHour: number | "";
  closeHour: number | "";
  selectedHorseIds: number[];
  selectableHorses: HorseListItem[];
}

/**
 * Godziny i konie, którymi startuje formularz grafiku dnia. Ułożony dzień pokazuje swój stan,
 * nowy dostaje podpowiedź z ostatnio ułożonego dnia — ośrodki pracują w rytmie, więc
 * przepisywanie tego samego zakresu to najczęstsza czynność na tym ekranie. Wycofany koń jest
 * do wyboru tylko wtedy, gdy jest już zaznaczony.
 */
export function horseDefaults(
  scheduleDay: ScheduleDayData | null,
  latestDay: ScheduleDayData | null,
  horses: HorseListItem[],
): HorseDefaults {
  const hint = scheduleDay ?? latestDay;
  const selectedHorseIds = hint?.horseIds ?? [];

  return {
    openHour: hint?.openHour ?? "",
    closeHour: hint?.closeHour ?? "",
    selectedHorseIds,
    selectableHorses: horses.filter((horse) => horse.active || selectedHorseIds.includes(horse.id)),
  };
}

/**
 * Data dnia, z którego pochodzi szkic (baner na górze formularza), albo `null`. Baner dostaje
 * tylko dzień nieułożony z podpowiedzią — przy edycji ułożonego dnia by mylił.
 */
export function prefillSourceDay(
  scheduleDay: ScheduleDayData | null,
  latestDay: ScheduleDayData | null,
): string | null {
  return scheduleDay ? null : (latestDay?.day ?? null);
}

/** Podsumowanie minionego dnia (tylko do odczytu): zakres godzin, konie i instruktorzy dnia. */
export interface PastDaySummary {
  /** Zakres jak w formularzu, np. `10–16` (godzina zamknięcia wyłącznie). */
  hours: string;
  /** Nazwy po przecinku, w kolejności list stadniny; `brak`, gdy pusto. */
  horseNames: string;
  instructorNames: string;
}

const NONE = "brak";

function namesIn(items: { id: number; name: string }[], ids: number[]): string {
  return (
    items
      .filter((item) => ids.includes(item.id))
      .map((item) => item.name)
      .join(", ") || NONE
  );
}

export function pastDaySummary(
  scheduleDay: ScheduleDayData,
  horses: HorseListItem[],
  instructors: FormInstructor[],
): PastDaySummary {
  return {
    hours: `${String(scheduleDay.openHour)}–${String(scheduleDay.closeHour)}`,
    horseNames: namesIn(horses, scheduleDay.horseIds),
    instructorNames: namesIn(instructors, scheduleDay.instructorIds),
  };
}

export interface InstructorDefaults {
  selectedInstructorIds: number[];
  seats: SlotSeats[];
  selectableInstructors: FormInstructor[];
}

/**
 * Instruktorzy i limity, którymi startuje formularz grafiku dnia.
 *
 * Ułożony dzień pokazuje dokładnie swój stan — także instruktora zdezaktywowanego po
 * ułożeniu, żeby ośrodek mógł mu wyzerować limity (ADR-0002). Nowy dzień podpowiada
 * instruktorów z ostatnio ułożonego dnia, ale wyłącznie aktywnych (nieaktywnego nie da się
 * dodać do dnia, w którym go nie było, więc podpowiedź skończyłaby się odmową), i zawsze
 * z limitem 0 we wszystkich godzinach (US 76) — miejsca ośrodek wystawia świadomie.
 */
export function instructorDefaults(
  scheduleDay: ScheduleDayData | null,
  latestDay: ScheduleDayData | null,
  instructors: FormInstructor[],
): InstructorDefaults {
  const inDay = new Set(scheduleDay?.instructorIds ?? []);
  const selectableInstructors = instructors.filter((instructor) => instructor.active || inDay.has(instructor.id));

  if (scheduleDay) {
    return { selectedInstructorIds: scheduleDay.instructorIds, seats: scheduleDay.seats, selectableInstructors };
  }

  const active = new Set(instructors.filter((instructor) => instructor.active).map((instructor) => instructor.id));
  const selectedInstructorIds = (latestDay?.instructorIds ?? []).filter((id) => active.has(id));

  // Brakująca godzina w `seats` to limit 0 (formularz i `save_schedule_day`).
  return { selectedInstructorIds, seats: [], selectableInstructors };
}

export interface PlaceDefaults {
  /** Plac każdego slotu, którym startuje formularz (`seatKey` → plac); brak wpisu — plac wiersza albo domyślny. */
  places: PlaceMap;
  /** Place do wyboru, w kolejności założenia: aktywne i nieaktywne, na których dzień już ma sloty. */
  selectablePlaces: PlaceListItem[];
  /** Pierwszy założony aktywny plac — tam baza kładzie slot bez wskazanego placu; `null` — brak placów. */
  defaultPlaceId: number | null;
  /** Czy formularz pokazuje wybór placu — przy jednym placu do wyboru nie ma czego wybierać. */
  choosePlace: boolean;
}

/**
 * Place, którymi startuje formularz grafiku dnia. Ułożony dzień pokazuje plac każdego swojego slotu —
 * także plac zdezaktywowany po ułożeniu, bo zostaje w dniach już ułożonych. Szkic podpowiada plac
 * każdego slotu z ostatnio ułożonego dnia, ale tylko aktywny: nieaktywny plac w nowym dniu baza
 * odrzuca (SB031), więc taki slot startuje na placu wiersza albo domyślnym.
 */
export function placeDefaults(
  scheduleDay: ScheduleDayData | null,
  latestDay: ScheduleDayData | null,
  places: PlaceListItem[],
): PlaceDefaults {
  const inDay = new Set(scheduleDay?.seats.map((slot) => slot.placeId) ?? []);
  const selectablePlaces = places.filter((place) => place.active || inDay.has(place.id)).sort((a, b) => a.id - b.id);
  const selectable = new Set(selectablePlaces.map((place) => place.id));
  const hint = scheduleDay ?? latestDay;

  return {
    places: Object.fromEntries(
      (hint?.seats ?? [])
        .filter((slot) => selectable.has(slot.placeId))
        .map((slot) => [seatKey(slot.instructorId, slot.hour), slot.placeId]),
    ),
    selectablePlaces,
    defaultPlaceId: selectablePlaces.find((place) => place.active)?.id ?? null,
    choosePlace: selectablePlaces.length > 1,
  };
}

/**
 * Rodzaj każdego slotu, którym startuje formularz grafiku dnia (#115): ułożony dzień pokazuje swój stan,
 * a szkic kopiuje rodzaj każdego slotu z ostatnio ułożonego dnia. Slot bez wpisu startuje z rodzajem
 * wiersza instruktora albo jako rekreacyjny (`kindAt`) — tak jak nowy slot w bazie.
 */
export function kindDefaults(scheduleDay: ScheduleDayData | null, latestDay: ScheduleDayData | null): KindMap {
  const hint = scheduleDay ?? latestDay;

  return Object.fromEntries((hint?.seats ?? []).map((slot) => [seatKey(slot.instructorId, slot.hour), slot.kind]));
}
