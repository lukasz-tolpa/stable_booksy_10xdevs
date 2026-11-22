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
  const rides = settlementRides(input, now);
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

/** Liczba jazd na klucz (`key`), z nazwą do pokazania; malejąco, przy remisie alfabetycznie po polsku. */
function countRides(
  rides: SummaryBooking[],
  pick: (ride: SummaryBooking) => { key: string; name: string },
): BreakdownItem[] {
  const counts = new Map<string, { name: string; rides: number }>();
  for (const ride of rides) {
    const { key, name } = pick(ride);
    const entry = counts.get(key);
    if (entry) {
      entry.rides += 1;
    } else {
      counts.set(key, { name, rides: 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.rides - a.rides || a.name.localeCompare(b.name, "pl"))
    .map((entry) => ({ ...entry, ridesText: formatCount(entry.rides, RIDE_FORMS) }));
}

function composeBreakdown(rides: SummaryBooking[]): RiderBreakdown {
  return {
    // Instruktor po identyfikatorze — dwóch instruktorów o tym samym nazwisku to dwie pozycje.
    instructors: countRides(rides, (ride) => ({ key: String(ride.instructor.id), name: ride.instructor.name })),
    horses: countRides(rides, (ride) => {
      const name = ride.horseName ?? NO_HORSE;
      // Klucz konia odróżnia jazdę bez konia od konia, który nazywałby się tak samo.
      return { key: ride.horseName === null ? "" : `koń:${name}`, name };
    }),
  };
}

/** Dzień kalendarza rozliczenia jeźdźca. */
export interface CalendarDay {
  /** `RRRR-MM-DD`. */
  date: string;
  /** Numer dnia miesiąca. */
  day: number;
  /** Jazdy jeźdźca w tym dniu — te same, co w „Jazdy: N” (`rideRows`). */
  rides: number;
  /** Zapisy dnia — ten sam adres co data w liście jazd; tylko w dniu z jazdami, inaczej `null`. */
  href: string | null;
  /**
   * Wyróżnienie względem najintensywniejszego dnia miesiąca: 1–3 w tercjach jego liczby jazd (pełna
   * tercja — 3), 0 — dzień bez jazd. Liczba jest zawsze widoczna, więc kolor nie jest jedyną informacją.
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

/** Poziom wyróżnienia dnia: tercja liczby jazd najintensywniejszego dnia (`busiest`), w której wypada dzień. */
function calendarLevel(rides: number, busiest: number): CalendarLevel {
  if (rides === 0) return 0;
  const thirds = (3 * rides) / busiest;
  if (thirds <= 1) return 1;
  return thirds <= 2 ? 2 : 3;
}

/** Kalendarz z wierszy jazd rozliczenia — liczby w dniach sumują się do „Jazdy: N”. */
function composeCalendar(month: SummaryMonth, rideRows: SummaryRideRow[]): RiderCalendar {
  const texts = SETTLEMENT_TEXTS.rider.calendar;
  const perDay = new Map<string, { rides: number; href: string | null }>();
  for (const row of rideRows) {
    const entry = perDay.get(row.day);
    if (entry) {
      entry.rides += 1;
    } else {
      perDay.set(row.day, { rides: 1, href: row.dayHref });
    }
  }

  const busiest = Math.max(0, ...[...perDay.values()].map((entry) => entry.rides));

  const cells: (CalendarDay | null)[] = Array.from({ length: leadingBlanks(month.from) }, () => null);
  for (let date = month.from, day = 1; date <= month.to; date = addDays(date, 1), day += 1) {
    const { rides, href } = perDay.get(date) ?? { rides: 0, href: null };
    cells.push({
      date,
      day,
      rides,
      href,
      level: calendarLevel(rides, busiest),
      label: texts.dayLabel(formatLongDayMonth(date), formatCount(rides, RIDE_FORMS)),
    });
  }
  return { weekdays: texts.weekdays, cells };
}

export function composeRiderSettlementPage(
  input: RiderSettlementPageInput,
  now: Date = new Date(),
): RiderSettlementView {
  const settlement = composeRiderSettlement(input, now);
  const hasRides = settlement.rides > 0;
  return {
    nav: composeMonthNav(input.month, input.monthHref),
    settlement,
    pdfHref: isSettlementPdfAvailable(settlement, now) ? input.pdfHref : null,
    costsLine: settlement.costs.length === 0 ? null : `${SETTLEMENT_TEXTS.rider.costs} ${settlement.costsAmountText}`,
    ridesToggle: settlement.rides === 0 ? null : SETTLEMENT_TEXTS.rider.showAllRides(settlement.rides),
    calendar: hasRides ? composeCalendar(input.month, settlement.rideRows) : null,
    breakdown: hasRides ? composeBreakdown(settlementRides(input, now)) : null,
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
