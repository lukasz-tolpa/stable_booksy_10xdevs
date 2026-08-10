import type { APIContext, APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { NEW_STABLE_ROUTE, ROLE_HOME, SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage, newStableSchema } from "@/lib/auth/schemas";
import { formValue } from "@/lib/form-data";

/** Kod naruszenia klucza unikalnego w Postgresie - tu wyłącznie `stables_owner_id_key`. */
const UNIQUE_VIOLATION = "23505";

function backToForm(context: APIContext, message: string) {
  return context.redirect(`${NEW_STABLE_ROUTE}?error=${encodeURIComponent(message)}`);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = newStableSchema.safeParse({
    name: formValue(form, "name"),
    city: formValue(form, "city"),
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

  // Zapis idzie klientem z sesją użytkownika, nie kluczem serwisowym: polityka
  // `stables_insert_own` z F-01 wymaga owner_id = auth.uid() ORAZ roli 'stable',
  // więc baza odrzuci każdą inną drogę - reguła nie zależy od tego kodu.
  const { error } = await supabase.from("stables").insert({
    owner_id: user.id,
    name: parsed.data.name,
    city: parsed.data.city,
  });

  if (error) {
    // Skutek podwójnego wysłania formularza (np. przyciskiem wstecz). Konto ma już
    // stadninę, więc zamiast surowego błędu bazy odsyłamy do panelu.
    if (error.code === UNIQUE_VIOLATION) {
      return context.redirect(ROLE_HOME.stable);
    }

    return backToForm(context, "Nie udało się zapisać stadniny. Spróbuj ponownie.");
  }

  return context.redirect(ROLE_HOME.stable);
};
