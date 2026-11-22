import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { COST_SAVE_FAILED, costSaveErrorMessage, isExpectedCostRefusal } from "@/lib/settlements/errors";
import { settlementOwner } from "@/lib/settlements/owner-request";
import { addCost } from "@/lib/settlements/queries";
import { backToSettlements, costReturn, returnMonth, RIDER_PARAM } from "@/lib/settlements/redirect";
import { extraCostSchema } from "@/lib/settlements/schemas";
import { SETTLEMENT_TEXTS } from "@/lib/settlements/texts";

export const prerender = false;

const SCOPE = "api:settlements/cost";

/**
 * „Dopisz koszt” w rozliczeniu jeźdźca (#96, #106): koszt dodatkowy jeźdźcowi ośrodka na oglądany miesiąc
 * (`miesiac`, bieżący albo miniony — regułę pilnuje też baza, SB029). Jeździec z pola `jezdziec`
 * (`RIDER_PARAM`); czy jest jeźdźcem ośrodka, sprawdza RLS. Powrót do rozliczenia jeźdźca (pole `powrot`);
 * formularz bez niego (spreparowany) wraca na listę z błędem, nic nie zapisując.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const month = returnMonth(form);
  const back = costReturn(context, form, month);
  if (back === null) {
    return backToSettlements(context, month, SETTLEMENT_TEXTS.riderRate.unknownRider);
  }

  const parsed = extraCostSchema.safeParse({
    rider: formValue(form, RIDER_PARAM),
    name: formValue(form, "name"),
    amount: formValue(form, "amount"),
  });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const owner = await settlementOwner(context, SCOPE, back);
  if (owner instanceof Response) {
    return owner;
  }

  const { data, error } = await addCost(owner.supabase, {
    stableId: owner.stableId,
    riderId: parsed.data.rider,
    month,
    name: parsed.data.name,
    amount: parsed.data.amount,
  });

  if (error) {
    const code = errorCode(error);
    if (!isExpectedCostRefusal(code)) {
      logError(SCOPE, error);
    }
    return back(costSaveErrorMessage(code));
  }
  if (!data) {
    logError(SCOPE, new Error("Zapis kosztu dodatkowego nie zwrócił wiersza"));
    return back(COST_SAVE_FAILED);
  }

  return back();
};
