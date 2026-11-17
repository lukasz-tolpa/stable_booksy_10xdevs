import type { APIContext, APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { NEW_STABLE_ROUTE, ROLE_HOME, SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage, newStableSchema } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";

/** Konto jest już instruktorem ośrodka (`create_stable`, także `stables_owner_id_key`). */
const UNIQUE_VIOLATION = "23505";

function backToForm(context: APIContext, message: string) {
  return context.redirect(`${NEW_STABLE_ROUTE}?error=${encodeURIComponent(message)}`);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = newStableSchema.safeParse({
    name: formValue(form, "name"),
    city: formValue(form, "city"),
    instructorName: formValue(form, "instructorName"),
  });

  if (!parsed.success) {
    return backToForm(context, firstErrorMessage(parsed.error));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToForm(context, "Supabase nie jest skonfigurowany");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(SIGN_IN_ROUTE);
  }

  // Ośrodek i instruktor właściciel powstają razem w `public.create_stable` (jedna transakcja);
  // właściciela funkcja bierze z sesji i sama odrzuca konto inne niż instruktora (42501).
  const { data, error } = await supabase.rpc("create_stable", {
    p_name: parsed.data.name,
    p_city: parsed.data.city,
    p_instructor_name: parsed.data.instructorName,
  });

  if (error) {
    // Skutek podwójnego wysłania formularza (np. przyciskiem wstecz). Konto ma już
    // ośrodek, więc zamiast surowego błędu bazy odsyłamy do panelu.
    if (errorCode(error) === UNIQUE_VIOLATION) {
      return context.redirect(ROLE_HOME.instructor);
    }

    logError("api:stables/create", error);
    return backToForm(context, "Nie udało się zapisać stadniny. Spróbuj ponownie.");
  }

  // Sukces dopiero, gdy baza oddała identyfikator założonego ośrodka.
  if (typeof data !== "number") {
    logError("api:stables/create", new Error("create_stable bez identyfikatora ośrodka"));
    return backToForm(context, "Nie udało się zapisać stadniny. Spróbuj ponownie.");
  }

  return context.redirect(ROLE_HOME.instructor);
};
