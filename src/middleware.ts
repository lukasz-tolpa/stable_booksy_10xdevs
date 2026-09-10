import { defineMiddleware } from "astro:middleware";
import { BROKEN_SESSION_MESSAGE, OUTAGE_MESSAGE, SESSION_EXPIRED_MESSAGE } from "@/lib/auth/errors";
import {
  NEW_STABLE_ROUTE,
  SIGN_IN_ROUTE,
  homeRouteForRole,
  isLegacyHomeRoute,
  isStableSetupPath,
  routeGuardFor,
} from "@/lib/auth/roles";
import { currentUser, resolveRole, signOutUser } from "@/lib/auth/session";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase";
import type { UserRole } from "@/types";

function signInWithMessage(message: string): string {
  return `${SIGN_IN_ROUTE}?error=${encodeURIComponent(message)}`;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);
  context.locals.user = null;
  context.locals.profile = null;

  // Powód, dla którego zalogowany użytkownik jest traktowany jak anonim (wygasła sesja,
  // GoTrue nieosiągalny) albo bez roli mimo profilu (awaria bazy). Trafia do ?error=
  // tylko na trasach chronionych - strona główna nie ma go komu pokazać.
  let sessionProblem: string | null = null;
  // Rola potwierdzona przez resolveRole (wiersz profilu ma `role: string`, guard potrzebuje UserRole).
  let userRole: UserRole | null = null;

  if (supabase) {
    const session = await currentUser(supabase);

    if (session.kind === "user") {
      context.locals.user = session.user;

      // Profil dociągamy wyłącznie dla zalogowanych - bez tego warunku każde żądanie
      // anonimowe, łącznie ze stroną główną, płaciłoby za dodatkowe zapytanie do bazy.
      // Strony czytają z profilu `id` i `role`, więc bierzemy cały wiersz, a klasyfikację
      // (rola / brak roli / awaria) robi ten sam helper co przy logowaniu.
      const loaded = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      const role = await resolveRole(() => Promise.resolve(loaded), session.user.id);

      if (role.kind === "role") {
        context.locals.profile = loaded.data;
        userRole = role.role;
      } else if (role.kind === "outage") {
        logError("auth:session", role.error);
        sessionProblem = OUTAGE_MESSAGE;
      }
    } else if (session.kind !== "anonymous") {
      logError("auth:session", session.error);
      sessionProblem = session.kind === "outage" ? OUTAGE_MESSAGE : SESSION_EXPIRED_MESSAGE;
    }
  }

  // Cała wiedza o tym, która trasa wymaga której roli, siedzi w @/lib/auth/roles.
  // Middleware jej nie powiela - dopisanie trasy w kolejnym slice'ie to jeden wpis tam.
  const guard = routeGuardFor(context.url.pathname);

  if (guard) {
    if (!context.locals.user) {
      return context.redirect(sessionProblem ? signInWithMessage(sessionProblem) : SIGN_IN_ROUTE);
    }

    const role = userRole;

    if (!role) {
      // Awaria bazy przy odczycie profilu: sesja zostaje, użytkownik dostaje prawdziwą
      // przyczynę i może spróbować za chwilę. Nie wylogowujemy za chwilowy problem.
      if (sessionProblem) {
        return context.redirect(signInWithMessage(sessionProblem));
      }

      // Zalogowany bez profilu albo z rolą, której aplikacja nie zna: zamiast pokazywać
      // zepsuty widok, zamykamy sesję i odsyłamy do logowania z czytelnym komunikatem.
      if (supabase) {
        const signOut = await signOutUser(supabase);
        if (!signOut.ok) logError("auth:session", signOut.error);
      }
      return context.redirect(signInWithMessage(BROKEN_SESSION_MESSAGE));
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
