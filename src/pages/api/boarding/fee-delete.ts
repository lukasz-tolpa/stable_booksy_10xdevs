import type { APIContext, APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import {
  BOARDING_FEE_NOTHING_TO_DELETE,
  boardingFeeDeleteErrorMessage,
  isExpectedBoardingRefusal,
} from "@/lib/boarding/errors";
import { deleteBoardingFee } from "@/lib/boarding/queries";
import { BOARDING_OUTCOME, STABLE_BOARDERS_ROUTE, backTo, horseAnchor } from "@/lib/boarding/redirect";
import { boardingFeeIdSchema } from "@/lib/boarding/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { ownerRequest } from "@/lib/stables/owner-request";

export const prerender = false;

const SCOPE = "api:boarding/fee-delete";

/**
 * Usunięcie zaplanowanej zmiany opłaty za pensjonat (#117). Zmiany, która już obowiązuje, baza nie usunie
 * (SB061); cudza albo nieistniejąca zmiana to zero usuniętych wierszy. Powrót do konia na „Pensjonariuszach”.
 */
export const POST: APIRoute = async (context: APIContext) => {
  const form = await context.request.formData();
  const back = (error: string) => backTo(context, STABLE_BOARDERS_ROUTE, { error });

  const parsed = boardingFeeIdSchema.safeParse({ feeId: formValue(form, "feeId") });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const owner = await ownerRequest(context, SCOPE, back);
  if (owner instanceof Response) {
    return owner;
  }

  const { data, error } = await deleteBoardingFee(owner.supabase, owner.stableId, parsed.data.feeId);
  if (error) {
    const code = errorCode(error);
    if (!isExpectedBoardingRefusal(code)) {
      logError(SCOPE, error);
    }
    return back(boardingFeeDeleteErrorMessage(code));
  }
  const deleted = data.at(0);
  if (deleted === undefined) {
    return back(BOARDING_FEE_NOTHING_TO_DELETE);
  }

  return backTo(
    context,
    STABLE_BOARDERS_ROUTE,
    { outcome: BOARDING_OUTCOME.feeDeleted },
    horseAnchor(deleted.horse_id),
  );
};
