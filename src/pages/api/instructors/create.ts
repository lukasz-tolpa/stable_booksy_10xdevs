import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { INSTRUCTOR_NAME_TAKEN, instructorErrorMessage } from "@/lib/instructors/errors";
import { ownerRequest } from "@/lib/stables/owner-request";
import { backToInstructors } from "@/lib/instructors/redirect";
import { newInstructorSchema } from "@/lib/instructors/schemas";
import { logError } from "@/lib/log";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = newInstructorSchema.safeParse({ name: formValue(form, "name") });

  if (!parsed.success) {
    return backToInstructors(context, firstErrorMessage(parsed.error));
  }

  // Stadnina z sesji, nigdy z formularza; polityka `instructors_insert_own_stable` i tak
  // odrzuciłaby cudzą.
  const owner = await ownerRequest(context, "api:instructors/create", (error) => backToInstructors(context, error));
  if (owner instanceof Response) {
    return owner;
  }

  // Unikalności nazwy nie sprawdzamy zapytaniem przed INSERT-em: strzeże jej indeks
  // `instructors_stable_name_key`, a odmowa wraca jako 23505.
  // `.select().single()`: sukces dopiero, gdy baza oddała wstawiony wiersz.
  const { error } = await owner.supabase
    .from("instructors")
    .insert({ stable_id: owner.stableId, name: parsed.data.name })
    .select("id")
    .single();

  if (error) {
    const code = errorCode(error);
    if (code !== INSTRUCTOR_NAME_TAKEN) {
      logError("api:instructors/create", error);
    }
    return backToInstructors(context, instructorErrorMessage(code));
  }

  return backToInstructors(context);
};
