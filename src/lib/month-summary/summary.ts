/**
 * Podsumowanie miesiąca (GLOSSARY.md, spec #87) — jedyne miejsce, które je liczy. Każda rola
 * (właściciel, instruktor z kontem, jeździec) mapuje swoje wiersze na wspólny kształt zapisu
 * `SummaryBooking`, a ten moduł odsiewa jazdy (wspólna reguła `isRide` ze Statystykami),
 * grupuje je po jeźdźcu i składa model widoku. Strony tylko wczytują dane i renderują wynik.
 *
 * Klocki dla ról:
 * - `composeMonthSummary` — cały widok listy jeźdźców w sekcjach „Rekreacja” i „Pensjonariusze” (właściciel,
 *   instruktor);
 * - `monthRides` — same jazdy miesiąca (np. lista instruktorów do filtra, liczba na panelu);
 * - `composeSummaryList` — lista jeźdźców z sumą z gotowych jazd;
 * - `composeRideRows` — same wiersze jazd z gotowych jazd (jeździec: osobno w każdym ośrodku);
 * - `composeMonthNav`, `emptyMonthText` — przełącznik miesięcy i tekst stanu pustego.
 */

import { RIDER_KIND, RIDER_KINDS, type RiderKind } from "@/lib/boarding/month";
import { RIDER_KIND_HEADINGS } from "@/lib/boarding/texts";
import { isRide, slotEndedAt, type RideCandidate } from "@/lib/bookings/rides";
import { NO_HORSE, UNNAMED_RIDER } from "@/lib/bookings/rows";
import {
  capitalize,
  formatClockHour,
  formatCount,
  formatInMonthYear,
  formatMonthYear,
  formatShortDateWithWeekday,
  RIDE_FORMS,
  RIDER_FORMS,
} from "@/lib/format";
import type { SummaryMonth } from "@/lib/month-summary/month";
import { MONTH_SUMMARY_TEXTS } from "@/lib/month-summary/texts";
import { ANONYMISED_RIDERS } from "@/lib/stats/riders";
import type { BookingStatus } from "@/types";

/** Kto ogląda podsumowanie — decyduje o kolumnie instruktora i tekście stanu pustego. */
export type SummaryViewer = "owner" | "instructor" | "rider";

export interface SummaryInstructor {
  id: number;
  name: string;
}

/**
 * Zapis we wspólnym kształcie wszystkich ról — jazdą staje się dopiero po odsiewie (`monthRides`),
 * więc wolno podać także odwołane i nadchodzące zapisy oraz zapisy spoza miesiąca.
 */
export interface SummaryBooking {
  /** Dzień grafiku `RRRR-MM-DD`. */
  day: string;
  hour: number;
  status: BookingStatus;
  /**
   * Klucz jeźdźca — jeźdźcy są rozróżniani po nim, nie po nazwie: konto (właściciel, jeździec)
   * albo klucz z funkcji instruktora. `null` — jeździec zanonimizowany (ADR-0001).
   */
  riderKey: string | null;
  /** Nazwa z profilu; `null` — bez nazwy („(bez nazwiska)”). Przy `riderKey: null` pomijana. */
  riderName: string | null;
  /** Instruktor slotu (nazwa już rozwiązana przez wołającego). */
  instructor: SummaryInstructor;
  /** Przydzielony koń; `null` — jazda bez konia. */
  horseName: string | null;
}

/** Pola jazdy, z których powstaje jej wiersz na liście — bez jeźdźca. */
export type SummaryRideSource = Pick<SummaryBooking, "day" | "hour" | "instructor" | "horseName">;

/** Jedna jazda na rozwiniętej liście jeźdźca. */
export interface SummaryRideRow {
  day: string;
  /** Np. `pt., 6 lis`. */
  date: string;
  /** Adres dnia przy dacie (u właściciela — Zapisy dnia); `null` — data bez linku. */
  dayHref: string | null;
  /** Np. `10:00`. */
  hour: string;
  /** `null` w widoku instruktora — to zawsze on. */
  instructorName: string | null;
  /** Nazwa konia albo `bez konia`. */
  horseName: string;
  withoutHorse: boolean;
}

export interface SummaryRiderRow {
  /** Klucz jeźdźca; `null` — wiersz zbiorczy „Usunięci jeźdźcy”. */
  riderKey: string | null;
  name: string;
  rides: number;
  /** Np. `3 jazdy`. */
  ridesText: string;
  /** Jazdy chronologicznie; zawsze tyle, ile `rides` — poza wierszem zbiorczym, który dat nie ma (ADR-0001). */
  list: SummaryRideRow[];
}

/** Lista jeźdźców z sumą. */
export interface SummaryList {
  /** Jazdy razem, także jeźdźców zanonimizowanych. */
  rides: number;
  /** Jeźdźcy z kontem; wiersz zbiorczy nie jest jeźdźcem. */
  riders: number;
  /** Np. `12 jazd · 3 jeźdźców`. */
  totalText: string;
  /** Alfabetycznie, wiersz zbiorczy na końcu. */
  rows: SummaryRiderRow[];
}

/** Przełącznik miesięcy ‹ › (geometria `DayNav`). */
export interface MonthNav {
  /** Np. `listopad 2026`. */
  label: string;
  previousHref: string;
  /** `null` w bieżącym miesiącu — strzałka nieaktywna. */
  nextHref: string | null;
}

/** Sekcja jeźdźców podsumowania (#118): „Rekreacja” albo „Pensjonariusze”. */
export interface SummarySection {
  kind: RiderKind;
  /** `Rekreacja` albo `Pensjonariusze`. */
  heading: string;
  /** Nazwa listy jeźdźców sekcji dla czytników ekranu, np. `Jeźdźcy — Rekreacja`. */
  label: string;
  /** Np. `2 jeźdźców · 8 jazd`. */
  countsText: string;
  /** Jeźdźcy z kontem alfabetycznie, jak w `SummaryList.rows`. */
  rows: SummaryRiderRow[];
}

export interface MonthSummaryView {
  nav: MonthNav;
  /** Cały miesiąc — suma `totalText` obejmuje obie sekcje i jeźdźców zanonimizowanych. */
  list: SummaryList;
  /** Sekcje z jeźdźcami: „Rekreacja”, potem „Pensjonariusze” (#118); puste pominięte. */
  sections: SummarySection[];
  /** Wiersz zbiorczy „Usunięci jeźdźcy” — poza sekcjami, ich rodzaju nie znamy (ADR-0001); `null` — brak. */
  pooled: SummaryRiderRow | null;
  /** Miesiąc bez jazd — strona pokazuje `EmptyState` z `emptyText`. */
  isEmpty: boolean;
  /** Np. `W październiku 2026 nie było jazd.` */
  emptyText: string;
}

export interface SummaryListOptions {
  viewer: SummaryViewer;
  /** Adres dnia przy dacie jazdy; `null` — daty bez linków. */
  dayHref: ((day: string) => string) | null;
}

export interface MonthSummaryInput extends SummaryListOptions {
  month: SummaryMonth;
  bookings: SummaryBooking[];
  /** Adres strony dla miesiąca `RRRR-MM` — wołający dokłada w nim swoje parametry. */
  monthHref: (month: string) => string;
  /**
   * Czy jeździec (klucz) jest pensjonariuszem w oglądanym miesiącu (#118) — rozstrzyga wołający według
   * reguły „pensjonariusz w miesiącu”. Bez niej wszyscy są w „Rekreacji”.
   */
  isBoarder?: (riderKey: string) => boolean;
}

/**
 * Jazdy miesiąca: zapisy z dni miesiąca, które są jazdą (aktywne, slot się skończył — w bieżącym
 * miesiącu więc jazdy do teraz), chronologicznie. Kolejność i inne pola zapisu bez zmian.
 */
export function monthRides<T extends RideCandidate>(bookings: T[], month: SummaryMonth, now: Date = new Date()): T[] {
  const ended = slotEndedAt(now);
  return bookings
    .filter((booking) => booking.day >= month.from && booking.day <= month.to && isRide(booking, ended))
    .sort((a, b) => a.day.localeCompare(b.day) || a.hour - b.hour);
}

function rideRow(ride: SummaryRideSource, options: SummaryListOptions): SummaryRideRow {
  return {
    day: ride.day,
    date: formatShortDateWithWeekday(ride.day),
    dayHref: options.dayHref ? options.dayHref(ride.day) : null,
    hour: formatClockHour(ride.hour),
    instructorName: options.viewer === "instructor" ? null : ride.instructor.name,
    horseName: ride.horseName ?? NO_HORSE,
    withoutHorse: ride.horseName === null,
  };
}

/** Wiersze jazd z gotowych jazd (`monthRides`), w kolejności podanej. */
export function composeRideRows(rides: SummaryRideSource[], options: SummaryListOptions): SummaryRideRow[] {
  return rides.map((ride) => rideRow(ride, options));
}

/**
 * Lista jeźdźców z gotowych jazd (`monthRides`): wiersz na klucz jeźdźca, alfabetycznie, jazdy
 * jeźdźca w kolejności podanej; jazdy jeźdźców zanonimizowanych w jednym wierszu na końcu, bez dat.
 */
export function composeSummaryList(rides: SummaryBooking[], options: SummaryListOptions): SummaryList {
  const byRider = new Map<string, SummaryBooking[]>();
  let anonymised = 0;

  for (const ride of rides) {
    if (ride.riderKey === null) {
      anonymised += 1;
      continue;
    }
    const list = byRider.get(ride.riderKey);
    if (list) {
      list.push(ride);
    } else {
      byRider.set(ride.riderKey, [ride]);
    }
  }

  const rows = [...byRider]
    .map(
      ([riderKey, riderRides]): SummaryRiderRow => ({
        riderKey,
        // Nazwa z pierwszej jazdy — wszystkie jazdy jednego konta niosą tę samą.
        name: riderRides[0]?.riderName ?? UNNAMED_RIDER,
        rides: riderRides.length,
        ridesText: formatCount(riderRides.length, RIDE_FORMS),
        list: composeRideRows(riderRides, options),
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pl") || (a.riderKey ?? "").localeCompare(b.riderKey ?? ""));

  const riders = rows.length;
  if (anonymised > 0) {
    rows.push({
      riderKey: null,
      name: ANONYMISED_RIDERS,
      rides: anonymised,
      ridesText: formatCount(anonymised, RIDE_FORMS),
      list: [],
    });
  }

  return {
    rides: rides.length,
    riders,
    totalText: `${formatCount(rides.length, RIDE_FORMS)} · ${formatCount(riders, RIDER_FORMS)}`,
    rows,
  };
}

/** Przełącznik miesięcy: etykieta, poprzedni miesiąc zawsze, następny — do bieżącego. */
export function composeMonthNav(month: SummaryMonth, monthHref: (month: string) => string): MonthNav {
  return {
    label: formatMonthYear(month.month),
    previousHref: monthHref(month.previous),
    nextHref: month.next === null ? null : monthHref(month.next),
  };
}

/** Tekst stanu pustego roli, np. `W październiku 2026 nie było jazd.`, `We wrześniu 2026 nie jeździłeś.` */
export function emptyMonthText(month: SummaryMonth, viewer: SummaryViewer): string {
  return `${capitalize(formatInMonthYear(month.month))} ${MONTH_SUMMARY_TEXTS.empty[viewer]}`;
}

/** Sekcje z wierszy jeźdźców z kontem (`isBoarder` rozstrzyga rodzaj); puste pominięte. */
function summarySections(rows: readonly SummaryRiderRow[], isBoarder: (riderKey: string) => boolean): SummarySection[] {
  const texts = MONTH_SUMMARY_TEXTS;
  const kindOf = (riderKey: string): RiderKind => (isBoarder(riderKey) ? RIDER_KIND.boarder : RIDER_KIND.recreation);
  return RIDER_KINDS.map((kind): SummarySection => {
    const own = rows.filter((row) => row.riderKey !== null && kindOf(row.riderKey) === kind);
    const rides = own.reduce((sum, row) => sum + row.rides, 0);
    return {
      kind,
      heading: RIDER_KIND_HEADINGS[kind],
      label: `${texts.ridersHeading} — ${RIDER_KIND_HEADINGS[kind]}`,
      countsText: `${formatCount(own.length, RIDER_FORMS)} · ${formatCount(rides, RIDE_FORMS)}`,
      rows: own,
    };
  }).filter((section) => section.rows.length > 0);
}

/**
 * Widok podsumowania listy jeźdźców (właściciel, instruktor): cały miesiąc, sekcje „Rekreacja”
 * i „Pensjonariusze” (#118) i wiersz zbiorczy zanonimizowanych. `now` jak w statystykach.
 */
export function composeMonthSummary(input: MonthSummaryInput, now: Date = new Date()): MonthSummaryView {
  const rides = monthRides(input.bookings, input.month, now);
  const list = composeSummaryList(rides, input);
  return {
    nav: composeMonthNav(input.month, input.monthHref),
    list,
    sections: summarySections(list.rows, input.isBoarder ?? (() => false)),
    pooled: list.rows.find((row) => row.riderKey === null) ?? null,
    isEmpty: rides.length === 0,
    emptyText: emptyMonthText(input.month, input.viewer),
  };
}
