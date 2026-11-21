import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { isExpectedRateRefusal, RATE_NOTHING_TO_DELETE, rateDeleteErrorMessage } from "@/lib/settlements/errors";
import { settlementOwner } from "@/lib/settlements/owner-request";
import { deleteRate } from "@/lib/settlements/queries";
import { backToSettlements, returnMonth } from "@/lib/settlements/redirect";
import { rateIdSchema } from "@/lib/settlements/schemas";

export const prerender = false;

const SCOPE = "api:settlements/rate-delete";

/**
 * Usunięcie zaplanowanej zmiany stawki (#94). Zmiany, która już obowiązuje, baza nie usunie (SB027);
 * cudza albo nieistniejąca zmiana to zero usuniętych wierszy. Powrót na tę samą stronę i miesiąc.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const month = returnMonth(form);
  const back = (error?: string) => backToSettlements(context, month, error);

  const parsed = rateIdSchema.safeParse({ rateId: formValue(form, "rateId") });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const owner = await settlementOwner(context, SCOPE, back);
  if (owner instanceof Response) {
    return owner;
  }

  const { data, error } = await deleteRate(owner.supabase, owner.stableId, parsed.data.rateId);

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
