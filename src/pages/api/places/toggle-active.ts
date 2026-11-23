import type { APIRoute } from "astro";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { ownerRequest } from "@/lib/stables/owner-request";
import { logError } from "@/lib/log";
import { PLACE_FORM_INVALID, PLACE_NOT_FOUND, isExpectedPlaceRefusal, placeErrorMessage } from "@/lib/places/errors";
import { backToPlaces } from "@/lib/places/redirect";
import { togglePlaceSchema } from "@/lib/places/schemas";

export const prerender = false;

/**
 * Dezaktywacja i ponowna aktywacja placu (#113). Dezaktywacja nie rusza dni już ułożonych — nieaktywny
 * plac nie trafia tylko do nowego dnia (SB031 w `save_schedule_day`); ostatniego aktywnego placu baza
 * nie dezaktywuje (SB033).
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = togglePlaceSchema.safeParse({
    placeId: formValue(form, "placeId"),
    active: formValue(form, "active"),
  });
  if (!parsed.success) {
    return backToPlaces(context, PLACE_FORM_INVALID);
  }

  const owner = await ownerRequest(context, "api:places/toggle-active", (error) => backToPlaces(context, error));
  if (owner instanceof Response) {
    return owner;
  }

  const { data, error } = await owner.supabase
    .from("places")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.placeId)
    .eq("stable_id", owner.stableId)
    .select("id")
    .maybeSingle();

  if (error) {
    const code = errorCode(error);
    if (!isExpectedPlaceRefusal(code)) {
      logError("api:places/toggle-active", error);
    }
    return backToPlaces(context, placeErrorMessage(code, "toggle"));
  }

  if (data === null) {
    return backToPlaces(context, PLACE_NOT_FOUND);
  }

  return backToPlaces(context);
};
