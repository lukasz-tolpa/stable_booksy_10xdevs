import { addDays, isValidIsoDate, todayIso, type DateRange } from "@/lib/schedule/dates";

/**
 * Miesiąc Podsumowania miesiąca (GLOSSARY.md): miesiąc kalendarzowy w strefie ośrodka, od 1. do
 * ostatniego dnia, jak dni w grafiku. Żyje w adresie strony (`?miesiac=RRRR-MM`), więc odświeżenie
 * i link prowadzą do tego samego miesiąca.
 */

/** Nazwa parametru adresu z miesiącem. */
export const MONTH_PARAM = "miesiac";

const MONTH = /^\d{4}-\d{2}$/;

/** Miesiąc jako zakres dni (`DateRange`) — wprost do odczytów wierszy z zakresem. */
export interface SummaryMonth extends DateRange {
  /** Miesiąc `RRRR-MM`. */
  month: string;
  /** Pierwszy dzień miesiąca `RRRR-MM-DD`. */
  from: string;
  /** Ostatni dzień miesiąca `RRRR-MM-DD` (włącznie). */
  to: string;
  /** Poprzedni miesiąc `RRRR-MM` — wstecz bez limitu. */
  previous: string;
  /** Następny miesiąc `RRRR-MM`; `null` w bieżącym miesiącu (przyszłe miesiące nie mają jazd). */
  next: string | null;
  /** To bieżący miesiąc — liczą się w nim jazdy do teraz. */
  isCurrent: boolean;
}

/** Miesiąc przesunięty o `offset` miesięcy — w UTC, jak arytmetyka dni grafiku. */
export function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

function parseMonth(raw: string | null | undefined): string | null {
  return raw && MONTH.test(raw) && isValidIsoDate(`${raw}-01`) ? raw : null;
}

/**
 * Miesiąc z parametru adresu. Brak, błędna wartość i miesiąc przyszły dają bieżący miesiąc —
 * przyszłość nie ma jazd, a strzałka „następny” do niej nie prowadzi.
 */
export function resolveSummaryMonth(raw: string | null | undefined, today: string = todayIso()): SummaryMonth {
  const current = today.slice(0, 7);
  const parsed = parseMonth(raw);
  const month = parsed !== null && parsed <= current ? parsed : current;
  const next = shiftMonth(month, 1);

  return {
    month,
    from: `${month}-01`,
    to: addDays(`${next}-01`, -1),
    previous: shiftMonth(month, -1),
    next: month === current ? null : next,
    isCurrent: month === current,
  };
}

/** Miesiąc w parametrach adresu (`?miesiac=RRRR-MM`) — odwrotność `resolveSummaryMonth`. */
export function monthSearch(month: string): string {
  return `?${MONTH_PARAM}=${month}`;
}
