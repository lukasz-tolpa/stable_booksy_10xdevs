/**
 * Podsumowanie miesiąca instruktora z kontem (`/instruktor/podsumowanie`, #90): jeźdźcy i jazdy
 * wyłącznie z jego slotów, bez kolumny instruktora (to zawsze on). Dane to wiersze funkcji
 * `get_my_month_bookings` (instruktor z sesji, tylko aktywne zapisy na jego sloty w zakresie dat);
 * tu są mapowane na wspólny kształt `SummaryBooking`.
 */

import { INSTRUCTOR_MONTH_SUMMARY_ROUTE } from "@/lib/auth/roles";
import { monthSearch, type SummaryMonth } from "@/lib/month-summary/month";
import {
  composeMonthSummary,
  type MonthSummaryView,
  type SummaryBooking,
  type SummaryInstructor,
} from "@/lib/month-summary/summary";

/** Wiersz funkcji `get_my_month_bookings` — aktywny zapis na slot zalogowanego instruktora. */
export interface InstructorSummaryRow {
  /** Dzień grafiku `RRRR-MM-DD`. */
  day: string;
  hour: number;
  /** Klucz jeźdźca z funkcji; `null` — jeździec zanonimizowany. */
  riderKey: string | null;
  /** Nazwa z profilu; `null` — bez nazwy albo zanonimizowany. */
  riderName: string | null;
  /** Przydzielony koń; `null` — jazda bez konia. */
  horseName: string | null;
  /** Jeździec zanonimizowany (ADR-0001) — jazda trafia do wiersza „Usunięci jeźdźcy”. */
  anonymised: boolean;
}

export interface InstructorMonthSummaryInput {
  month: SummaryMonth;
  /** Instruktor konta (`getOwnInstructor`) — wspólny kształt go wymaga, widok go nie pokazuje. */
  instructor: SummaryInstructor;
  /** Zapisy na sloty instruktora z dni miesiąca — liczą się tylko jazdy. */
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
  return composeMonthSummary(
    {
      month: input.month,
      bookings: instructorSummaryBookings(input),
      viewer: "instructor",
      monthHref: instructorMonthHref,
      dayHref: null,
    },
    now,
  );
}
