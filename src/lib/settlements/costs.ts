/**
 * Koszty dodatkowe (GLOSSARY „Koszt dodatkowy”, #96): pozycje rozliczenia poza jazdami — nazwa i kwota
 * w groszach, jednemu jeźdźcowi na jeden miesiąc. „Do zapłaty” z nimi liczy `riderAmounts`
 * (`settlements.ts`); tu tylko kształt, suma i pozycje kosztów w rozliczeniu jeźdźca.
 */

import { formatAmountInput, formatMoney } from "@/lib/format";

/** Koszt dodatkowy jednego jeźdźca w miesiącu, którego dotyczy odczyt (`listMonthCosts`). */
export interface ExtraCost {
  id: number;
  /** Konto jeźdźca (zanonimizowany nie ma kosztów — usunięcie konta je usuwa). */
  riderKey: string;
  /** Nazwa jeźdźca z profilu; `null` — „(bez nazwiska)”. */
  riderName: string | null;
  /** Np. `Wyjazd na zawody`. */
  name: string;
  /** Grosze, 1..10 000 000. */
  amount: number;
}

/** Pozycja kosztu w rozliczeniu jeźdźca: nazwa i kwota do wyświetlenia. */
export interface ExtraCostRow {
  id: number;
  name: string;
  amount: number;
  /** Np. `800,00 zł`. */
  amountText: string;
  /** Wartość pola kwoty w „Popraw”, np. `800,00`. */
  amountInput: string;
}

/** Koszty jednego jeźdźca z kosztów miesiąca, w kolejności odczytu (od najwcześniej dopisanego). */
export function riderCosts(costs: readonly ExtraCost[], riderKey: string): ExtraCost[] {
  return costs.filter((cost) => cost.riderKey === riderKey);
}

/** Suma kosztów w groszach. */
export function costsSum(costs: readonly ExtraCost[]): number {
  return costs.reduce((sum, cost) => sum + cost.amount, 0);
}

export function extraCostRows(costs: readonly ExtraCost[]): ExtraCostRow[] {
  return costs.map((cost) => ({
    id: cost.id,
    name: cost.name,
    amount: cost.amount,
    amountText: formatMoney(cost.amount),
    amountInput: formatAmountInput(cost.amount),
  }));
}
