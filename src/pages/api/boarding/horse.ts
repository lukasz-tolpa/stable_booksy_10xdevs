import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { BOARDING_HORSE_FAILED, boardingHorseErrorMessage, isExpectedBoardingRefusal } from "@/lib/boarding/errors";
import { addBoardingHorse } from "@/lib/boarding/queries";
import { BOARDING_OUTCOME, STABLE_BOARDERS_ROUTE, backTo } from "@/lib/boarding/redirect";
import { boardingOwner } from "@/lib/boarding/requests";
import { boardingHorseSchema } from "@/lib/boarding/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";

export const prerender = false;

const SCOPE = "api:boarding/horse";

/**
 * „Dodaj konia pensjonatowego” (#114): imię, adres e-mail konta pensjonariusza i dzień przyjazdu.
 * Koń, jego właściciel i pierwszy pobyt powstają razem w `public.add_boarding_horse`; brak konta jeźdźca
 * pod adresem to odmowa SB040 z polskim komunikatem.
 */
export const POST: APIRoute = async (context) => {
  const back = (error: string) => backTo(context, STABLE_BOARDERS_ROUTE, { error });
  const form = await context.request.formData();

  const parsed = boardingHorseSchema.safeParse({
    name: formValue(form, "name"),
    email: formValue(form, "email"),
    arrival: formValue(form, "arrival"),
  });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const supabase = await boardingOwner(context, SCOPE, back);
  if (supabase instanceof Response) {
    return supabase;
  }

  const { horseId, error } = await addBoardingHorse(supabase, parsed.data);
  if (error) {
    const code = errorCode(error);
    if (!isExpectedBoardingRefusal(code)) {
      logError(SCOPE, error);
    }
    return back(boardingHorseErrorMessage(code));
  }
  if (horseId === null) {
    logError(SCOPE, new Error("add_boarding_horse nie zwrocil konia"));
    return back(BOARDING_HORSE_FAILED);
  }

  return backTo(context, STABLE_BOARDERS_ROUTE, { outcome: BOARDING_OUTCOME.horse });
};
