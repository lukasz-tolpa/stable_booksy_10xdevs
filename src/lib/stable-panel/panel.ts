import { OWNER_MONTH_SUMMARY_ROUTE, OWNER_SCHEDULE_ROUTE, OWNER_SETTLEMENTS_ROUTE } from "@/lib/auth/roles";
import { STABLE_DAY_BOOKINGS_ROUTE } from "@/lib/bookings/stable-redirect";
import { isActiveBooking } from "@/lib/bookings/status";
import { INSTRUCTORS_ROUTE } from "@/lib/instructors/redirect";
import { OWNER_PLACE_OCCUPANCY_ROUTE } from "@/lib/place-occupancy/routes";
import { PLACES_ROUTE } from "@/lib/places/redirect";
import {
  BOOKING_FORMS,
  formatCount,
  formatHourRange,
  formatHours,
  formatMoney,
  formatMonthName,
  formatNumber,
  formatPercent,
  formatShortDate,
  formatShortWeekday,
  RIDE_FORMS,
} from "@/lib/format";
import { resolveSummaryMonth } from "@/lib/month-summary/month";
import { monthRides } from "@/lib/month-summary/summary";
import { STABLE_BOARDERS_ROUTE } from "@/lib/boarding/redirect";
import { addDays } from "@/lib/schedule/dates";
import type { SettlementList } from "@/lib/settlements/settlements";
import { isStableHorse, type HorseKind } from "@/lib/stables/kind";
import { ACTIVE_FORMS, BOARDING_HORSE_FORMS, DAY_FORMS, PANEL_TEXTS, SEAT_FORMS } from "@/lib/stable-panel/texts";
import { rideHoursBars, type BarChartItem } from "@/lib/stats/chart-items";
import { statsPeriodSearch } from "@/lib/stats/period";
import type { StatsRider } from "@/lib/stats/riders";
import {
  computeStableStats,
  type StatsBooking,
  type StatsHorse,
  type StatsPeriod,
  type StatsScheduleDay,
} from "@/lib/stats/stats";
import type { RideHoursSeries } from "@/lib/stats/time-series";
import { GRANULARITY_NAMES } from "@/lib/stats/time-series-labels";

/**
 * Panel ośrodka (`/osrodek`, spec #83): model widoku każdej części strony. Strona wczytuje
 * części osobno (awaria jednej nie zabiera reszty), każdą składa tu osobna funkcja, a markup
 * tylko renderuje wynik. Części: najbliższe 7 dni (`composeWeek`), ostatnie 30 dni
 * (`composeLastMonth`) i boczna kolumna „Ośrodek” (`composeSideColumn`). Linki bocznej kolumny, których
 * nie ma w dolnym pasku (Podsumowanie miesiąca, Rozliczenia), są poniżej 1000 px w kolumnie głównej.
 */

/** Stado ośrodka (`/osrodek/konie`). */
export const HORSES_ROUTE = "/osrodek/konie";
/** Statystyki ośrodka (`/osrodek/statystyki`, okres w `?od=…&do=…`). */
export const STATS_ROUTE = "/osrodek/statystyki";

/** Liczba dni paska tygodnia, od dziś włącznie. */
export const WEEK_LENGTH = 7;

/** Liczba dni części „Ostatnie 30 dni”, do dziś włącznie. */
export const LAST_MONTH_LENGTH = 30;

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
  /**
   * Aktywne zapisy wobec miejsc w procentach (nie „Obłożenie grafiku” — to liczy miejsca, na
   * których odbyła się jazda); dzień bez miejsc ma 0. Może przekroczyć 100, gdy limit obniżono
   * po zapisach.
   */
  bookedPercent: number;
  /** Np. `zajęte w 50%`. */
  bookedPercentText: string;
  /** Wypełnienie paska, `bookedPercent` przycięte do 0–100. */
  barPercent: number;
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
  /** Np. `12 zapisów na 40 miejsc`; także tydzień bez grafiku: `0 zapisów na 0 miejsc`. */
  summary: string;
  /** Np. `6 dni bez grafiku`; `null`, gdy każdy dzień ma grafik. */
  unscheduledText: string | null;
}

function bookedOnSeats(booked: number, seats: number): string {
  return `${formatCount(booked, BOOKING_FORMS)} ${PANEL_TEXTS.week.on} ${formatCount(seats, SEAT_FORMS)}`;
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
    const active = input.bookings.filter((entry) => entry.day === day && isActiveBooking(entry));
    const seats = schedule?.slots.reduce((sum, slot) => sum + slot.seats, 0) ?? 0;
    const booked = active.length;
    const withoutHorse = active.filter((entry) => entry.horseId === null).length;
    const bookedPercent = seats === 0 ? 0 : Math.round((booked / seats) * 100);

    return {
      day,
      label: dayLabel(day, input.today),
      date: formatShortDate(day),
      isToday: offset === 0,
      scheduled: schedule !== undefined,
      hours: schedule ? formatHourRange(schedule.openHour, schedule.closeHour) : null,
      seats,
      booked,
      bookedPercent,
      bookedPercentText: `${PANEL_TEXTS.week.bookedPercent} ${formatPercent(bookedPercent)}`,
      barPercent: Math.min(100, bookedPercent),
      withoutHorse,
      countText: `${formatNumber(booked)}/${formatNumber(seats)}`,
      countDescription: bookedOnSeats(booked, seats),
      withoutHorseText: withoutHorse > 0 ? `${formatNumber(withoutHorse)} ${PANEL_TEXTS.week.withoutHorse}` : null,
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
    summary: bookedOnSeats(booked, seats),
    unscheduledText:
      unscheduledDays > 0 ? `${formatCount(unscheduledDays, DAY_FORMS)} ${PANEL_TEXTS.week.withoutSchedule}` : null,
  };
}

export interface SideColumnInput {
  today: string;
  /** Model tygodnia; `null`, gdy tygodnia nie udało się wczytać. */
  week: WeekView | null;
  /** Wszystkie konie ośrodka, także pensjonatowe (`listStableHorses`); `null` — nie wczytano. */
  horses: { active: boolean; kind: HorseKind }[] | null;
  /** Place ośrodka (`listStablePlaces`, #113); `null` — nie wczytano. */
  places: { active: boolean }[] | null;
  /** Instruktorzy ośrodka (`listStableInstructors`); `null` — nie wczytano. */
  instructors: { id: number; active: boolean }[] | null;
  /** Instruktorzy z kontem (`listInstructorAccounts`); `null` — nie wczytano. */
  accounts: { instructor_id: number }[] | null;
  /**
   * Zapisy ośrodka obejmujące bieżący miesiąc do dziś (`getStatsRows` dla `historyPeriod(today)`);
   * zapisy spoza miesiąca są pomijane. `null` — nie wczytano.
   */
  monthBookings: StatsBooking[] | null;
  /**
   * Lista rozliczeń bieżącego miesiąca (`composeSettlementList` — ta sama co na stronie „Rozliczenia”);
   * panel czyta z niej tylko sumę. `null` — nie wczytano.
   */
  settlementsTotal: Pick<SettlementList, "total" | "needsRate"> | null;
}

export interface SideLink {
  name: string;
  href: string;
  /** Krótka informacja przy linku; `null`, gdy jej danych nie udało się wczytać. */
  fact: string | null;
  /** Informacja wymaga uwagi (jutro bez grafiku, ośrodek bez stawki). */
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
  const texts = PANEL_TEXTS.side;
  return `${formatNumber(activeWithAccount)} ${texts.of} ${formatNumber(active.length)} ${texts.withAccount}`;
}

/**
 * Link „Podsumowanie miesiąca” z jazdami bieżącego miesiąca do teraz, np. `listopad: 12 jazd` — ta sama
 * reguła co w Podsumowaniu miesiąca. Ten sam link jest w bocznej kolumnie i — poniżej 1000 px, gdzie
 * kolumny nie ma, a dolny pasek go nie mieści — w kolumnie głównej panelu.
 */
export function composeMonthSummaryLink(
  input: Pick<SideColumnInput, "today" | "monthBookings">,
  now: Date = new Date(),
): SideLink {
  let fact: string | null = null;
  if (input.monthBookings !== null) {
    const month = resolveSummaryMonth(null, input.today);
    const rides = monthRides(input.monthBookings, month, now).length;
    fact = `${formatMonthName(month.month)}: ${formatCount(rides, RIDE_FORMS)}`;
  }
  return { name: PANEL_TEXTS.side.monthSummary, href: OWNER_MONTH_SUMMARY_ROUTE, fact, warn: false };
}

/**
 * Link „Rozliczenia” z sumą bieżącego miesiąca, np. `listopad: 12 340,00 zł`, albo prośbą „Ustaw stawkę”.
 * Sumy nie liczy — bierze `total` z listy rozliczeń, więc obejmuje wszystko, co lista wlicza do „do
 * zapłaty” (także koszty dodatkowe). Jak Podsumowanie miesiąca: w bocznej kolumnie i poniżej 1000 px
 * w kolumnie głównej.
 */
export function composeSettlementsLink(input: Pick<SideColumnInput, "today" | "settlementsTotal">): SideLink {
  const texts = PANEL_TEXTS.side;
  const link = { name: texts.settlements, href: OWNER_SETTLEMENTS_ROUTE };
  const { settlementsTotal } = input;
  if (settlementsTotal === null) {
    return { ...link, fact: null, warn: false };
  }
  // Brak sumy — ta sama „—” co w „Do zapłaty razem” (spec #112: nigdy suma częściowa): sekcja czeka na stawkę
  // swojego rodzaju albo, przy stawkach, koń pensjonatowy — na opłatę za pensjonat.
  if (settlementsTotal.total === null) {
    return { ...link, fact: settlementsTotal.needsRate ? texts.setRate : texts.setBoardingFee, warn: true };
  }
  const month = resolveSummaryMonth(null, input.today).month;
  return { ...link, fact: `${formatMonthName(month)}: ${formatMoney(settlementsTotal.total)}`, warn: false };
}

/**
 * Link „Pensjonariusze” (#114) z liczbą koni pensjonatowych ośrodka, np. `2 konie pensjonatowe`. Dolny pasek
 * go nie mieści, więc jak Podsumowanie miesiąca jest w bocznej kolumnie i poniżej 1000 px w kolumnie głównej.
 */
export function composeBoardersLink(input: Pick<SideColumnInput, "horses">): SideLink {
  const boarding = input.horses?.filter((horse) => !isStableHorse(horse)).length ?? null;
  return {
    name: PANEL_TEXTS.side.boarders,
    href: STABLE_BOARDERS_ROUTE,
    fact: boarding === null ? null : formatCount(boarding, BOARDING_HORSE_FORMS),
    warn: false,
  };
}

/**
 * Wejście na stronę „Place” (#113) z liczbą aktywnych placów — w bocznej kolumnie i poniżej 1000 px
 * w kolumnie głównej (dolny pasek nie ma placów).
 */
export function composePlacesLink(input: Pick<SideColumnInput, "places">): SideLink {
  const activePlaces = input.places?.filter((place) => place.active).length ?? null;

  return {
    name: PANEL_TEXTS.side.places,
    href: PLACES_ROUTE,
    fact: activePlaces === null ? null : formatCount(activePlaces, ACTIVE_FORMS),
    warn: false,
  };
}

/**
 * Wejście na „Zajętość placów” (#116) — to, co o placach widzą pensjonariusze, dla dowolnego dnia. Jak Place:
 * w bocznej kolumnie i poniżej 1000 px w kolumnie głównej.
 */
export function composePlaceOccupancyLink(): SideLink {
  return {
    name: PANEL_TEXTS.side.placeOccupancy,
    href: OWNER_PLACE_OCCUPANCY_ROUTE,
    fact: PANEL_TEXTS.side.anyDay,
    warn: false,
  };
}

/**
 * Boczna kolumna „Ośrodek”: sekcje ośrodka, każda z krótką informacją. Link zostaje także
 * wtedy, gdy jego informacji nie udało się wczytać — nawigacja nie znika z awarią odczytu.
 * `now` wstrzykiwane jak w statystykach — jazdy miesiąca liczą się do teraz.
 */
export function composeSideColumn(input: SideColumnInput, now: Date = new Date()): SideLink[] {
  const texts = PANEL_TEXTS.side;
  const today = input.week?.days[0];
  const activeHorses = input.horses?.filter((horse) => isStableHorse(horse) && horse.active).length ?? null;

  return [
    { name: texts.schedule, href: dayHref(OWNER_SCHEDULE_ROUTE, addDays(input.today, 1)), ...tomorrowFact(input.week) },
    {
      name: texts.bookings,
      href: dayHref(STABLE_DAY_BOOKINGS_ROUTE, input.today),
      fact: today ? `${texts.todayPrefix} ${formatNumber(today.booked)}` : null,
      warn: false,
    },
    {
      name: texts.horses,
      href: HORSES_ROUTE,
      fact: activeHorses === null ? null : formatCount(activeHorses, ACTIVE_FORMS),
      warn: false,
    },
    composeBoardersLink(input),
    composePlacesLink(input),
    composePlaceOccupancyLink(),
    { name: texts.instructors, href: INSTRUCTORS_ROUTE, fact: instructorsFact(input), warn: false },
    composeMonthSummaryLink(input, now),
    composeSettlementsLink(input),
    { name: texts.stats, href: STATS_ROUTE, fact: texts.anyPeriod, warn: false },
  ];
}

// --- Ostatnie 30 dni ---

/** Ostatnie 30 dni jako okres statystyk: dziś-29…dziś. */
export function lastMonthPeriod(today: string): StatsPeriod {
  return { from: addDays(today, -(LAST_MONTH_LENGTH - 1)), to: today };
}

/**
 * Okres jednego odczytu minionych wierszy panelu: ostatnie 30 dni i bieżący miesiąc razem (31. dnia
 * miesiąc sięga dalej wstecz niż 30 dni). Każda część pomija wiersze spoza swojego okresu.
 */
export function historyPeriod(today: string): StatsPeriod {
  const lastMonth = lastMonthPeriod(today);
  const monthStart = resolveSummaryMonth(null, today).from;
  return { from: monthStart < lastMonth.from ? monthStart : lastMonth.from, to: today };
}

export interface LastMonthInput {
  today: string;
  /** Wiersze statystyk (`getStatsRows` dla `lastMonthPeriod(today)`); wiersze spoza okresu są pomijane. */
  days: StatsScheduleDay[];
  bookings: StatsBooking[];
  riders: StatsRider[];
  /** Wszystkie konie stadniny, także zdezaktywowane (`listStableHorses`) — źródło nazw. */
  horses: StatsHorse[];
}

export interface MonthTile {
  label: string;
  /** Liczba albo nazwa konia, gotowa do wyświetlenia; `—`, gdy nie ma czego pokazać. */
  value: string;
  /** Dopisek pod wartością, np. `12 jazd`. */
  note: string;
  /** Wartość jest nazwą (koń), nie liczbą — inny krój. */
  isName: boolean;
}

export interface MonthChart {
  /** Nagłówek wykresu i jego nazwa dla czytników ekranu, np. `Godziny jazd dzień po dniu`. */
  title: string;
  /** Nagłówek kolumny przedziałów w tabeli z danymi, np. `Dzień`. */
  labelHeader: string;
  bars: BarChartItem[];
}

export interface LastMonthView {
  /**
   * Okres bez jazd i wystawionych miejsc (`StatsView.isEmpty` — ten sam pusty okres co na
   * Statystykach) — zamiast kafelków i wykresu spokojny komunikat.
   */
  isEmpty: boolean;
  tiles: MonthTile[];
  /** Godziny jazd w czasie (seria statystyk z ich etykietami przedziałów). */
  chart: MonthChart;
  /** „Pełne statystyki”: Statystyki z tym samym okresem. */
  statsHref: string;
}

function monthChart(series: RideHoursSeries): MonthChart {
  const names = GRANULARITY_NAMES[series.granularity];
  return {
    title: `${PANEL_TEXTS.lastMonth.rideHours} ${names.phrase}`,
    labelHeader: names.bucket,
    bars: rideHoursBars(series),
  };
}

/**
 * Część „Ostatnie 30 dni”: kafelki z wyliczenia statystyk ośrodka (`computeStableStats`) dla
 * okresu dziś-29…dziś. `now` wstrzykiwane jak w statystykach — liczy się tylko to, co minęło.
 */
export function composeLastMonth(input: LastMonthInput, now: Date = new Date()): LastMonthView {
  const texts = PANEL_TEXTS.lastMonth;
  const period = lastMonthPeriod(input.today);
  const stats = computeStableStats(
    { period, days: input.days, bookings: input.bookings, riders: input.riders, horses: input.horses },
    now,
  );
  const { summary } = stats;
  // Tabela koni idzie od najbardziej obciążonego; koń bez godzin jazd nie jest „obciążony”.
  const topHorse = stats.horses.find((row) => row.rideHours > 0);

  return {
    isEmpty: stats.isEmpty,
    tiles: [
      {
        label: texts.rideHours,
        value: formatHours(summary.rideHours),
        note: formatCount(summary.rides, RIDE_FORMS),
        isName: false,
      },
      {
        label: texts.occupancy,
        value: summary.occupancyPercent === null ? texts.none : formatPercent(summary.occupancyPercent),
        note: texts.occupancyNote,
        isName: false,
      },
      {
        label: texts.cancellations,
        value: formatNumber(summary.cancellations),
        note: texts.cancellationsNote,
        isName: false,
      },
      {
        label: texts.topHorse,
        value: topHorse?.name ?? texts.none,
        note: topHorse ? formatHours(topHorse.rideHours) : texts.noHorseRides,
        isName: true,
      },
    ],
    chart: monthChart(stats.rideHoursOverTime),
    statsHref: `${STATS_ROUTE}${statsPeriodSearch(period)}`,
  };
}
