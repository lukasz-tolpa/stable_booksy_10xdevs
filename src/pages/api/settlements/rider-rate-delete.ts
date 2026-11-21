import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { isExpectedRateRefusal, RATE_NOTHING_TO_DELETE, rateDeleteErrorMessage } from "@/lib/settlements/errors";
import { settlementOwner } from "@/lib/settlements/owner-request";
import { deleteRiderRate } from "@/lib/settlements/queries";
import { backToRiderSettlement, backToSettlements, returnMonth, RIDER_PARAM } from "@/lib/settlements/redirect";
import { parseRiderKey } from "@/lib/settlements/rider";
import { rateIdSchema } from "@/lib/settlements/schemas";
import { SETTLEMENT_TEXTS } from "@/lib/settlements/texts";

export const prerender = false;

const SCOPE = "api:settlements/rider-rate-delete";

/**
 * Usunięcie zaplanowanej zmiany stawki jeźdźca (#97) — tylko zmiany tego jeźdźca. Obowiązującej baza nie
 * usunie (SB027); cudza albo nieistniejąca zmiana to zero usuniętych wierszy. Powrót na rozliczenie
 * jeźdźca tego samego miesiąca; błędny jeździec — na listę.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const month = returnMonth(form);
  const riderKey = parseRiderKey(formValue(form, RIDER_PARAM));
  if (riderKey === null) {
    return backToSettlements(context, month, SETTLEMENT_TEXTS.riderRate.unknownRider);
  }
  const back = (error?: string) => backToRiderSettlement(context, riderKey, month, error);

  const parsed = rateIdSchema.safeParse({ rateId: formValue(form, "rateId") });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const owner = await settlementOwner(context, SCOPE, back);
  if (owner instanceof Response) {
    return owner;
  }

  const { data, error } = await deleteRiderRate(owner.supabase, owner.stableId, riderKey, parsed.data.rateId);

  if (error) {
    const code = errorCode(error);
    if (!isExpectedRateRefusal(code)) {
      logError(SCOPE, error);
    }
    return back(rateDeleteErrorMessage(code));
  }
  if (data.length === 0) {
    return back(RATE_NOTHING_TO_DELETE);
  }

  return back();
};
