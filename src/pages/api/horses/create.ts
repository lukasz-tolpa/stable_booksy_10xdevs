import type { APIContext, APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { formValue } from "@/lib/form-data";
import { getOwnedStableId } from "@/lib/stables/queries";
import { newHorseSchema } from "@/lib/stables/schemas";
import { createClient } from "@/lib/supabase";

const HORSES_ROUTE = "/osrodek/konie";

function backToList(context: APIContext, message?: string) {
  return context.redirect(message ? `${HORSES_ROUTE}?error=${encodeURIComponent(message)}` : HORSES_ROUTE);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = newHorseSchema.safeParse({
    name: formValue(form, "name"),
    notes: formValue(form, "notes") || undefined,
  });

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

  // Stadnina brana z sesji, nigdy z formularza - inaczej ktoś mógłby dopisać konia
  // do cudzej stajni. Polityka `horses_insert_own_stable` i tak by to odrzuciła,
  // ale nie ma powodu wysyłać takiego zapytania.
  const stableId = await getOwnedStableId(supabase, user.id);
  if (stableId === null) {
    return backToList(context, "Twoje konto nie ma jeszcze stadniny");
  }

  const { error } = await supabase.from("horses").insert({
    stable_id: stableId,
    name: parsed.data.name,
    notes: parsed.data.notes ?? null,
  });

  if (error) {
    return backToList(context, "Nie udało się dodać konia. Spróbuj ponownie.");
  }

  return backToList(context);
};
