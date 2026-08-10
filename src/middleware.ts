import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";
import {
  NEW_STABLE_ROUTE,
  SIGN_IN_ROUTE,
  homeRouteForRole,
  isLegacyHomeRoute,
  isStableSetupPath,
  isUserRole,
  routeGuardFor,
} from "@/lib/auth/roles";

const BROKEN_SESSION_MESSAGE = "Nie udało się ustalić rodzaju Twojego konta. Zaloguj się ponownie.";

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

  // Cała wiedza o tym, która trasa wymaga której roli, siedzi w @/lib/auth/roles.
  // Middleware jej nie powiela - dopisanie trasy w kolejnym slice'ie to jeden wpis tam.
  const guard = routeGuardFor(context.url.pathname);

  if (guard) {
    if (!context.locals.user) {
      return context.redirect(SIGN_IN_ROUTE);
    }

    const role = context.locals.profile?.role;

    // Zalogowany bez profilu albo z rolą, której aplikacja nie zna: zamiast pokazywać
    // zepsuty widok, zamykamy sesję i odsyłamy do logowania z czytelnym komunikatem.
    if (!isUserRole(role)) {
      await supabase?.auth.signOut();
      return context.redirect(`${SIGN_IN_ROUTE}?error=${encodeURIComponent(BROKEN_SESSION_MESSAGE)}`);
    }

    // Stary adres panelu nie ma własnej strony - przenosimy z niego do przestrzeni roli.
    // Reguła mieszka tutaj, a nie w pliku strony, bo cały routing według roli jest w
    // jednym miejscu (i bo `return Astro.redirect()` we frontmatterze wywala ESLinta).
    if (isLegacyHomeRoute(context.url.pathname)) {
      return context.redirect(homeRouteForRole(role));
    }

    if (guard.role && guard.role !== role) {
      return context.redirect(homeRouteForRole(role));
    }

    // Konto ośrodka bez stadniny nie może zrobić nic sensownego: bez wiersza w `stables`
    // funkcja private.current_stable_id() zwraca NULL, więc RLS odetnie mu grafik i konie.
    // Trzymamy je na ekranie zakładania - i odwrotnie, konto ze stadniną z niego zawracamy.
    if (role === "stable" && supabase) {
      const onSetupPath = isStableSetupPath(context.url.pathname);
      const { count } = await supabase
        .from("stables")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", context.locals.user.id);
      const hasStable = (count ?? 0) > 0;

      if (!hasStable && !onSetupPath) {
        return context.redirect(NEW_STABLE_ROUTE);
      }

      if (hasStable && onSetupPath) {
        return context.redirect(homeRouteForRole(role));
      }
    }
  }

  return next();
});
