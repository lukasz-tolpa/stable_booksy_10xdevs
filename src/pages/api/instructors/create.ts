import type { APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { INSTRUCTOR_NAME_TAKEN, INSTRUCTOR_NO_STABLE, instructorErrorMessage } from "@/lib/instructors/errors";
import { backToInstructors } from "@/lib/instructors/redirect";
import { newInstructorSchema } from "@/lib/instructors/schemas";
import { logError } from "@/lib/log";
import { getOwnedStableId } from "@/lib/stables/queries";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = newInstructorSchema.safeParse({ name: formValue(form, "name") });

  if (!parsed.success) {
    return backToInstructors(context, firstErrorMessage(parsed.error));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToInstructors(context, "Supabase nie jest skonfigurowany");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(SIGN_IN_ROUTE);
  }

  // Stadnina z sesji, nigdy z formularza; polityka `instructors_insert_own_stable` i tak
  // odrzuciłaby cudzą.
  const stableId = await getOwnedStableId(supabase, user.id);
  if (stableId === null) {
    return backToInstructors(context, INSTRUCTOR_NO_STABLE);
  }

  // Unikalności nazwy nie sprawdzamy zapytaniem przed INSERT-em: strzeże jej indeks
  // `instructors_stable_name_key`, a odmowa wraca jako 23505.
  // `.select().single()`: sukces dopiero, gdy baza oddała wstawiony wiersz.
  const { error } = await supabase
    .from("instructors")
    .insert({ stable_id: stableId, name: parsed.data.name })
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
