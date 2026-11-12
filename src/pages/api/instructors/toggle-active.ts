import type { APIContext, APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { formValue } from "@/lib/form-data";
import { toggleInstructorSchema } from "@/lib/instructors/schemas";
import { logError } from "@/lib/log";
import { getOwnedStableId } from "@/lib/stables/queries";
import { createClient } from "@/lib/supabase";

const INSTRUCTORS_ROUTE = "/osrodek/instruktorzy";

function backToList(context: APIContext, message?: string) {
  return context.redirect(message ? `${INSTRUCTORS_ROUTE}?error=${encodeURIComponent(message)}` : INSTRUCTORS_ROUTE);
}

/**
 * Dezaktywacja i ponowna aktywacja instruktora. Dezaktywacja nigdy nie jest odmawiana
 * i nie rusza dni już ułożonych (ADR-0002) — to sama flaga.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = toggleInstructorSchema.safeParse({
    instructorId: formValue(form, "instructorId"),
    active: formValue(form, "active"),
  });

  if (!parsed.success) {
    return backToList(context, "Nieprawidłowe dane formularza");
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

  const stableId = await getOwnedStableId(supabase, user.id);
  if (stableId === null) {
    return backToList(context, "Twoje konto nie ma jeszcze stadniny");
  }

  // Jawny warunek po stadninie obok polityki `instructors_update_own_stable`.
  // `.select().maybeSingle()`: UPDATE odfiltrowany przez RLS kończy się bez błędu i z zerem
  // wierszy — bez odczytu wyglądałby jak sukces. Cudzy i nieistniejący instruktor dostają
  // jeden komunikat, bez wyroczni istnienia.
  const { data, error } = await supabase
    .from("instructors")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.instructorId)
    .eq("stable_id", stableId)
    .select("id")
    .maybeSingle();

  if (error) {
    logError("api:instructors/toggle-active", error);
    return backToList(context, "Nie udało się zmienić stanu instruktora. Spróbuj ponownie.");
  }

  if (data === null) {
    return backToList(context, "Nie znaleziono instruktora w Twojej stadninie.");
  }

  return backToList(context);
};
