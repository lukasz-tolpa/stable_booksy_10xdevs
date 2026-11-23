import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { STAY_FAILED, isExpectedBoardingRefusal, stayErrorMessage } from "@/lib/boarding/errors";
import { addHorseStay } from "@/lib/boarding/queries";
import { BOARDING_OUTCOME, STABLE_BOARDERS_ROUTE, backTo } from "@/lib/boarding/redirect";
import { ownerRequest } from "@/lib/stables/owner-request";
import { newStaySchema } from "@/lib/boarding/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";

export const prerender = false;

const SCOPE = "api:boarding/stay";

/** „Nowy pobyt” konia pensjonatowego, który wrócił do ośrodka (#114) — pobyty nie zachodzą na siebie (SB042). */
export const POST: APIRoute = async (context) => {
  const back = (error: string) => backTo(context, STABLE_BOARDERS_ROUTE, { error });
  const form = await context.request.formData();

  const parsed = newStaySchema.safeParse({ horseId: formValue(form, "horseId"), arrival: formValue(form, "arrival") });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const owner = await ownerRequest(context, SCOPE, back);
  if (owner instanceof Response) {
    return owner;
  }
  const { supabase } = owner;

  const { stayId, error } = await addHorseStay(supabase, parsed.data.horseId, parsed.data.arrival);
  if (error) {
    const code = errorCode(error);
    if (!isExpectedBoardingRefusal(code)) {
      logError(SCOPE, error);
    }
    return back(stayErrorMessage(code));
  }
  if (stayId === null) {
    logError(SCOPE, new Error("add_horse_stay nie zwrocil pobytu"));
    return back(STAY_FAILED);
  }

  return backTo(context, STABLE_BOARDERS_ROUTE, { outcome: BOARDING_OUTCOME.stay });
};
