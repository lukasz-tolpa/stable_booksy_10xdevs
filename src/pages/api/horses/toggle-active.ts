import type { APIContext, APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { formValue } from "@/lib/form-data";
import { getOwnedStableId } from "@/lib/stables/queries";
import { toggleHorseSchema } from "@/lib/stables/schemas";
import { createClient } from "@/lib/supabase";

const HORSES_ROUTE = "/osrodek/konie";

function backToList(context: APIContext, message?: string) {
  return context.redirect(message ? `${HORSES_ROUTE}?error=${encodeURIComponent(message)}` : HORSES_ROUTE);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = toggleHorseSchema.safeParse({
    horseId: formValue(form, "horseId"),
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

  // Jawny warunek po stadninie, mimo że polityka `horses_update_own_stable` i tak
  // odrzuciłaby cudzego konia - bez niego zapytanie wyglądałoby na szersze, niż jest.
  const { error } = await supabase
    .from("horses")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.horseId)
    .eq("stable_id", stableId);

  if (error) {
    return backToList(context, "Nie udało się zmienić stanu konia. Spróbuj ponownie.");
  }

  return backToList(context);
};
