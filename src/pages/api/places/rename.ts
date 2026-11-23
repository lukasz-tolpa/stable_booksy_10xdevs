import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { ownerRequest } from "@/lib/stables/owner-request";
import { logError } from "@/lib/log";
import { PLACE_NOT_FOUND, isExpectedPlaceRefusal, placeErrorMessage } from "@/lib/places/errors";
import { backToPlaces } from "@/lib/places/redirect";
import { renamePlaceSchema } from "@/lib/places/schemas";

export const prerender = false;

/** Zmiana nazwy placu (#113). Dni już ułożone pokazują plac pod nową nazwą — to ten sam plac. */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = renamePlaceSchema.safeParse({ placeId: formValue(form, "placeId"), name: formValue(form, "name") });
  if (!parsed.success) {
    return backToPlaces(context, firstErrorMessage(parsed.error));
  }

  const owner = await ownerRequest(context, "api:places/rename", (error) => backToPlaces(context, error));
  if (owner instanceof Response) {
    return owner;
  }

  // Jawny warunek po ośrodku obok polityki `places_update_own_stable`; `.select().maybeSingle()`,
  // bo UPDATE odfiltrowany przez RLS kończy się bez błędu i z zerem wierszy.
  const { data, error } = await owner.supabase
    .from("places")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.placeId)
    .eq("stable_id", owner.stableId)
    .select("id")
    .maybeSingle();

  if (error) {
    const code = errorCode(error);
    if (!isExpectedPlaceRefusal(code)) {
      logError("api:places/rename", error);
    }
    return backToPlaces(context, placeErrorMessage(code, "rename"));
  }

  if (data === null) {
    return backToPlaces(context, PLACE_NOT_FOUND);
  }

  return backToPlaces(context);
};
