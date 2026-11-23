import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { ownerRequest } from "@/lib/stables/owner-request";
import { logError } from "@/lib/log";
import { isExpectedPlaceRefusal, placeErrorMessage } from "@/lib/places/errors";
import { backToPlaces } from "@/lib/places/redirect";
import { newPlaceSchema } from "@/lib/places/schemas";

export const prerender = false;

/** Dodanie placu ośrodka (#113). Ośrodek z sesji, nigdy z formularza (`places_insert_own_stable`). */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = newPlaceSchema.safeParse({ name: formValue(form, "name") });
  if (!parsed.success) {
    return backToPlaces(context, firstErrorMessage(parsed.error));
  }

  const owner = await ownerRequest(context, "api:places/create", (error) => backToPlaces(context, error));
  if (owner instanceof Response) {
    return owner;
  }

  // Unikalności nazwy strzeże indeks `places_stable_name_key` (23505), nie zapytanie przed INSERT-em.
  // `.select().single()`: sukces dopiero, gdy baza oddała wstawiony wiersz.
  const { error } = await owner.supabase
    .from("places")
    .insert({ stable_id: owner.stableId, name: parsed.data.name })
    .select("id")
    .single();

  if (error) {
    const code = errorCode(error);
    if (!isExpectedPlaceRefusal(code)) {
      logError("api:places/create", error);
    }
    return backToPlaces(context, placeErrorMessage(code, "create"));
  }

  return backToPlaces(context);
};
