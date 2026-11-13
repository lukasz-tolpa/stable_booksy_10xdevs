import type { InstructorListItem } from "@/lib/instructors/queries";
import type { ScheduleDayData, SlotSeats } from "@/lib/schedule/queries";
import type { HorseListItem } from "@/lib/stables/queries";

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
  instructors: InstructorListItem[],
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
  selectableInstructors: InstructorListItem[];
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
  instructors: InstructorListItem[],
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
