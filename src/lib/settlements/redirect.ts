import type { APIContext } from "astro";
import { OWNER_SETTLEMENTS_ROUTE } from "@/lib/auth/roles";
import { MONTH_PARAM, monthSearch, resolveSummaryMonth } from "@/lib/month-summary/month";
import { todayIso } from "@/lib/schedule/dates";

/** Adres strony „Rozliczenia” dla miesiąca `RRRR-MM`. */
export function settlementsHref(month: string): string {
  return `${OWNER_SETTLEMENTS_ROUTE}${monthSearch(month)}`;
}

/**
 * Miesiąc strony, na którą wraca formularz (ukryte pole `miesiac`) — przez `resolveSummaryMonth`,
 * więc brak, błąd i przyszłość dają bieżący miesiąc, a do adresu nie trafi nic spoza `RRRR-MM`.
 */
export function returnMonth(form: FormData, now: Date = new Date()): string {
  const raw = form.get(MONTH_PARAM);
  return resolveSummaryMonth(typeof raw === "string" ? raw : null, todayIso(now)).month;
}

/** Powrót na „Rozliczenia” tego samego miesiąca: `?error=` z komunikatem albo `?sukces=1`. */
export function backToSettlements(context: APIContext, month: string, error?: string) {
  const outcome = error ? `error=${encodeURIComponent(error)}` : "sukces=1";
  return context.redirect(`${settlementsHref(month)}&${outcome}`);
}
