import type { APIRoute } from "astro";
import { SIGN_OUT_FAILED_MESSAGE } from "@/lib/auth/errors";
import { signOutUser } from "@/lib/auth/session";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/");
  }

  // auth-js oddaje błąd PRZED usunięciem sesji (poza 401/403/404), więc po odmowie
  // ciasteczko żyje dalej. Nie udajemy wylogowania: użytkownik zostaje zalogowany
  // i widzi komunikat na stronie głównej, a przyczyna trafia do logu.
  const result = await signOutUser(supabase);
  if (!result.ok) {
    logError("auth:signout", result.error);
    return context.redirect(`/?error=${encodeURIComponent(SIGN_OUT_FAILED_MESSAGE)}`);
  }

  return context.redirect("/");
};
