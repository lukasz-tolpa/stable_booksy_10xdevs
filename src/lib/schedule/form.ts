import type { InstructorListItem } from "@/lib/instructors/queries";
import type { ScheduleDayData, SlotSeats } from "@/lib/schedule/queries";

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
 * instruktorów i limity z ostatnio ułożonego dnia, ale wyłącznie aktywnych: nieaktywnego
 * nie da się dodać do dnia, w którym go nie było, więc podpowiedź skończyłaby się odmową.
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
  const seats = (latestDay?.seats ?? []).filter((slot) => active.has(slot.instructorId));

  return { selectedInstructorIds, seats, selectableInstructors };
}
