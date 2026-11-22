import type { APIContext } from "astro";
import { OWNER_SETTLEMENTS_ROUTE } from "@/lib/auth/roles";
import { MONTH_PARAM, monthSearch, resolveSummaryMonth } from "@/lib/month-summary/month";
import { todayIso } from "@/lib/schedule/dates";
import { parseRiderKey } from "@/lib/settlements/rider";

/** Adres strony „Rozliczenia” dla miesiąca `RRRR-MM`. */
export function settlementsHref(month: string): string {
  return `${OWNER_SETTLEMENTS_ROUTE}${monthSearch(month)}`;
}

/**
 * Adres rozliczenia jeźdźca (#95) dla miesiąca `RRRR-MM`: jeździec (konto) w ścieżce pod „Rozliczeniami”,
 * miesiąc w adresie jak na liście. `pdf` — adres PDF tego rozliczenia (spec #100) obok strony:
 * `/osrodek/rozliczenia/<jeździec>/pdf?miesiac=RRRR-MM`. Ochrona przestrzeni ośrodka obejmuje oba razem
 * z listą (`/osrodek`).
 */
export function riderSettlementHref(riderKey: string, month: string, { pdf = false } = {}): string {
  return `${OWNER_SETTLEMENTS_ROUTE}/${encodeURIComponent(riderKey)}${pdf ? "/pdf" : ""}${monthSearch(month)}`;
}

/**
 * Miesiąc strony, na którą wraca formularz (ukryte pole `miesiac`) — przez `resolveSummaryMonth`,
 * więc brak, błąd i przyszłość dają bieżący miesiąc, a do adresu nie trafi nic spoza `RRRR-MM`.
 */
export function returnMonth(form: FormData, now: Date = new Date()): string {
  const raw = form.get(MONTH_PARAM);
  return resolveSummaryMonth(typeof raw === "string" ? raw : null, todayIso(now)).month;
}

/** Powrót bez banera — strona sama pokazuje, co widać (np. adres PDF, gdy PDF nie jest dostępny, #102). */
export const NO_OUTCOME = Symbol("bez banera");

/**
 * Z czym strona wraca: komunikat błędu (`&error=`), brak — zapis się udał (`&sukces=1`), albo `NO_OUTCOME`.
 */
export type BackOutcome = string | typeof NO_OUTCOME | undefined;

/**
 * Powrót na stronę `href` (już z `?miesiac=`) z wynikiem `outcome`. Strony „Rozliczenia” i rozliczenia
 * jeźdźca czytają `error` i `sukces` tak samo (`Banner`).
 */
function backTo(context: APIContext, href: string, outcome: BackOutcome) {
  if (outcome === NO_OUTCOME) {
    return context.redirect(href);
  }
  return context.redirect(`${href}&${outcome ? `error=${encodeURIComponent(outcome)}` : "sukces=1"}`);
}

/** Powrót na „Rozliczenia” tego samego miesiąca. */
export function backToSettlements(context: APIContext, month: string, outcome?: BackOutcome) {
  return backTo(context, settlementsHref(month), outcome);
}

/** Ukryte pole formularzy rozliczenia jeźdźca z jego kontem (#97) — jak parametr ścieżki strony. */
export const RIDER_PARAM = "jezdziec";

/** Powrót na rozliczenie jeźdźca tego samego miesiąca. */
export function backToRiderSettlement(context: APIContext, riderKey: string, month: string, outcome?: BackOutcome) {
  return backTo(context, riderSettlementHref(riderKey, month), outcome);
}

/** Ukryte pole formularza kosztu: jeździec, do którego rozliczenia wraca formularz (#96). */
export const RETURN_RIDER_FIELD = "powrot";

/**
 * Powrót formularza kosztu dodatkowego: do rozliczenia jeźdźca z ukrytego pola `powrot` (konto,
 * sprawdzone przez `parseRiderKey`), a bez niego — na listę „Rozliczenia” tego samego miesiąca.
 */
export function costReturn(context: APIContext, form: FormData, month: string): (error?: string) => Response {
  const raw = form.get(RETURN_RIDER_FIELD);
  const riderKey = parseRiderKey(typeof raw === "string" ? raw : null);
  return (error) =>
    riderKey === null
      ? backToSettlements(context, month, error)
      : backToRiderSettlement(context, riderKey, month, error);
}
