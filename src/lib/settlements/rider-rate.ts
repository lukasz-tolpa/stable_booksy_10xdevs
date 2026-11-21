/**
 * Stawka jeźdźca w rozliczeniu jeźdźca (#97, GLOSSARY „Stawka”): stawka, po której jeździec płaci dziś
 * (indywidualna albo ośrodka), jego zaplanowana zmiana i wybór „od tego / od następnego miesiąca” —
 * zawsze względem bieżącego miesiąca, nie oglądanego (jak stawka ośrodka na „Rozliczeniach”).
 * Którą stawkę liczyć, rozstrzyga `effectiveRate` w `rates.ts`.
 */

import { formatFromMonth, formatMoney } from "@/lib/format";
import { todayIso } from "@/lib/schedule/dates";
import { riderRateSchedule, type RateChange } from "@/lib/settlements/rates";
import { rateChoices, type RateChoice } from "@/lib/settlements/settlements";
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
  choices: RateChoice[];
}

/** Stawka jeźdźca `riderKey` dziś i jego zaplanowana zmiana. `now` — bieżący miesiąc w strefie ośrodka. */
export function composeRiderRate(
  rates: readonly RateChange[],
  riderKey: string,
  now: Date = new Date(),
): RiderRateView {
  const currentMonth = todayIso(now).slice(0, 7);
  const { current, planned } = riderRateSchedule(rates, riderKey, currentMonth);
  const source = SETTLEMENT_TEXTS.rider.source;
  return {
    currentText: current === null ? null : formatMoney(current.amount),
    sourceText: current === null ? null : source[current.source],
    planned:
      planned === null
        ? null
        : {
            id: planned.id,
            text: `${formatFromMonth(planned.fromMonth)}: ${planned.amount === null ? source.stable : formatMoney(planned.amount)}`,
          },
    canEnd: current?.source === "individual",
    choices: rateChoices(currentMonth),
  };
}
