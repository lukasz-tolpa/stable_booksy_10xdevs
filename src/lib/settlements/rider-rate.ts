/**
 * Stawka jeźdźca w rozliczeniu jeźdźca (#97, GLOSSARY „Stawka”): stawka, po której jeździec płaci dziś
 * (indywidualna albo ośrodka), jego zaplanowana zmiana i wybór „od tego / od następnego miesiąca” —
 * zawsze względem bieżącego miesiąca, nie oglądanego (jak stawka ośrodka na „Rozliczeniach”).
 * Którą stawkę liczyć, rozstrzyga `effectiveRate` w `rates.ts`.
 */

import { formatMoney } from "@/lib/format";
import { currentMonth } from "@/lib/schedule/dates";
import { rateFromMonth, rateSchedule, type RateChange, type RateFrom, type RateKind } from "@/lib/settlements/rates";
import {
  plannedRateText,
  rateChoices,
  riderRateKindIn,
  type RateChoice,
  type SettlementBoardingHorse,
} from "@/lib/settlements/settlements";
import { SETTLEMENT_TEXTS } from "@/lib/settlements/texts";

export interface RiderRateView {
  /** Stawka jazd jeźdźca w bieżącym miesiącu, np. `120,00 zł`; `null` — ośrodek bez stawki. */
  currentText: string | null;
  /** `stawka ośrodka` / `stawka indywidualna`; `null` — bez stawki. */
  sourceText: string | null;
  /** Zmiana jeźdźca od następnego miesiąca: `od grudnia 2026: 90,00 zł` albo `…: stawka ośrodka`. */
  planned: { id: number; text: string } | null;
  /** Obowiązuje stawka indywidualna — formularz „Usuń stawkę indywidualną” (powrót do stawki ośrodka). */
  canEnd: boolean;
  /** Podpowiedź pod stawką — u pensjonariusza o stawce treningowej (#117). */
  hint: string;
  choices: RateChoice[];
}

/**
 * Stawka jeźdźca `riderKey` dziś i jego zaplanowana zmiana. `now` — bieżący miesiąc w strefie ośrodka;
 * `kind` — rodzaj jeźdźca w bieżącym miesiącu (`riderRateKindIn`; pensjonariusz — treningowa, #117).
 */
export function composeRiderRate(
  rates: readonly RateChange[],
  riderKey: string,
  now: Date = new Date(),
  kind: RateKind = "recreation",
): RiderRateView {
  const month = currentMonth(now);
  const { current, planned } = rateSchedule(rates, riderKey, month, kind);
  const training = kind === "training";
  const sources = training ? SETTLEMENT_TEXTS.rider.trainingSource : SETTLEMENT_TEXTS.rider.source;
  return {
    currentText: current === null ? null : formatMoney(current.amount),
    sourceText: current === null ? null : sources[current.source],
    planned: planned === null ? null : { id: planned.id, text: plannedRateText(planned) },
    canEnd: current?.source === "individual",
    hint: training ? SETTLEMENT_TEXTS.riderRate.trainingHint : SETTLEMENT_TEXTS.riderRate.hint,
    choices: rateChoices(month),
  };
}

/**
 * Zapisywana stawka indywidualna jeźdźca: miesiąc „od” z wyboru formularza (względem bieżącego miesiąca)
 * i rodzaj — rodzaj jeźdźca w tym właśnie miesiącu (`riderRateKindIn`; pensjonariusz — treningowa), więc stawka
 * „od następnego miesiąca” dla konia, który wtedy przyjeżdża albo już wyjechał, ma rodzaj tamtego miesiąca.
 */
export function riderRateStart(
  horses: readonly SettlementBoardingHorse[],
  riderKey: string,
  from: RateFrom,
  now: Date = new Date(),
): { kind: RateKind; fromMonth: string } {
  const fromMonth = rateFromMonth(from, currentMonth(now));
  return { kind: riderRateKindIn(horses, riderKey, fromMonth), fromMonth };
}
