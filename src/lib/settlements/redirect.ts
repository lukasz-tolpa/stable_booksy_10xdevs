import type { APIContext, APIRoute } from "astro";
import { OWNER_SETTLEMENTS_ROUTE } from "@/lib/auth/roles";
import { MONTH_PARAM, monthSearch, resolveSummaryMonth } from "@/lib/month-summary/month";
import { todayIso } from "@/lib/schedule/dates";
import { parseRiderKey } from "@/lib/settlements/rider";
import { SETTLEMENT_TEXTS } from "@/lib/settlements/texts";

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

/** Formularz kosztu dodatkowego po odczycie: pola, oglądany miesiąc i powrót do rozliczenia jeźdźca. */
export interface CostForm {
  form: FormData;
  /** Oglądany miesiąc `RRRR-MM` (`returnMonth`). */
  month: string;
  /** Powrót do rozliczenia jeźdźca z pola `powrot` w tym samym miesiącu: z błędem albo `sukces=1`. */
  back: (error?: string) => Response;
}

/**
 * Wspólny początek punktów końcowych kosztu dodatkowego (`cost`, `cost-update`, `cost-delete`): czyta
 * formularz i oglądany miesiąc, a powrót prowadzi zawsze do rozliczenia jeźdźca z ukrytego pola `powrot`
 * (konto, sprawdzone przez `parseRiderKey`) — koszt dopisuje się tylko tam (#106). Formularz bez jeźdźca
 * w `powrot` (spreparowany) nie ma dokąd wrócić: `handle` się nie wykonuje, nic się nie zapisuje, a odpowiedź
 * wraca na „Rozliczenia” tego miesiąca z `SETTLEMENT_TEXTS.formRefused`.
 */
export function costFormEndpoint(handle: (context: APIContext, cost: CostForm) => Promise<Response>): APIRoute {
  return async (context) => {
    const form = await context.request.formData();
    const month = returnMonth(form);
    const raw = form.get(RETURN_RIDER_FIELD);
    const riderKey = parseRiderKey(typeof raw === "string" ? raw : null);
    if (riderKey === null) {
      return backToSettlements(context, month, SETTLEMENT_TEXTS.formRefused);
    }
    return handle(context, { form, month, back: (error) => backToRiderSettlement(context, riderKey, month, error) });
  };
}
