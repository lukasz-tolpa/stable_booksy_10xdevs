import { OWNER_SCHEDULE_ROUTE } from "@/lib/auth/roles";
import { STABLE_DAY_BOOKINGS_ROUTE } from "@/lib/bookings/stable-redirect";
import { INSTRUCTORS_ROUTE } from "@/lib/instructors/redirect";
import {
  BOOKING_FORMS,
  formatCount,
  formatHourRange,
  formatNumber,
  formatShortDate,
  formatShortWeekday,
} from "@/lib/format";
import { addDays } from "@/lib/schedule/dates";
import { ACTIVE_FORMS, DAY_FORMS, PANEL_TEXTS, SEAT_FORMS } from "@/lib/stable-panel/texts";
import type { StatsBooking, StatsPeriod, StatsScheduleDay } from "@/lib/stats/stats";

/**
 * Panel ośrodka (`/osrodek`, spec #83): model widoku każdej części strony. Strona wczytuje
 * części osobno (awaria jednej nie zabiera reszty), każdą składa tu osobna funkcja, a markup
 * tylko renderuje wynik. Części: najbliższe 7 dni (`composeWeek`) i boczna kolumna „Ośrodek”
 * (`composeSideColumn`).
 */

/** Stado ośrodka (`/osrodek/konie`). */
export const HORSES_ROUTE = "/osrodek/konie";
/** Statystyki ośrodka (`/osrodek/statystyki`, okres w `?od=…&do=…`). */
export const STATS_ROUTE = "/osrodek/statystyki";

/** Liczba dni paska tygodnia, od dziś włącznie. */
export const WEEK_LENGTH = 7;

/** Dni paska tygodnia jako okres wierszy statystyk: dziś…dziś+6. */
export function weekPeriod(today: string): StatsPeriod {
  return { from: today, to: addDays(today, WEEK_LENGTH - 1) };
}

/** Adres strony dnia: Zapisów albo Grafiku (obie czytają `?dzien=`). */
export function dayHref(route: string, day: string): string {
  return `${route}?dzien=${day}`;
}

export interface WeekInput {
  today: string;
  /** Dni grafiku ośrodka (`getStatsRows` dla `weekPeriod(today)`); dni spoza tygodnia są pomijane. */
  days: StatsScheduleDay[];
  /** Zapisy tych dni, także odwołane — liczą się tylko aktywne. */
  bookings: StatsBooking[];
}

export interface WeekDay {
  day: string;
  /** „Dziś”, „Jutro” albo skrót dnia tygodnia, np. `pt.`. */
  label: string;
  /** Np. `21 lis`. */
  date: string;
  isToday: boolean;
  /** Dzień ma ułożony grafik. */
  scheduled: boolean;
  /** Godziny pracy, np. `10:00–16:00`; `null` bez grafiku. */
  hours: string | null;
  /** Suma limitów miejsc wszystkich slotów dnia. */
  seats: number;
  /** Aktywne zapisy dnia. */
  booked: number;
  /** Zapisy wobec miejsc, 0–100; dzień bez miejsc ma 0. */
  occupancyPercent: number;
  /** Aktywne zapisy bez przydziału konia. */
  withoutHorse: number;
  /** Zwięźle, np. `3/6`. */
  countText: string;
  /** Pełnym zdaniem dla czytnika ekranu, np. `3 zapisy na 6 miejsc`. */
  countDescription: string;
  /** Np. `2 bez konia`; `null`, gdy wszystkie zapisy mają konia. */
  withoutHorseText: string | null;
  /** Ułożony → Zapisy dnia; bez grafiku → Grafik dnia. */
  href: string;
}

export interface WeekView {
  days: WeekDay[];
  booked: number;
  seats: number;
  unscheduledDays: number;
  /** Np. `12 zapisów na 40 miejsc`; `null`, gdy tydzień nie ma żadnego miejsca. */
  summary: string | null;
  /** Np. `6 dni bez grafiku`; `null`, gdy każdy dzień ma grafik. */
  unscheduledText: string | null;
}

function bookedOnSeats(booked: number, seats: number): string {
  return `${formatCount(booked, BOOKING_FORMS)} na ${formatCount(seats, SEAT_FORMS)}`;
}

function dayLabel(day: string, today: string): string {
  if (day === today) {
    return PANEL_TEXTS.today;
  }
  if (day === addDays(today, 1)) {
    return PANEL_TEXTS.tomorrow;
  }
  return formatShortWeekday(day);
}

export function composeWeek(input: WeekInput): WeekView {
  const days = Array.from({ length: WEEK_LENGTH }, (_, offset): WeekDay => {
    const day = addDays(input.today, offset);
    const schedule = input.days.find((entry) => entry.day === day);
    const active = input.bookings.filter((entry) => entry.day === day && entry.status === "active");
    const seats = schedule?.slots.reduce((sum, slot) => sum + slot.seats, 0) ?? 0;
    const booked = active.length;
    const withoutHorse = active.filter((entry) => entry.horseId === null).length;

    return {
      day,
      label: dayLabel(day, input.today),
      date: formatShortDate(day),
      isToday: offset === 0,
      scheduled: schedule !== undefined,
      hours: schedule ? formatHourRange(schedule.openHour, schedule.closeHour) : null,
      seats,
      booked,
      occupancyPercent: seats === 0 ? 0 : Math.round((booked / seats) * 100),
      withoutHorse,
      countText: `${formatNumber(booked)}/${formatNumber(seats)}`,
      countDescription: bookedOnSeats(booked, seats),
      withoutHorseText: withoutHorse > 0 ? `${formatNumber(withoutHorse)} bez konia` : null,
      href: dayHref(schedule ? STABLE_DAY_BOOKINGS_ROUTE : OWNER_SCHEDULE_ROUTE, day),
    };
  });

  const booked = days.reduce((sum, day) => sum + day.booked, 0);
  const seats = days.reduce((sum, day) => sum + day.seats, 0);
  const unscheduledDays = days.filter((day) => !day.scheduled).length;

  return {
    days,
    booked,
    seats,
    unscheduledDays,
    summary: seats > 0 ? bookedOnSeats(booked, seats) : null,
    unscheduledText: unscheduledDays > 0 ? `${formatCount(unscheduledDays, DAY_FORMS)} bez grafiku` : null,
  };
}

export interface SideColumnInput {
  today: string;
  /** Model tygodnia; `null`, gdy tygodnia nie udało się wczytać. */
  week: WeekView | null;
  /** Stado ośrodka (`listStableHorses`); `null` — nie wczytano. */
  horses: { active: boolean }[] | null;
  /** Instruktorzy ośrodka (`listStableInstructors`); `null` — nie wczytano. */
  instructors: { id: number; active: boolean }[] | null;
  /** Instruktorzy z kontem (`listInstructorAccounts`); `null` — nie wczytano. */
  accounts: { instructor_id: number }[] | null;
}

export interface SideLink {
  name: string;
  href: string;
  /** Krótka informacja przy linku; `null`, gdy jej danych nie udało się wczytać. */
  fact: string | null;
  /** Informacja wymaga uwagi (jutro bez grafiku). */
  warn: boolean;
}

function tomorrowFact(week: WeekView | null): Pick<SideLink, "fact" | "warn"> {
  const tomorrow = week?.days[1];
  if (!tomorrow) {
    return { fact: null, warn: false };
  }
  return tomorrow.scheduled
    ? { fact: PANEL_TEXTS.side.tomorrowScheduled, warn: false }
    : { fact: PANEL_TEXTS.side.tomorrowUnscheduled, warn: true };
}

function instructorsFact(input: SideColumnInput): string | null {
  if (input.instructors === null || input.accounts === null) {
    return null;
  }
  const withAccount = new Set(input.accounts.map((entry) => entry.instructor_id));
  const active = input.instructors.filter((entry) => entry.active);
  const activeWithAccount = active.filter((entry) => withAccount.has(entry.id)).length;
  return `${formatNumber(activeWithAccount)} z ${formatNumber(active.length)} z kontem`;
}

/**
 * Boczna kolumna „Ośrodek”: pięć sekcji ośrodka, każda z krótką informacją. Link zostaje także
 * wtedy, gdy jego informacji nie udało się wczytać — nawigacja nie znika z awarią odczytu.
 */
export function composeSideColumn(input: SideColumnInput): SideLink[] {
  const texts = PANEL_TEXTS.side;
  const today = input.week?.days[0];
  const activeHorses = input.horses?.filter((horse) => horse.active).length ?? null;

  return [
    { name: texts.schedule, href: dayHref(OWNER_SCHEDULE_ROUTE, addDays(input.today, 1)), ...tomorrowFact(input.week) },
    {
      name: texts.bookings,
      href: dayHref(STABLE_DAY_BOOKINGS_ROUTE, input.today),
      fact: today ? `dziś: ${formatNumber(today.booked)}` : null,
      warn: false,
    },
    {
      name: texts.horses,
      href: HORSES_ROUTE,
      fact: activeHorses === null ? null : formatCount(activeHorses, ACTIVE_FORMS),
      warn: false,
    },
    { name: texts.instructors, href: INSTRUCTORS_ROUTE, fact: instructorsFact(input), warn: false },
    { name: texts.stats, href: STATS_ROUTE, fact: texts.anyPeriod, warn: false },
  ];
}
