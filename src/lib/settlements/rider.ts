/**
 * Rozliczenie jeźdźca (GLOSSARY „Rozliczenie”, #95): jeden jeździec, jeden miesiąc — liczba jazd ×
 * obowiązująca stawka, wiersze jazd (wspólne z Podsumowaniem miesiąca), koszty dodatkowe (#96) i
 * „Do zapłaty” = kwota za jazdy + suma kosztów.
 *
 * `composeRiderSettlement` zwraca jeden obiekt bez adresów strony, żeby PDF rozliczenia (KAN-91)
 * wyrenderował go także poza stroną; `composeRiderSettlementPage` dokłada przełącznik miesięcy i adres
 * „Pobierz PDF”.
 * Kwoty liczy `riderAmounts` — to samo, co wiersz listy „Rozliczenia”.
 */

import { formatCount, formatLongDayMonth, formatMoney, formatMonthYear, RIDE_FORMS } from "@/lib/format";
import { NO_HORSE, UNNAMED_RIDER } from "@/lib/bookings/rows";
import { addDays } from "@/lib/schedule/dates";
import type { SummaryMonth } from "@/lib/month-summary/month";
import {
  composeMonthNav,
  composeRideRows,
  emptyMonthText,
  monthRides,
  type MonthNav,
  type SummaryBooking,
  type SummaryRideRow,
} from "@/lib/month-summary/summary";
import { isSettlementPdfAvailable } from "@/lib/settlements/document";
import { extraCostRows, riderCosts, type ExtraCostRow } from "@/lib/settlements/costs";
import { riderAmounts, type RiderAmounts, type SettlementIngredients } from "@/lib/settlements/settlements";
import { SETTLEMENT_TEXTS } from "@/lib/settlements/texts";

/** Jeździec rozliczenia: konto i nazwa z profilu (`null` — „(bez nazwiska)”). */
export interface SettlementRider {
  key: string;
  name: string | null;
}

/** Koszty dodatkowe (`costs`) są całego ośrodka w miesiącu — liczą się tylko koszty tego jeźdźca. */
export interface RiderSettlementInput extends SettlementIngredients {
  month: SummaryMonth;
  rider: SettlementRider;
  /**
   * Zapisy ośrodka z dni miesiąca (`ownerSummaryBookings`), także odwołane i innych jeźdźców — liczą
   * się tylko jazdy tego jeźdźca.
   */
  bookings: SummaryBooking[];
  /** Adres dnia przy dacie jazdy; `null` — daty bez linków (np. PDF). */
  dayHref: ((day: string) => string) | null;
}

/** Rozliczenie jednego jeźdźca za jeden miesiąc — gotowe do wyrenderowania na stronie i w PDF. */
export interface RiderSettlement extends RiderAmounts {
  riderKey: string;
  /** Nazwa do pokazania: imię i nazwisko albo „(bez nazwiska)”. */
  name: string;
  /** Imię i nazwisko z profilu; `null` — profil bez nich (nazwa pliku PDF ma wtedy `jezdziec`). */
  fullName: string | null;
  /** Miesiąc `RRRR-MM`. */
  month: string;
  /** Np. `listopad 2026`. */
  monthLabel: string;
  rides: number;
  /** Np. `8 jazd`. */
  ridesText: string;
  /** Np. `Jazdy: 8 × 120,00 zł = 960,00 zł`; bez stawki ośrodka sama liczba jazd: `Jazdy: 8 jazd`. */
  ridesLine: string;
  /** Jazdy chronologicznie: data, godzina, instruktor, koń albo „bez konia”. */
  rideRows: SummaryRideRow[];
  /** Miesiąc bez jazd jeźdźca — tekst zamiast listy jazd, np. `W październiku 2026 nie było jazd.`; z jazdami `null`. */
  emptyText: string | null;
  /** Koszty dodatkowe jeźdźca w miesiącu (#96), od najwcześniej dopisanego; suma w `costsAmount`. */
  costs: ExtraCostRow[];
  /** Ośrodek nie ma stawki — zamiast kwot prośba „Ustaw stawkę ośrodka”. */
  needsRate: boolean;
}

/** Jazdy rozliczenia: jazdy tego jeźdźca w miesiącu (`monthRides`), chronologicznie. */
function settlementRides(input: RiderSettlementInput, now: Date): SummaryBooking[] {
  return monthRides(
    input.bookings.filter((booking) => booking.riderKey === input.rider.key),
    input.month,
    now,
  );
}

/** Rozliczenie jeźdźca za miesiąc. `now` jak w statystykach — w bieżącym miesiącu jazdy do teraz. */
export function composeRiderSettlement(input: RiderSettlementInput, now: Date = new Date()): RiderSettlement {
  return settlementOf(input, settlementRides(input, now));
}

/** Rozliczenie z gotowych jazd rozliczenia (`settlementRides`) — strona liczy z nich też kalendarz i zestawienie. */
function settlementOf(input: RiderSettlementInput, rides: SummaryBooking[]): RiderSettlement {
  const amounts = riderAmounts({
    riderKey: input.rider.key,
    month: input.month.month,
    rides: rides.length,
    rates: input.rates,
    costs: input.costs,
  });
  const texts = SETTLEMENT_TEXTS.rider;
  const ridesText = formatCount(rides.length, RIDE_FORMS);

  return {
    riderKey: input.rider.key,
    name: input.rider.name ?? UNNAMED_RIDER,
    fullName: input.rider.name,
    month: input.month.month,
    monthLabel: formatMonthYear(input.month.month),
    rides: rides.length,
    ridesText,
    ...amounts,
    ridesLine:
      amounts.rate === null || amounts.ridesAmountText === null
        ? `${texts.rides} ${ridesText}`
        : `${texts.rides} ${String(rides.length)} × ${formatMoney(amounts.rate.amount)} = ${amounts.ridesAmountText}`,
    rideRows: composeRideRows(rides, { viewer: "owner", dayHref: input.dayHref }),
    emptyText: rides.length === 0 ? emptyMonthText(input.month, "owner") : null,
    costs: extraCostRows(riderCosts(input.costs, input.rider.key)),
    needsRate: amounts.rate === null,
  };
}

export interface RiderSettlementPageInput extends RiderSettlementInput {
  /** Adres rozliczenia tego jeźdźca dla miesiąca `RRRR-MM`. */
  monthHref: (month: string) => string;
  /** Adres PDF tego rozliczenia — w widoku tylko, gdy PDF jest dostępny. */
  pdfHref: string;
}

/** Strona rozliczenia jeźdźca: rozliczenie, przełącznik miesięcy tego samego jeźdźca i „Pobierz PDF”. */
export interface RiderSettlementView {
  nav: MonthNav;
  settlement: RiderSettlement;
  /**
   * „Pobierz PDF” (spec #100): adres PDF, gdy PDF jest dostępny (`isSettlementPdfAvailable` — ta sama
   * decyzja co w punkcie końcowym); inaczej `null` i przycisku nie ma.
   */
  pdfHref: string | null;
  /**
   * Suma kosztów dodatkowych w karcie rozliczenia (#109), np. `Koszty dodatkowe: 850,50 zł`; bez kosztów
   * `null`. Zdanie, nie sama kwota — jedyną samą kwotą karty jest „Do zapłaty”.
   */
  costsLine: string | null;
  /** Nagłówek zwiniętej listy jazd, np. `Pokaż wszystkie jazdy (77)`; w miesiącu bez jazd `null` — listy nie ma. */
  ridesToggle: string | null;
  /** Kalendarz miesiąca z jazdami jeźdźca (#110); w miesiącu bez jazd `null`. */
  calendar: RiderCalendar | null;
  /** Zestawienie „Z kim i na czym” (#110); w miesiącu bez jazd `null`. */
  breakdown: RiderBreakdown | null;
}

/** Pozycja zestawienia: instruktor albo koń z liczbą jazd. */
export interface BreakdownItem {
  name: string;
  rides: number;
  /** Np. `3 jazdy` — dla czytnika ekranu przy samej liczbie. */
  ridesText: string;
}

/**
 * Zestawienie „Z kim i na czym” (#110): z kim (instruktorzy) i na czym (konie) jeździec jeździł w miesiącu.
 * Obie listy malejąco po liczbie jazd, przy remisie alfabetycznie po polsku; suma każdej = liczba jazd.
 */
export interface RiderBreakdown {
  instructors: BreakdownItem[];
  /** Jazda bez konia to pozycja „bez konia” — ten sam tekst co w liście jazd. */
  horses: BreakdownItem[];
}

/** Liczba jazd na klucz (`keyOf`), w kolejności pierwszej jazdy z danym kluczem, razem z tą jazdą. */
function tallyRides(
  rides: SummaryBooking[],
  keyOf: (ride: SummaryBooking) => string,
): Map<string, { first: SummaryBooking; rides: number }> {
  const tally = new Map<string, { first: SummaryBooking; rides: number }>();
  for (const ride of rides) {
    const key = keyOf(ride);
    const entry = tally.get(key);
    if (entry) {
      entry.rides += 1;
    } else {
      tally.set(key, { first: ride, rides: 1 });
    }
  }
  return tally;
}

/** Pozycje zestawienia na klucz (`keyOf`) z nazwą (`nameOf`); malejąco, przy remisie alfabetycznie po polsku. */
function countRides(
  rides: SummaryBooking[],
  keyOf: (ride: SummaryBooking) => string,
  nameOf: (ride: SummaryBooking) => string,
): BreakdownItem[] {
  return [...tallyRides(rides, keyOf).values()]
    .map((entry) => ({ name: nameOf(entry.first), rides: entry.rides }))
    .sort((a, b) => b.rides - a.rides || a.name.localeCompare(b.name, "pl"))
    .map((entry) => ({ ...entry, ridesText: formatCount(entry.rides, RIDE_FORMS) }));
}

function composeBreakdown(rides: SummaryBooking[]): RiderBreakdown {
  return {
    // Instruktor po identyfikatorze — dwóch instruktorów o tym samym nazwisku to dwie pozycje.
    instructors: countRides(
      rides,
      (ride) => String(ride.instructor.id),
      (ride) => ride.instructor.name,
    ),
    horses: countRides(
      rides,
      // Klucz konia odróżnia jazdę bez konia od konia, który nazywałby się tak samo.
      (ride) => (ride.horseName === null ? "" : `koń:${ride.horseName}`),
      (ride) => ride.horseName ?? NO_HORSE,
    ),
  };
}

/** Dzień kalendarza rozliczenia jeźdźca. */
export interface CalendarDay {
  /** `RRRR-MM-DD`. */
  date: string;
  /** Numer dnia miesiąca. */
  day: number;
  /** Jazdy jeźdźca w tym dniu — te same, co w „Jazdy: N”. */
  rides: number;
  /** Zapisy dnia — ten sam adres co data w liście jazd; tylko w dniu z jazdami, inaczej `null`. */
  href: string | null;
  /**
   * Wyróżnienie na tle dni z jazdami: najmniej jazd — 1, najwięcej — 3, pomiędzy w tercjach tej
   * rozpiętości; ta sama liczba jazd we wszystkich dniach — 3; 0 — dzień bez jazd. Liczba jest zawsze
   * widoczna, więc kolor nie jest jedyną informacją.
   */
  level: CalendarLevel;
  /** Opis dla czytnika ekranu, np. `3 listopada: 4 jazdy`. */
  label: string;
}

export type CalendarLevel = 0 | 1 | 2 | 3;

/** Kalendarz miesiąca (#110): pola od poniedziałku tygodnia z 1. dniem miesiąca. */
export interface RiderCalendar {
  /** Nagłówki kolumn od poniedziałku: `pon` … `nd`. */
  weekdays: readonly string[];
  /** Puste pola (`null`) przed 1. dniem miesiąca, potem każdy dzień miesiąca. */
  cells: (CalendarDay | null)[];
}

/** Ile pól przed 1. dniem miesiąca: poniedziałek — 0, niedziela — 6. Data kalendarzowa, więc w UTC. */
function leadingBlanks(firstDay: string): number {
  return (new Date(`${firstDay}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/**
 * Poziom wyróżnienia dnia z `rides` jazdami, gdy dni z jazdami mają od `fewest` do `most` jazd: tercja
 * tej rozpiętości, w której wypada dzień (najmniej — 1, najwięcej — 3); bez rozpiętości — 3.
 */
function calendarLevel(rides: number, fewest: number, most: number): CalendarLevel {
  if (rides === 0) return 0;
  if (most === fewest) return 3;
  const third = Math.floor((3 * (rides - fewest)) / (most - fewest));
  if (third === 0) return 1;
  return third === 1 ? 2 : 3;
}

/** Kalendarz z jazd rozliczenia — liczby w dniach sumują się do „Jazdy: N”, adres dnia jak w liście jazd. */
function composeCalendar(
  month: SummaryMonth,
  rides: SummaryBooking[],
  dayHref: RiderSettlementInput["dayHref"],
): RiderCalendar {
  const texts = SETTLEMENT_TEXTS.rider.calendar;
  const perDay = tallyRides(rides, (ride) => ride.day);
  const counts = [...perDay.values()].map((entry) => entry.rides);
  const fewest = Math.min(...counts);
  const most = Math.max(...counts);

  const cells: (CalendarDay | null)[] = Array.from({ length: leadingBlanks(month.from) }, () => null);
  for (let date = month.from, day = 1; date <= month.to; date = addDays(date, 1), day += 1) {
    const dayRides = perDay.get(date)?.rides ?? 0;
    cells.push({
      date,
      day,
      rides: dayRides,
      href: dayRides > 0 && dayHref ? dayHref(date) : null,
      level: calendarLevel(dayRides, fewest, most),
      label: texts.dayLabel(formatLongDayMonth(date), formatCount(dayRides, RIDE_FORMS)),
    });
  }
  return { weekdays: texts.weekdays, cells };
}

export function composeRiderSettlementPage(
  input: RiderSettlementPageInput,
  now: Date = new Date(),
): RiderSettlementView {
  // Jedne jazdy karty, kalendarza i zestawienia — wybrane raz.
  const rides = settlementRides(input, now);
  const settlement = settlementOf(input, rides);
  const hasRides = rides.length > 0;
  return {
    nav: composeMonthNav(input.month, input.monthHref),
    settlement,
    pdfHref: isSettlementPdfAvailable(settlement, now) ? input.pdfHref : null,
    costsLine: settlement.costs.length === 0 ? null : `${SETTLEMENT_TEXTS.rider.costs} ${settlement.costsAmountText}`,
    ridesToggle: settlement.rides === 0 ? null : SETTLEMENT_TEXTS.rider.showAllRides(settlement.rides),
    calendar: hasRides ? composeCalendar(input.month, rides, input.dayHref) : null,
    breakdown: hasRides ? composeBreakdown(rides) : null,
  };
}

const RIDER_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Jeździec z adresu strony (konto, UUID) albo `null` — wtedy strona od razu pokazuje „nie ma takiego
 * jeźdźca”, bez zapytania, które na błędnym UUID skończyłoby się błędem bazy zamiast spokojnym stanem.
 */
export function parseRiderKey(raw: string | null | undefined): string | null {
  const key = raw?.toLowerCase() ?? "";
  return RIDER_KEY.test(key) ? key : null;
}
