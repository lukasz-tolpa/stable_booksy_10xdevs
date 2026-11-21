/**
 * Rozliczenia (GLOSSARY „Rozliczenie”, spec #93) — jedyne miejsce, które liczy kwoty. Strony tylko
 * wczytują wiersze (zapisy miesiąca jak w Podsumowaniu miesiąca właściciela, zmiany stawki, koszty
 * dodatkowe miesiąca) i renderują model widoku. Kwoty w groszach (liczby całkowite), zapis kwot — `formatMoney`.
 *
 * Klocki:
 * - `composeSettlementList` — lista jeźdźców miesiąca z kwotami i sumą (strona, boczna kolumna panelu);
 * - `composeSettlementsPage` — cała strona „Rozliczenia” (lista, stawka ośrodka, przełącznik miesięcy);
 * - `riderAmounts` — stawka jeźdźca w miesiącu i jego kwoty (wiersz listy i rozliczenie jeźdźca, `rider.ts`);
 * - `ridesAmount` — kwota za jazdy: liczba jazd × stawka.
 */

import type { RideCandidate } from "@/lib/bookings/rides";
import { UNNAMED_RIDER } from "@/lib/bookings/rows";
import {
  capitalize,
  formatCount,
  formatFromMonth,
  formatInMonthYear,
  formatMoney,
  formatMonthYear,
  RIDE_FORMS,
} from "@/lib/format";
import type { SummaryMonth } from "@/lib/month-summary/month";
import { composeMonthNav, monthRides, type MonthNav } from "@/lib/month-summary/summary";
import { currentMonth } from "@/lib/schedule/dates";
import { costsSum, riderCosts, type ExtraCost } from "@/lib/settlements/costs";
import {
  effectiveRate,
  RATE_FROM,
  rateFromMonth,
  rateSchedule,
  stableRateFor,
  type EffectiveRate,
  type PlannedRate,
  type RateChange,
  type RateFrom,
} from "@/lib/settlements/rates";
import { SETTLEMENT_TEXTS } from "@/lib/settlements/texts";
import type { StatsRider } from "@/lib/stats/riders";
import type { StatsBooking } from "@/lib/stats/stats";

/**
 * Zapis w zakresie potrzebnym rozliczeniom — jazdą staje się dopiero po odsiewie (`monthRides`), więc
 * wolno podać odwołane i nadchodzące zapisy. `SummaryBooking` Podsumowania miesiąca jest jego nadzbiorem.
 */
export interface SettlementBooking extends RideCandidate {
  /** Konto jeźdźca; `null` — jeździec zanonimizowany (ADR-0001), bez rozliczenia. */
  riderKey: string | null;
  /** Nazwa z profilu; `null` — „(bez nazwiska)”. */
  riderName: string | null;
}

/**
 * Kwoty jeźdźca w miesiącu — wspólne dla wiersza listy i rozliczenia jeźdźca (`riderAmounts`), więc
 * obie strony zawsze pokazują to samo.
 */
export interface RiderAmounts {
  /** Stawka jazd jeźdźca w miesiącu; `null` — ośrodek bez stawki. */
  rate: EffectiveRate | null;
  /** Dopisek źródła stawki: `stawka ośrodka` / `stawka indywidualna`; `null` — bez stawki. */
  rateSourceText: string | null;
  /** Kwota za jazdy w groszach; `null` — bez stawki. */
  ridesAmount: number | null;
  ridesAmountText: string | null;
  /** Suma kosztów dodatkowych jeźdźca w miesiącu, w groszach (#96); liczy się także bez stawki. */
  costsAmount: number;
  costsAmountText: string;
  /** Do zapłaty w groszach — kwota za jazdy + koszty dodatkowe; `null` — bez stawki. */
  due: number | null;
  dueText: string | null;
}

/** Wiersz listy rozliczeń: jeden jeździec w miesiącu. */
export interface SettlementRow extends RiderAmounts {
  riderKey: string;
  name: string;
  rides: number;
  /** Np. `8 jazd`. */
  ridesText: string;
}

export interface SettlementList {
  /** Alfabetycznie; bez jeźdźców zanonimizowanych. */
  rows: SettlementRow[];
  /** Ośrodek nie ma stawki — zamiast kwot prośba „Ustaw stawkę ośrodka”. */
  needsRate: boolean;
  /** Suma miesiąca = suma „do zapłaty” wierszy; `null` — bez stawki. */
  total: number | null;
  /** Np. `Razem: 12 340,00 zł`. */
  totalText: string | null;
}

/**
 * Składniki rozliczenia poza zapisami — wspólne dla listy i rozliczenia jeźdźca (`rider.ts`). Wczytuje je
 * jedno miejsce w `queries.ts`, więc nowy składnik dochodzi tu i tam, a obie strony go dostają.
 */
export interface SettlementIngredients {
  /** Wszystkie zmiany stawki ośrodka (`listRates`). */
  rates: RateChange[];
  /** Koszty dodatkowe ośrodka w miesiącu (`listMonthCosts`, #96). */
  costs: ExtraCost[];
}

export interface SettlementsInput extends SettlementIngredients {
  month: SummaryMonth;
  /** Zapisy ośrodka z dni miesiąca, także odwołane — liczą się tylko jazdy. */
  bookings: SettlementBooking[];
}

/**
 * Zapisy ośrodka z odczytu Podsumowania miesiąca właściciela (`getStatsRows` dla granic miesiąca) we
 * wspólnym kształcie rozliczeń: klucz i nazwa jeźdźca. Rozliczenie jeźdźca z wierszami jazd bierze
 * zamiast tego `ownerSummaryBookings` — jego `SummaryBooking` też jest `SettlementBooking`.
 */
export function settlementBookings(rows: { bookings: StatsBooking[]; riders: StatsRider[] }): SettlementBooking[] {
  const names = new Map(rows.riders.map((rider) => [rider.id, rider.name]));
  return rows.bookings.map((booking) => ({
    day: booking.day,
    hour: booking.hour,
    status: booking.status,
    riderKey: booking.riderId,
    riderName: booking.riderId === null ? null : (names.get(booking.riderId) ?? null),
  }));
}

/** Kwota za jazdy w groszach: liczba jazd × stawka; `null` — bez stawki. */
export function ridesAmount(rides: number, rate: EffectiveRate | null): number | null {
  return rate === null ? null : rides * rate.amount;
}

function moneyText(grosze: number | null): string | null {
  return grosze === null ? null : formatMoney(grosze);
}

/**
 * Kwoty jeźdźca `riderKey` za miesiąc `RRRR-MM` przy `rides` jazdach i jego kosztach dodatkowych `costs`
 * — jedyne miejsce, które wybiera stawkę jeźdźca (stawka indywidualna albo ośrodka, `effectiveRate`)
 * i liczy „do zapłaty” = kwota za jazdy + koszty (lista i rozliczenie jeźdźca).
 */
export function riderAmounts(
  rides: number,
  rates: readonly RateChange[],
  month: string,
  riderKey: string,
  costs: readonly ExtraCost[],
): RiderAmounts {
  // Dopóki ośrodek nie ma żadnej stawki ośrodka, nie ma kwot nigdzie — także przy stawce indywidualnej
  // (lista, suma, panel i rozliczenie jeźdźca proszą o stawkę ośrodka).
  const rate = stableRateFor(rates, month) === null ? null : effectiveRate(rates, month, riderKey);
  const amount = ridesAmount(rides, rate);
  const costsAmount = costsSum(costs);
  // Bez stawki nie ma kwoty za jazdy, więc i „do zapłaty” czeka na stawkę — koszty widać osobno.
  const due = amount === null ? null : amount + costsAmount;
  return {
    rate,
    rateSourceText: rate === null ? null : SETTLEMENT_TEXTS.rider.source[rate.source],
    ridesAmount: amount,
    ridesAmountText: moneyText(amount),
    costsAmount,
    costsAmountText: formatMoney(costsAmount),
    due,
    dueText: moneyText(due),
  };
}

/**
 * Lista rozliczeń miesiąca: jeźdźcy z jazdami lub kosztami dodatkowymi alfabetycznie, kwoty i suma.
 * `now` jak w statystykach.
 */
export function composeSettlementList(input: SettlementsInput, now: Date = new Date()): SettlementList {
  const byRider = new Map<string, { name: string | null; rides: number }>();
  for (const ride of monthRides(input.bookings, input.month, now)) {
    // Jeździec zanonimizowany nie ma rozliczenia — nie ma komu go przedstawić (ADR-0001).
    if (ride.riderKey === null) continue;
    const entry = byRider.get(ride.riderKey);
    if (entry) {
      entry.rides += 1;
    } else {
      byRider.set(ride.riderKey, { name: ride.riderName, rides: 1 });
    }
  }
  // Jeździec bez jazd, któremu dopisano koszt dodatkowy, też ma rozliczenie (#96).
  for (const cost of input.costs) {
    if (!byRider.has(cost.riderKey)) {
      byRider.set(cost.riderKey, { name: cost.riderName, rides: 0 });
    }
  }

  const needsRate = stableRateFor(input.rates, input.month.month) === null;
  const rows = [...byRider]
    .map(
      ([riderKey, entry]): SettlementRow => ({
        riderKey,
        name: entry.name ?? UNNAMED_RIDER,
        rides: entry.rides,
        ridesText: formatCount(entry.rides, RIDE_FORMS),
        ...riderAmounts(entry.rides, input.rates, input.month.month, riderKey, riderCosts(input.costs, riderKey)),
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pl") || a.riderKey.localeCompare(b.riderKey));

  const total = needsRate ? null : rows.reduce((sum, row) => sum + (row.due ?? 0), 0);
  return {
    rows,
    needsRate,
    total,
    totalText: total === null ? null : `${SETTLEMENT_TEXTS.total} ${formatMoney(total)}`,
  };
}

/** Wybór „od kiedy” w formularzu stawki, z miesiącem w etykiecie. */
export interface RateChoice {
  value: RateFrom;
  label: string;
  checked: boolean;
}

/** Stawka ośrodka na górze strony — zawsze względem bieżącego miesiąca, nie wybranego. */
export interface StableRateView {
  /** Grosze w bieżącym miesiącu; `null` — „Ustaw stawkę ośrodka”. */
  current: number | null;
  currentText: string | null;
  /** Np. `od stycznia 2027: 140,00 zł`. */
  planned: (PlannedRate & { text: string }) | null;
  choices: RateChoice[];
}

export interface SettlementsPageInput extends SettlementsInput {
  /** Adres strony dla miesiąca `RRRR-MM`. */
  monthHref: (month: string) => string;
  /** Adres rozliczenia jeźdźca w wybranym miesiącu. */
  riderHref: (riderKey: string) => string;
}

/** Wiersz listy na stronie „Rozliczenia” — prowadzi do rozliczenia jeźdźca tego samego miesiąca. */
export interface SettlementLinkRow extends SettlementRow {
  href: string;
}

export interface SettlementsView {
  nav: MonthNav;
  rate: StableRateView;
  /** Np. `Stawka ośrodka w październiku 2026: 120,00 zł`; `null` — bez stawki. */
  monthRateText: string | null;
  list: Omit<SettlementList, "rows"> & { rows: SettlementLinkRow[] };
  /** Miesiąc bez nic do rozliczenia — strona pokazuje `EmptyState` z `emptyText`. */
  isEmpty: boolean;
  /** Np. `W październiku 2026 nie ma nic do rozliczenia.` */
  emptyText: string;
}

/**
 * Zaplanowana zmiana stawki jednym tekstem: `od grudnia 2026: 90,00 zł`, a powrót jeźdźca do stawki
 * ośrodka — `od grudnia 2026: stawka ośrodka` (karta stawki ośrodka i stawki jeźdźca).
 */
export function plannedRateText(planned: PlannedRate): string {
  const amount = planned.amount === null ? SETTLEMENT_TEXTS.rider.source.stable : formatMoney(planned.amount);
  return `${formatFromMonth(planned.fromMonth)}: ${amount}`;
}

/**
 * Wybór „od tego / od następnego miesiąca” z miesiącem w etykiecie względem bieżącego miesiąca
 * (`RRRR-MM`) — formularze stawki ośrodka i stawki jeźdźca (#97).
 */
export function rateChoices(currentMonth: string): RateChoice[] {
  const texts = SETTLEMENT_TEXTS.rate;
  const choice = (value: RateFrom, label: string): RateChoice => ({
    value,
    label: `${label} (${formatMonthYear(rateFromMonth(value, currentMonth))})`,
    checked: value === RATE_FROM.current,
  });
  return [choice(RATE_FROM.current, texts.fromCurrent), choice(RATE_FROM.next, texts.fromNext)];
}

/** Stawka ośrodka dziś, zaplanowana zmiana i wybór „od tego / od następnego miesiąca”. */
function stableRateView(rates: RateChange[], currentMonth: string): StableRateView {
  const { current, planned } = rateSchedule(rates, null, currentMonth);
  const amount = current?.amount ?? null;
  return {
    current: amount,
    currentText: moneyText(amount),
    planned: planned ? { ...planned, text: plannedRateText(planned) } : null,
    choices: rateChoices(currentMonth),
  };
}

/** Strona „Rozliczenia”: lista wybranego miesiąca, stawka ośrodka (dziś) i przełącznik miesięcy. */
export function composeSettlementsPage(input: SettlementsPageInput, now: Date = new Date()): SettlementsView {
  const list = composeSettlementList(input, now);
  const monthRate = stableRateFor(input.rates, input.month.month);
  return {
    nav: composeMonthNav(input.month, input.monthHref),
    rate: stableRateView(input.rates, currentMonth(now)),
    monthRateText:
      monthRate === null
        ? null
        : `${SETTLEMENT_TEXTS.rate.inMonth} ${formatInMonthYear(input.month.month)}: ${formatMoney(monthRate.amount)}`,
    list: { ...list, rows: list.rows.map((row) => ({ ...row, href: input.riderHref(row.riderKey) })) },
    isEmpty: list.rows.length === 0,
    emptyText: `${capitalize(formatInMonthYear(input.month.month))} ${SETTLEMENT_TEXTS.empty}`,
  };
}
