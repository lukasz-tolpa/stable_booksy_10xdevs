/**
 * Rozliczenia (GLOSSARY „Rozliczenie”, spec #93) — jedyne miejsce, które liczy kwoty. Strony tylko
 * wczytują wiersze (zapisy miesiąca jak w Podsumowaniu miesiąca właściciela, zmiany stawki, koszty
 * dodatkowe miesiąca) i renderują model widoku. Kwoty w groszach (liczby całkowite), zapis kwot — `formatMoney`.
 *
 * Klocki:
 * - `composeSettlementList` — lista jeźdźców miesiąca z kwotami i sumą (strona, boczna kolumna panelu);
 * - `composeSettlementsPage` — cała strona „Rozliczenia” (karty jeźdźców, suma, stawka ośrodka, przełącznik miesięcy,
 *   „Pozostali jeźdźcy ośrodka”);
 * - `riderAmounts` — stawka jeźdźca w miesiącu i jego kwoty (wiersz listy i rozliczenie jeźdźca, `rider.ts`);
 * - `ridesAmount` — kwota za jazdy: liczba jazd × stawka.
 */

import { boardingFeeFor, type BoardingFeeChange } from "@/lib/boarding/fees";
import { isBoarderInMonth, stayOverlapsMonth, type BoardingStay } from "@/lib/boarding/month";
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
  RIDER_FORMS,
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
  type RateKind,
} from "@/lib/settlements/rates";
import type { SettlementRider } from "@/lib/settlements/rider";
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
  /**
   * Rodzaj jeźdźca w miesiącu (#117, reguła „pensjonariusz w miesiącu”): `training` — pensjonariusz,
   * liczy się po stawce treningowej i płaci opłaty za pensjonat; `recreation` — jeździec rekreacyjny.
   */
  kind: RateKind;
  /** Stawka jazd jeźdźca w miesiącu (jego rodzaju); `null` — ośrodek bez stawki tego rodzaju. */
  rate: EffectiveRate | null;
  /** Dopisek źródła stawki: `stawka ośrodka` / `stawka indywidualna`; `null` — bez stawki. */
  rateSourceText: string | null;
  /** Kwota za jazdy w groszach; `null` — bez stawki. */
  ridesAmount: number | null;
  ridesAmountText: string | null;
  /** Suma kosztów dodatkowych jeźdźca w miesiącu, w groszach (#96); liczy się także bez stawki. */
  costsAmount: number;
  costsAmountText: string;
  /**
   * Opłaty za pensjonat (#117): jedna pozycja na konia pensjonariusza z pobytem w miesiącu, po imieniu
   * konia; jeździec rekreacyjny — pusta lista.
   */
  fees: BoardingFeeLine[];
  /** Któryś koń nie ma opłaty — pozycja bez kwoty, a „Do zapłaty” czeka na opłatę (jak na stawkę). */
  needsFee: boolean;
  /**
   * Do zapłaty w groszach — kwota za jazdy + opłaty za pensjonat + koszty dodatkowe; `null` — bez stawki
   * albo bez opłaty któregoś konia.
   */
  due: number | null;
  dueText: string | null;
}

/** Pozycja opłaty za pensjonat w rozliczeniu pensjonariusza (#117). */
export interface BoardingFeeLine {
  horseId: number;
  horseName: string;
  /** Grosze za cały miesiąc; `null` — koń bez opłaty (pozycja z prośbą o jej ustawienie). */
  amount: number | null;
  amountText: string | null;
  /** Np. `Opłata za pensjonat — Hrabia: 1 500,00 zł` albo `Opłata za pensjonat — Hrabia: brak kwoty`. */
  line: string;
}

/**
 * Koń pensjonatowy ośrodka z właścicielem i pobytami (#117) — z niego reguła „pensjonariusz w miesiącu”
 * i pozycje opłat za pensjonat. Opłaty konia są osobno (`SettlementIngredients.boardingFees`).
 */
export interface SettlementBoardingHorse {
  horseId: number;
  name: string;
  /** Pensjonariusz — właściciel konia; `null` — konto usunięte, koń bez właściciela (nikt nie płaci). */
  riderKey: string | null;
  stays: BoardingStay[];
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
  /** Wszystkie zmiany stawki ośrodka (`listRates`), obu rodzajów. */
  rates: RateChange[];
  /** Koszty dodatkowe ośrodka w miesiącu (`listMonthCosts`, #96). */
  costs: ExtraCost[];
  /** Konie pensjonatowe ośrodka z właścicielami i pobytami (`listSettlementBoardingHorses`, #117). */
  boardingHorses: SettlementBoardingHorse[];
  /** Wszystkie zmiany opłat za pensjonat koni ośrodka (#117). */
  boardingFees: BoardingFeeChange[];
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

export interface RiderAmountsInput extends Pick<SettlementIngredients, "boardingHorses" | "boardingFees"> {
  /** Konto jeźdźca. */
  riderKey: string;
  /** Miesiąc `RRRR-MM`. */
  month: string;
  /** Liczba jazd jeźdźca w miesiącu. */
  rides: number;
  /** Wszystkie zmiany stawki ośrodka (`listRates`). */
  rates: readonly RateChange[];
  /** Koszty dodatkowe ośrodka w miesiącu — liczą się tylko koszty tego jeźdźca. */
  costs: readonly ExtraCost[];
}

/** Konie pensjonatowe jeźdźca (jako właściciela) w ośrodku. */
function riderHorses(horses: readonly SettlementBoardingHorse[], riderKey: string): SettlementBoardingHorse[] {
  return horses.filter((horse) => horse.riderKey === riderKey);
}

/**
 * Rodzaj jeźdźca w miesiącu `RRRR-MM` (reguła „pensjonariusz w miesiącu”, `isBoarderInMonth`): pobyt
 * choć jednego jego konia zachodzi na miesiąc — `training`, inaczej `recreation`. Także rodzaj stawki
 * indywidualnej, którą ustawia formularz rozliczenia jeźdźca.
 */
export function riderKindIn(horses: readonly SettlementBoardingHorse[], riderKey: string, month: string): RateKind {
  const stays = riderHorses(horses, riderKey).flatMap((horse) => horse.stays);
  return isBoarderInMonth(stays, month) ? "training" : "recreation";
}

/** Pozycje opłat za pensjonat: konie jeźdźca z pobytem w miesiącu, po imieniu konia. */
function feeLines(
  horses: readonly SettlementBoardingHorse[],
  fees: readonly BoardingFeeChange[],
  riderKey: string,
  month: string,
): BoardingFeeLine[] {
  const texts = SETTLEMENT_TEXTS.rider.fee;
  return riderHorses(horses, riderKey)
    .filter((horse) => horse.stays.some((stay) => stayOverlapsMonth(stay, month)))
    .sort((a, b) => a.name.localeCompare(b.name, "pl") || a.horseId - b.horseId)
    .map((horse) => {
      const amount = boardingFeeFor(fees, horse.horseId, month);
      const amountText = moneyText(amount);
      return {
        horseId: horse.horseId,
        horseName: horse.name,
        amount,
        amountText,
        line: texts.line(horse.name, amountText ?? texts.missing),
      };
    });
}

/**
 * Kwoty jeźdźca w miesiącu — jedyne miejsce, które wybiera stawkę jeźdźca (rodzaj jeźdźca w miesiącu,
 * stawka indywidualna albo ośrodka tego rodzaju, `effectiveRate`) i liczy „do zapłaty” = kwota za jazdy
 * + opłaty za pensjonat jego koni + jego koszty (lista i rozliczenie jeźdźca).
 */
export function riderAmounts({
  riderKey,
  month,
  rides,
  rates,
  costs,
  boardingHorses,
  boardingFees,
}: RiderAmountsInput): RiderAmounts {
  const kind = riderKindIn(boardingHorses, riderKey, month);
  // Dopóki ośrodek nie ma stawki ośrodka rodzaju jeźdźca, jego kwot nie ma — także przy stawce
  // indywidualnej (lista, suma, panel i rozliczenie jeźdźca proszą o stawkę ośrodka).
  const rate = stableRateFor(rates, month, kind) === null ? null : effectiveRate(rates, month, riderKey, kind);
  const amount = ridesAmount(rides, rate);
  const costsAmount = costsSum(riderCosts(costs, riderKey));
  const fees = kind === "training" ? feeLines(boardingHorses, boardingFees, riderKey, month) : [];
  const needsFee = fees.some((fee) => fee.amount === null);
  const feesAmount = fees.reduce((sum, fee) => sum + (fee.amount ?? 0), 0);
  // Bez stawki (albo bez opłaty konia) „do zapłaty” czeka — koszty i znane pozycje widać osobno.
  const due = amount === null || needsFee ? null : amount + feesAmount + costsAmount;
  const sources = kind === "training" ? SETTLEMENT_TEXTS.rider.trainingSource : SETTLEMENT_TEXTS.rider.source;
  return {
    kind,
    rate,
    rateSourceText: rate === null ? null : sources[rate.source],
    ridesAmount: amount,
    ridesAmountText: moneyText(amount),
    costsAmount,
    costsAmountText: formatMoney(costsAmount),
    fees,
    needsFee,
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
        ...riderAmounts({
          riderKey,
          month: input.month.month,
          rides: entry.rides,
          rates: input.rates,
          costs: input.costs,
          boardingHorses: input.boardingHorses,
          boardingFees: input.boardingFees,
        }),
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
  /**
   * Jeźdźcy ośrodka (`listStableRiders` — konta z jakimkolwiek zapisem w ośrodku, także odwołanym);
   * ci spoza listy miesiąca to „Pozostali jeźdźcy ośrodka”.
   */
  riders: readonly SettlementRider[];
  /** Adres strony dla miesiąca `RRRR-MM`. */
  monthHref: (month: string) => string;
  /** Adres rozliczenia jeźdźca w wybranym miesiącu. */
  riderHref: (riderKey: string) => string;
}

/**
 * Karta jeźdźca na stronie „Rozliczenia” (#105): „N jazd × stawka [źródło] = kwota za jazdy + koszty”
 * i „Do zapłaty”. Cała karta prowadzi do rozliczenia jeźdźca tego samego miesiąca.
 */
export interface SettlementLinkRow extends SettlementRow {
  href: string;
  /** Stawka jeźdźca w miesiącu, np. `120,00 zł`; `null` — bez stawki ośrodka. */
  rateText: string | null;
  /**
   * Pigułka źródła stawki przy stawce: indywidualna wyróżniona (`primary`), ośrodka neutralna;
   * `null` — bez stawki ośrodka.
   */
  rateTag: RateTag | null;
  /** Np. `koszty 1 500,00 zł`, tylko gdy są i ośrodek ma stawkę; `null` — karta ich nie pokazuje. */
  costsText: string | null;
}

/** Pigułka źródła stawki na karcie jeźdźca — wariant to wariant `Tag` (`@/components/ui/Tag.astro`). */
export interface RateTag {
  text: string;
  variant: "neutral" | "primary";
}

/** „Do zapłaty razem” w bocznej kolumnie strony „Rozliczenia” (#105). */
export interface SettlementsSummary {
  /** Suma miesiąca (`SettlementList.total`), np. `12 340,00 zł`; `null` — bez stawki ośrodka. */
  totalText: string | null;
  /** Suma dla czytników ekranu, np. `Razem: 12 340,00 zł` (`SettlementList.totalText`); `null` — bez stawki. */
  totalLabel: string | null;
  /** Np. `2 jeźdźców · 120 jazd`. */
  countsText: string;
}

/**
 * Jeździec ośrodka bez jazd i kosztów w oglądanym miesiącu (#106) — link „Dopisz koszt →” do jego
 * rozliczenia, gdzie dopisuje się koszt dodatkowy.
 */
export interface OtherRider {
  riderKey: string;
  name: string;
  /** Rozliczenie jeźdźca w oglądanym miesiącu. */
  href: string;
}

export interface SettlementsView {
  nav: MonthNav;
  summary: SettlementsSummary;
  /** Stawka rekreacyjna ośrodka (karta „Stawka ośrodka”). */
  rate: StableRateView;
  /** Stawka treningowa ośrodka (#117, karta „Stawka treningowa”) — jazdy pensjonariuszy. */
  trainingRate: StableRateView;
  list: Omit<SettlementList, "rows"> & { rows: SettlementLinkRow[] };
  /** „Pozostali jeźdźcy ośrodka”: alfabetycznie; pusta — strona nie pokazuje sekcji. */
  others: OtherRider[];
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

/** Stawka ośrodka rodzaju `kind` dziś, zaplanowana zmiana i wybór „od tego / od następnego miesiąca”. */
function stableRateView(rates: RateChange[], currentMonth: string, kind: RateKind): StableRateView {
  const { current, planned } = rateSchedule(rates, null, currentMonth, kind);
  const amount = current?.amount ?? null;
  return {
    current: amount,
    currentText: moneyText(amount),
    planned: planned ? { ...planned, text: plannedRateText(planned) } : null,
    choices: rateChoices(currentMonth),
  };
}

/**
 * „Pozostali jeźdźcy ośrodka”: jeźdźcy ośrodka bez wiersza na liście miesiąca, alfabetycznie jak lista.
 * Zanonimizowani nie mają konta, więc nie ma ich wśród jeźdźców ośrodka (ADR-0001).
 */
function otherRiders(
  riders: readonly SettlementRider[],
  rows: readonly SettlementRow[],
  riderHref: (riderKey: string) => string,
): OtherRider[] {
  const listed = new Set(rows.map((row) => row.riderKey));
  return riders
    .filter((rider) => !listed.has(rider.key))
    .map((rider) => ({ riderKey: rider.key, name: rider.name ?? UNNAMED_RIDER, href: riderHref(rider.key) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pl") || a.riderKey.localeCompare(b.riderKey));
}

/**
 * Strona „Rozliczenia”: karty jeźdźców wybranego miesiąca, podsumowanie „Do zapłaty razem”, stawka
 * ośrodka (dziś), przełącznik miesięcy i „Pozostali jeźdźcy ośrodka”.
 */
export function composeSettlementsPage(input: SettlementsPageInput, now: Date = new Date()): SettlementsView {
  const list = composeSettlementList(input, now);
  const rides = list.rows.reduce((sum, row) => sum + row.rides, 0);
  return {
    nav: composeMonthNav(input.month, input.monthHref),
    summary: {
      totalText: moneyText(list.total),
      totalLabel: list.totalText,
      countsText: `${formatCount(list.rows.length, RIDER_FORMS)} · ${formatCount(rides, RIDE_FORMS)}`,
    },
    rate: stableRateView(input.rates, currentMonth(now), "recreation"),
    trainingRate: stableRateView(input.rates, currentMonth(now), "training"),
    list: {
      ...list,
      rows: list.rows.map((row) => ({
        ...row,
        href: input.riderHref(row.riderKey),
        rateText: moneyText(row.rate?.amount ?? null),
        rateTag:
          row.rate === null || row.rateSourceText === null
            ? null
            : { text: row.rateSourceText, variant: row.rate.source === "individual" ? "primary" : "neutral" },
        // Bez stawki karta ma samą liczbę jazd — koszty widać w rozliczeniu jeźdźca.
        costsText:
          row.rate !== null && row.costsAmount > 0 ? `${SETTLEMENT_TEXTS.card.costs} ${row.costsAmountText}` : null,
      })),
    },
    others: otherRiders(input.riders, list.rows, input.riderHref),
    isEmpty: list.rows.length === 0,
    emptyText: `${capitalize(formatInMonthYear(input.month.month))} ${SETTLEMENT_TEXTS.empty}`,
  };
}
