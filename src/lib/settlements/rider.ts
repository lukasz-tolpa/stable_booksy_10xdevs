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

/** Rozliczenie jeźdźca za miesiąc. `now` jak w statystykach — w bieżącym miesiącu jazdy do teraz. */
export function composeRiderSettlement(input: RiderSettlementInput, now: Date = new Date()): RiderSettlement {
  const rides = monthRides(
    input.bookings.filter((booking) => booking.riderKey === input.rider.key),
    input.month,
    now,
  );
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
}

export function composeRiderSettlementPage(
  input: RiderSettlementPageInput,
  now: Date = new Date(),
): RiderSettlementView {
  const settlement = composeRiderSettlement(input, now);
  return {
    nav: composeMonthNav(input.month, input.monthHref),
    settlement,
    pdfHref: isSettlementPdfAvailable(settlement, now) ? input.pdfHref : null,
    costsLine: settlement.costs.length === 0 ? null : `${SETTLEMENT_TEXTS.rider.costs} ${settlement.costsAmountText}`,
    ridesToggle: settlement.rides === 0 ? null : SETTLEMENT_TEXTS.rider.showAllRides(settlement.rides),
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
