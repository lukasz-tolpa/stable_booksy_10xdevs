import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { COST_NOT_FOUND, costSaveErrorMessage, isExpectedCostRefusal } from "@/lib/settlements/errors";
import { settlementOwner } from "@/lib/settlements/owner-request";
import { updateCost } from "@/lib/settlements/queries";
import { backToSettlements, costReturn, returnMonth } from "@/lib/settlements/redirect";
import { extraCostUpdateSchema } from "@/lib/settlements/schemas";
import { SETTLEMENT_TEXTS } from "@/lib/settlements/texts";

export const prerender = false;

const SCOPE = "api:settlements/cost-update";

/**
 * „Popraw” koszt dodatkowy (#96): nowa nazwa i kwota, także w minionym miesiącu. Cudzy albo usunięty
 * koszt to zero poprawionych wierszy. Powrót do rozliczenia jeźdźca tego samego miesiąca; formularz bez jeźdźca
 * (spreparowany) wraca na listę z błędem.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const month = returnMonth(form);
  const back = costReturn(context, form, month);
  if (back === null) {
    return backToSettlements(context, month, SETTLEMENT_TEXTS.riderRate.unknownRider);
  }

  const parsed = extraCostUpdateSchema.safeParse({
    costId: formValue(form, "costId"),
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

  const { data, error } = await updateCost(owner.supabase, owner.stableId, parsed.data.costId, {
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
    return back(COST_NOT_FOUND);
  }

  return back();
};
