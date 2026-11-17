import type { APIContext, APIRoute } from "astro";
import { OUTAGE_MESSAGE } from "@/lib/auth/errors";
import { NEW_STABLE_ROUTE, ROLE_HOME, SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage, newStableSchema } from "@/lib/auth/schemas";
import { asSessionClient, currentUser } from "@/lib/auth/session";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { SUPABASE_NOT_CONFIGURED, createClient } from "@/lib/supabase";

export const prerender = false;

/** Konto jest już instruktorem ośrodka (`create_stable`, także `stables_owner_id_key`). */
const UNIQUE_VIOLATION = "23505";

/** Zapis ośrodka nie powiódł się z przyczyny spoza reguł (awaria). */
const SAVE_FAILED = "Nie udało się zapisać stadniny. Spróbuj ponownie.";

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
    return backToForm(context, SUPABASE_NOT_CONFIGURED);
  }

  const session = await currentUser(asSessionClient(supabase));
  if (session.kind === "outage") {
    logError("api:stables/create", session.error);
    return backToForm(context, OUTAGE_MESSAGE);
  }
  if (session.kind !== "user") {
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
    return backToForm(context, SAVE_FAILED);
  }

  // Sukces dopiero, gdy baza oddała identyfikator założonego ośrodka.
  if (typeof data !== "number") {
    logError("api:stables/create", new Error("create_stable bez identyfikatora ośrodka"));
    return backToForm(context, SAVE_FAILED);
  }

  return context.redirect(ROLE_HOME.instructor);
};
