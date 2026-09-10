import type { APIContext, APIRoute } from "astro";
import { BROKEN_ACCOUNT_MESSAGE, OUTAGE_MESSAGE } from "@/lib/auth/errors";
import { homeRouteForRole } from "@/lib/auth/roles";
import { firstErrorMessage, signInSchema } from "@/lib/auth/schemas";
import { authFailureMessage, profileRoleLoader, resolveRole, signOutUser } from "@/lib/auth/session";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase";

function backToForm(context: APIContext, message: string) {
  return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = signInSchema.safeParse({
    email: formValue(form, "email"),
    password: formValue(form, "password"),
  });

  if (!parsed.success) {
    return backToForm(context, firstErrorMessage(parsed.error));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToForm(context, "Supabase nie jest skonfigurowany");
  }

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  // Nigdy surowa treść błędu GoTrue: to angielski tekst, a przy awarii sieci `fetch failed`
  // albo `{}`. Kod błędu idzie przez zamknięty polski zbiór z @/lib/auth/errors.
  if (error) {
    return backToForm(context, authFailureMessage("auth:signin", error, "signin"));
  }

  // Rolę czytamy z profilu, a nie z metadanych tokenu - metadane użytkownik może
  // sam nadpisać przez API Auth, więc nie nadają się na podstawę decyzji o dostępie.
  const role = await resolveRole(profileRoleLoader(supabase), data.user.id);

  switch (role.kind) {
    case "outage":
      // Sesja jest już ustawiona i zostaje: chwilowa awaria bazy nie jest powodem,
      // żeby ją niszczyć ani obwiniać konto. Middleware ustali rolę przy następnym żądaniu.
      logError("auth:signin", role.error);
      return backToForm(context, OUTAGE_MESSAGE);
    case "no-role": {
      const signOut = await signOutUser(supabase);
      if (!signOut.ok) logError("auth:signin", signOut.error);
      return backToForm(context, BROKEN_ACCOUNT_MESSAGE);
    }
    case "role":
      return context.redirect(homeRouteForRole(role.role));
  }
};
