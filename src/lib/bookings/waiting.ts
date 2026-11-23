import { formatCount, formatNumber, type PluralForms } from "@/lib/format";

/**
 * Liczby zapisów oczekujących (#128, GLOSSARY „Zapis oczekujący”, ADR 0006): licznik zapisów do przyjęcia
 * w panelu i w nawigacji ośrodka oraz liczba czekających na slot. Jedyne miejsce tych tekstów.
 */

/** Odmiana „czeka” po liczebniku: `1 czeka`, `2 czekają`, `5 czeka`. */
const WAITING_FORMS: PluralForms = { one: "czeka", few: "czekają", many: "czeka" };

/** Np. `3 czekają`; zero — `nikt nie czeka`. */
export function formatWaitingCount(count: number): string {
  return count === 0 ? "nikt nie czeka" : formatCount(count, WAITING_FORMS);
}

/** Licznik przy pozycji nawigacji: krótka liczba na plakietce i pełny podpis pozycji dla czytnika ekranu. */
export interface NavCounter {
  /** Np. `3`; ponad 99 — `99+`. */
  text: string;
  /** Np. `Zapisy do przyjęcia, 3 czekają`. */
  label: string;
}

const NAV_COUNTER_MAX = 99;

/** Licznik zapisów do przyjęcia przy pozycji nawigacji; `null` — nikt nie czeka albo liczby nie wczytano. */
export function navCounter(itemLabel: string, count: number | null): NavCounter | null {
  if (count === null || count <= 0) {
    return null;
  }
  return {
    text: count > NAV_COUNTER_MAX ? `${String(NAV_COUNTER_MAX)}+` : String(count),
    label: `${itemLabel}, ${formatWaitingCount(count)}`,
  };
}

/** Przy zapisie oczekującym: ilu innych czeka na ten sam slot (US 26); `null` — nikt inny. */
export function formatOthersWaiting(others: number): string | null {
  return others > 0 ? `inni czekający na ten slot: ${formatNumber(others)}` : null;
}

/** Przy slocie na stronie dnia ośrodka (pensjonariusz, slot treningowy): np. `2 czekają na przyjęcie`. */
export function formatSlotWaiting(count: number): string {
  return `${formatWaitingCount(count)} na przyjęcie`;
}
