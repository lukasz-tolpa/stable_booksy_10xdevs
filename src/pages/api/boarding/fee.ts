import type { APIContext, APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { BOARDING_FEE_FAILED, boardingFeeErrorMessage, isExpectedBoardingRefusal } from "@/lib/boarding/errors";
import { saveBoardingFee } from "@/lib/boarding/queries";
import { BOARDING_OUTCOME, STABLE_BOARDERS_ROUTE, backTo, horseAnchor } from "@/lib/boarding/redirect";
import { boardingFeeSchema } from "@/lib/boarding/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { currentMonth } from "@/lib/schedule/dates";
import { ownerRequest } from "@/lib/stables/owner-request";
import { rateFromMonth } from "@/lib/settlements/rates";

export const prerender = false;

const SCOPE = "api:boarding/fee";

/**
 * Opłata za pensjonat konia (#117), wzorem stawki ośrodka: właściciel ustawia ją przy koniu na stronie
 * „Pensjonariusze” „od tego” albo „od następnego miesiąca”; drugi zapis na ten sam miesiąc nadpisuje kwotę.
 * Miesiąc „od” liczy serwer z dzisiejszej daty (Europe/Warsaw); regułę czasu pilnuje baza (SB060), konia
 * spoza koni pensjonatowych ośrodka — klucz obcy (23503), cudzy ośrodek — RLS (42501). Ośrodek z sesji.
 * Powrót do konia na stronie „Pensjonariusze”.
 */
export const POST: APIRoute = async (context: APIContext) => {
  const now = new Date();
  const form = await context.request.formData();
  const back = (error: string) => backTo(context, STABLE_BOARDERS_ROUTE, { error });

  const parsed = boardingFeeSchema.safeParse({
    horseId: formValue(form, "horseId"),
    amount: formValue(form, "amount"),
    from: formValue(form, "from"),
  });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const owner = await ownerRequest(context, SCOPE, back);
  if (owner instanceof Response) {
    return owner;
  }

  const { data, error } = await saveBoardingFee(owner.supabase, {
    stableId: owner.stableId,
    horseId: parsed.data.horseId,
    fromMonth: rateFromMonth(parsed.data.from, currentMonth(now)),
    amount: parsed.data.amount,
  });

  if (error) {
    const code = errorCode(error);
    if (!isExpectedBoardingRefusal(code)) {
      logError(SCOPE, error);
    }
    return back(boardingFeeErrorMessage(code));
  }
  if (!data) {
    logError(SCOPE, new Error("Zapis opłaty za pensjonat nie zwrócił wiersza"));
    return back(BOARDING_FEE_FAILED);
  }

  return backTo(context, STABLE_BOARDERS_ROUTE, { outcome: BOARDING_OUTCOME.fee }, horseAnchor(data.horse_id));
};
