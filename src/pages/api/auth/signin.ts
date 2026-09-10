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

  // Nigdy surowa treść błędu GoTrue: to angielski tekst, a przy awarii sieci `fetch failed`
  // albo `{}`. Kod błędu idzie przez zamknięty polski zbiór z @/lib/auth/errors. Wyjątek
  // rzucony przez klienta (auth-js oddaje dalej wszystko, co nie jest AuthError) to ta sama
  // ścieżka - zalogowany, nie niezalogowany 500.
  let signedIn: Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>;
  try {
    signedIn = await supabase.auth.signInWithPassword(parsed.data);
  } catch (thrown) {
    return backToForm(context, authFailureMessage("auth:signin", thrown, "signin"));
  }
  const { data, error } = signedIn;

  if (error) {
    return backToForm(context, authFailureMessage("auth:signin", error, "signin"));
  }

  // Rolę czytamy z profilu, a nie z metadanych tokenu - metadane użytkownik może
  // sam nadpisać przez API Auth, więc nie nadają się na podstawę decyzji o dostępie.
  const role = await resolveRole(profileRoleLoader(supabase), data.user.id);

  switch (role.kind) {
    case "outage":
      // Sesja jest już ustawiona i zostaje: chwilowa awaria bazy nie jest powodem,
      // żeby ją niszczyć ani obwiniać konto. Użytkownik ląduje na stronie głównej
      // (Topbar pokazuje, że jest zalogowany) z komunikatem w bannerze; middleware
      // ustali rolę przy następnym wejściu do panelu.
      logError("auth:signin", role.error);
      return context.redirect(`/?error=${encodeURIComponent(OUTAGE_MESSAGE)}`);
    case "no-role": {
      const signOut = await signOutUser(supabase);
      if (!signOut.ok) logError("auth:signin", signOut.error);
      return backToForm(context, BROKEN_ACCOUNT_MESSAGE);
    }
    case "role":
      return context.redirect(homeRouteForRole(role.role));
  }
};
