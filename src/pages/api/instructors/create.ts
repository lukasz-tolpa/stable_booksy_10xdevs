import type { APIContext, APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { INSTRUCTOR_NAME_TAKEN, instructorErrorMessage } from "@/lib/instructors/errors";
import { newInstructorSchema } from "@/lib/instructors/schemas";
import { logError } from "@/lib/log";
import { getOwnedStableId } from "@/lib/stables/queries";
import { createClient } from "@/lib/supabase";

const INSTRUCTORS_ROUTE = "/osrodek/instruktorzy";

function backToList(context: APIContext, message?: string) {
  return context.redirect(message ? `${INSTRUCTORS_ROUTE}?error=${encodeURIComponent(message)}` : INSTRUCTORS_ROUTE);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = newInstructorSchema.safeParse({ name: formValue(form, "name") });

  if (!parsed.success) {
    return backToList(context, firstErrorMessage(parsed.error));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToList(context, "Supabase nie jest skonfigurowany");
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
    return backToList(context, "Twoje konto nie ma jeszcze stadniny");
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
    return backToList(context, instructorErrorMessage(code));
  }

  return backToList(context);
};
