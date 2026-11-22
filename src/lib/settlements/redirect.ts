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
 * miesiąc w adresie jak na liście. Ochrona przestrzeni ośrodka obejmuje go razem z listą (`/osrodek`).
 */
export function riderSettlementHref(riderKey: string, month: string): string {
  return `${OWNER_SETTLEMENTS_ROUTE}/${encodeURIComponent(riderKey)}${monthSearch(month)}`;
}

/**
 * Adres PDF rozliczenia jeźdźca (spec #100) dla miesiąca `RRRR-MM`: `/osrodek/rozliczenia/<jeździec>/pdf`,
 * obok strony jeźdźca, więc obejmuje go ta sama ochrona przestrzeni ośrodka.
 */
export function riderSettlementPdfHref(riderKey: string, month: string): string {
  return `${OWNER_SETTLEMENTS_ROUTE}/${encodeURIComponent(riderKey)}/pdf${monthSearch(month)}`;
}

/**
 * Miesiąc strony, na którą wraca formularz (ukryte pole `miesiac`) — przez `resolveSummaryMonth`,
 * więc brak, błąd i przyszłość dają bieżący miesiąc, a do adresu nie trafi nic spoza `RRRR-MM`.
 */
export function returnMonth(form: FormData, now: Date = new Date()): string {
  const raw = form.get(MONTH_PARAM);
  return resolveSummaryMonth(typeof raw === "string" ? raw : null, todayIso(now)).month;
}

/**
 * Powrót formularza na stronę `href` (już z `?miesiac=`): `&error=` z komunikatem albo `&sukces=1`.
 * Strony „Rozliczenia” i rozliczenia jeźdźca czytają oba parametry tak samo (`Banner`).
 */
function backTo(context: APIContext, href: string, error?: string) {
  const outcome = error ? `error=${encodeURIComponent(error)}` : "sukces=1";
  return context.redirect(`${href}&${outcome}`);
}

/** Powrót na „Rozliczenia” tego samego miesiąca. */
export function backToSettlements(context: APIContext, month: string, error?: string) {
  return backTo(context, settlementsHref(month), error);
}

/** Ukryte pole formularzy rozliczenia jeźdźca z jego kontem (#97) — jak parametr ścieżki strony. */
export const RIDER_PARAM = "jezdziec";

/** Powrót na rozliczenie jeźdźca tego samego miesiąca. */
export function backToRiderSettlement(context: APIContext, riderKey: string, month: string, error?: string) {
  return backTo(context, riderSettlementHref(riderKey, month), error);
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
