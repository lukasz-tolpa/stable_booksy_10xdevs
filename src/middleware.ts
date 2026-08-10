import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  context.locals.user = null;
  context.locals.profile = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;

    // Profil dociągamy wyłącznie dla zalogowanych - bez tego warunku każde żądanie
    // anonimowe, łącznie ze stroną główną, płaciłoby za dodatkowe zapytanie do bazy.
    if (user) {
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      context.locals.profile = profile;
    }
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
