/**
 * Rozliczenie jeźdźca (GLOSSARY „Rozliczenie”, #95): jeden jeździec, jeden miesiąc — liczba jazd ×
 * obowiązująca stawka, wiersze jazd (wspólne z Podsumowaniem miesiąca) i „Do zapłaty”.
 *
 * `composeRiderSettlement` zwraca jeden obiekt bez adresów strony, żeby PDF rozliczenia (KAN-91)
 * wyrenderował go także poza stroną; `composeRiderSettlementPage` dokłada przełącznik miesięcy i powrót.
 * Kwoty liczy `riderAmounts` — to samo, co wiersz listy „Rozliczenia”.
 */

import { formatCount, formatMoney, formatMonthYear, RIDE_FORMS } from "@/lib/format";
import { UNNAMED_RIDER } from "@/lib/bookings/rows";
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
import type { RateChange } from "@/lib/settlements/rates";
import { riderAmounts, type RiderAmounts } from "@/lib/settlements/settlements";
import { SETTLEMENT_TEXTS } from "@/lib/settlements/texts";

/** Jeździec rozliczenia: konto i nazwa z profilu (`null` — „(bez nazwiska)”). */
export interface SettlementRider {
  key: string;
  name: string | null;
}

export interface RiderSettlementInput {
  month: SummaryMonth;
  rider: SettlementRider;
  /**
   * Zapisy ośrodka z dni miesiąca (`ownerSummaryBookings`), także odwołane i innych jeźdźców — liczą
   * się tylko jazdy tego jeźdźca.
   */
  bookings: SummaryBooking[];
  /** Wszystkie zmiany stawki ośrodka (`listRates`). */
  rates: RateChange[];
  /** Adres dnia przy dacie jazdy; `null` — daty bez linków (np. PDF). */
  dayHref: ((day: string) => string) | null;
}

/** Rozliczenie jednego jeźdźca za jeden miesiąc — gotowe do wyrenderowania na stronie i w PDF. */
export interface RiderSettlement extends RiderAmounts {
  riderKey: string;
  name: string;
  /** Miesiąc `RRRR-MM`. */
  month: string;
  /** Np. `listopad 2026`. */
  monthLabel: string;
  rides: number;
  /** Np. `8 jazd`. */
  ridesText: string;
  /** Np. `Jazdy: 8 × 120,00 zł = 960,00 zł`; `null` — ośrodek bez stawki. */
  ridesLine: string | null;
  /** `stawka ośrodka` / `stawka indywidualna`; `null` — bez stawki. */
  rateSourceText: string | null;
  /** Jazdy chronologicznie: data, godzina, instruktor, koń albo „bez konia”. */
  rideRows: SummaryRideRow[];
  /** Ośrodek nie ma stawki — zamiast kwot prośba „Ustaw stawkę ośrodka”. */
  needsRate: boolean;
}

/** Rozliczenie jeźdźca za miesiąc. `now` jak w statystykach — w bieżącym miesiącu jazdy do teraz. */
export function composeRiderSettlement(input: RiderSettlementInput, now: Date = new Date()): RiderSettlement {
  const rides = monthRides(
    input.bookings.filter((booking) => booking.riderKey === input.rider.key),
    input.month,
    now,
  );
  const amounts = riderAmounts(rides.length, input.rates, input.month.month, input.rider.key);
  const texts = SETTLEMENT_TEXTS.rider;

  return {
    riderKey: input.rider.key,
    name: input.rider.name ?? UNNAMED_RIDER,
    month: input.month.month,
    monthLabel: formatMonthYear(input.month.month),
    rides: rides.length,
    ridesText: formatCount(rides.length, RIDE_FORMS),
    ...amounts,
    ridesLine:
      amounts.rate === null || amounts.ridesAmountText === null
        ? null
        : `${texts.rides} ${String(rides.length)} × ${formatMoney(amounts.rate.amount)} = ${amounts.ridesAmountText}`,
    rateSourceText: amounts.rate === null ? null : texts.source[amounts.rate.source],
    rideRows: composeRideRows(rides, { viewer: "owner", dayHref: input.dayHref }),
    needsRate: amounts.rate === null,
  };
}

export interface RiderSettlementPageInput extends RiderSettlementInput {
  /** Adres rozliczenia tego jeźdźca dla miesiąca `RRRR-MM`. */
  monthHref: (month: string) => string;
}

/** Strona rozliczenia jeźdźca: rozliczenie i przełącznik miesięcy tego samego jeźdźca. */
export interface RiderSettlementView {
  nav: MonthNav;
  settlement: RiderSettlement;
  /** Miesiąc bez jazd jeźdźca — zamiast listy jazd `EmptyState` z `emptyText`. */
  isEmpty: boolean;
  /** Np. `W październiku 2026 nie było jazd.` */
  emptyText: string;
}

export function composeRiderSettlementPage(
  input: RiderSettlementPageInput,
  now: Date = new Date(),
): RiderSettlementView {
  const settlement = composeRiderSettlement(input, now);
  return {
    nav: composeMonthNav(input.month, input.monthHref),
    settlement,
    isEmpty: settlement.rides === 0,
    emptyText: emptyMonthText(input.month, "owner"),
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
