import type { APIContext, APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { DEPARTURE_FAILED, departureErrorMessage, isExpectedBoardingRefusal } from "@/lib/boarding/errors";
import { setStayDeparture } from "@/lib/boarding/queries";
import {
  BOARDING_OUTCOME,
  DEPARTURE_SIDE_FIELD,
  MY_HORSES_ROUTE,
  STABLE_BOARDERS_ROUTE,
  backTo,
} from "@/lib/boarding/redirect";
import { boardingOwner, boardingRider } from "@/lib/boarding/requests";
import { departureSchema } from "@/lib/boarding/schemas";
import { errorCode, errorDetails } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";

export const prerender = false;

const SCOPE = "api:boarding/departure";

const SIDES = { stable: STABLE_BOARDERS_ROUTE, rider: MY_HORSES_ROUTE } as const;

function sideOf(raw: string): keyof typeof SIDES {
  return raw === "rider" ? "rider" : "stable";
}

/**
 * Dzień wyjazdu pobytu (#114): „Zakończ pobyt” i „Popraw dzień wyjazdu” — u właściciela na stronie
 * „Pensjonariusze”, u pensjonariusza na „Moich koniach”. Kto ustawia (ośrodek czy pensjonariusz), bierze
 * `public.set_stay_departure` z sesji; pole `strona` wybiera tylko stronę powrotu. Granice dat (nie później
 * niż dziś, nie wcześniej niż przyjazd i ostatnia jazda konia) pilnuje baza.
 */
export const POST: APIRoute = async (context: APIContext) => {
  const form = await context.request.formData();
  const side = sideOf(formValue(form, DEPARTURE_SIDE_FIELD));
  const route = SIDES[side];
  const back = (error: string) => backTo(context, route, { error });

  const parsed = departureSchema.safeParse({
    stayId: formValue(form, "stayId"),
    departure: formValue(form, "departure"),
  });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const supabase = await (side === "stable" ? boardingOwner : boardingRider)(context, SCOPE, back);
  if (supabase instanceof Response) {
    return supabase;
  }

  const { stayId, error } = await setStayDeparture(supabase, parsed.data.stayId, parsed.data.departure);
  if (error) {
    const code = errorCode(error);
    if (!isExpectedBoardingRefusal(code)) {
      logError(SCOPE, error);
    }
    return back(departureErrorMessage(code, errorDetails(error)));
  }
  if (stayId === null) {
    logError(SCOPE, new Error("set_stay_departure nie zwrocil pobytu"));
    return back(DEPARTURE_FAILED);
  }

  return backTo(context, route, { outcome: BOARDING_OUTCOME.departure });
};
