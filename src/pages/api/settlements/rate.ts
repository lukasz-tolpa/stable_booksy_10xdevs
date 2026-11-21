import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { todayIso } from "@/lib/schedule/dates";
import { isExpectedRateRefusal, RATE_SAVE_FAILED, rateSaveErrorMessage } from "@/lib/settlements/errors";
import { settlementOwner } from "@/lib/settlements/owner-request";
import { saveRate } from "@/lib/settlements/queries";
import { rateFromMonth } from "@/lib/settlements/rates";
import { backToSettlements, returnMonth } from "@/lib/settlements/redirect";
import { stableRateSchema } from "@/lib/settlements/schemas";

export const prerender = false;

const SCOPE = "api:settlements/rate";

/**
 * Stawka ośrodka (#94): właściciel ustawia ją „od tego” albo „od następnego miesiąca”; drugi zapis na
 * ten sam miesiąc nadpisuje kwotę. Miesiąc „od” liczy serwer z dzisiejszej daty (Europe/Warsaw), nie
 * z miesiąca oglądanej strony; regułę czasu i tak pilnuje baza (SB026). Powrót na tę samą stronę i miesiąc.
 */
export const POST: APIRoute = async (context) => {
  const now = new Date();
  const form = await context.request.formData();
  const month = returnMonth(form, now);
  const back = (error?: string) => backToSettlements(context, month, error);

  const parsed = stableRateSchema.safeParse({ amount: formValue(form, "amount"), from: formValue(form, "from") });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const owner = await settlementOwner(context, SCOPE, back);
  if (owner instanceof Response) {
    return owner;
  }

  const { data, error } = await saveRate(owner.supabase, {
    stableId: owner.stableId,
    riderId: null,
    fromMonth: rateFromMonth(parsed.data.from, todayIso(now).slice(0, 7)),
    amount: parsed.data.amount,
  });

  if (error) {
    const code = errorCode(error);
    if (!isExpectedRateRefusal(code)) {
      logError(SCOPE, error);
    }
    return back(rateSaveErrorMessage(code));
  }
  if (!data) {
    logError(SCOPE, new Error("Zapis stawki nie zwrócił wiersza"));
    return back(RATE_SAVE_FAILED);
  }

  return back();
};
