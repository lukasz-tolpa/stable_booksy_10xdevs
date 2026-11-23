/**
 * Podsumowanie miesiąca instruktora z kontem (`/instruktor/podsumowanie`, #90): jeźdźcy i jazdy
 * wyłącznie z jego slotów, bez kolumny instruktora (to zawsze on), w sekcjach „Rekreacja” i „Pensjonariusze”
 * (#118). Dane to wiersze funkcji `get_my_month_bookings` (instruktor z sesji, tylko aktywne zapisy na jego
 * sloty w zakresie dat, z regułą „pensjonariusz w miesiącu” z bazy); tu są mapowane na wspólny kształt
 * `SummaryBooking`.
 */

import { INSTRUCTOR_MONTH_SUMMARY_ROUTE } from "@/lib/auth/roles";
import { monthSearch, type SummaryMonth } from "@/lib/month-summary/month";
import type { InstructorSummaryRow } from "@/lib/my-slots/queries";
import {
  composeMonthSummary,
  type MonthSummaryView,
  type SummaryBooking,
  type SummaryInstructor,
} from "@/lib/month-summary/summary";

export interface InstructorMonthSummaryInput {
  month: SummaryMonth;
  /** Instruktor konta (`getOwnInstructor`) — wspólny kształt go wymaga, widok go nie pokazuje. */
  instructor: SummaryInstructor;
  /** Zapisy na sloty instruktora z dni miesiąca (`getMyMonthBookings`) — liczą się tylko jazdy. */
  bookings: InstructorSummaryRow[];
}

/** Adres Podsumowania miesiąca instruktora dla miesiąca `RRRR-MM`. */
export function instructorMonthHref(month: string): string {
  return `${INSTRUCTOR_MONTH_SUMMARY_ROUTE}${monthSearch(month)}`;
}

/** Wiersze funkcji instruktora we wspólnym kształcie podsumowania. */
function instructorSummaryBookings(input: InstructorMonthSummaryInput): SummaryBooking[] {
  return input.bookings.map((row) => ({
    day: row.day,
    hour: row.hour,
    // Funkcja zwraca wyłącznie aktywne zapisy.
    status: "active",
    riderKey: row.anonymised ? null : row.riderKey,
    riderName: row.anonymised ? null : row.riderName,
    instructor: input.instructor,
    horseName: row.horseName,
  }));
}

/** Widok instruktora: daty bez linków (Zapisy dnia są w przestrzeni ośrodka). `now` jak w statystykach. */
export function composeInstructorMonthSummary(
  input: InstructorMonthSummaryInput,
  now: Date = new Date(),
): MonthSummaryView {
  // Reguła „pensjonariusz w miesiącu” przychodzi z bazy przy każdym zapisie — instruktor nie czyta pobytów.
  const boarders = new Set(input.bookings.flatMap((row) => (row.boarder && row.riderKey ? [row.riderKey] : [])));
  return composeMonthSummary(
    {
      month: input.month,
      bookings: instructorSummaryBookings(input),
      viewer: "instructor",
      monthHref: instructorMonthHref,
      dayHref: null,
      isBoarder: (riderKey) => boarders.has(riderKey),
    },
    now,
  );
}
