import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { BROKEN_SESSION_MESSAGE, OUTAGE_MESSAGE, SESSION_EXPIRED_MESSAGE } from "@/lib/auth/errors";
import {
  SIGN_IN_ROUTE,
  homeRouteForAccount,
  instructorRedirect,
  instructorStandingOf,
  isLegacyHomeRoute,
  routeGuardFor,
  type InstructorStanding,
} from "@/lib/auth/roles";
import { currentUser, resolveRole, signOutUser } from "@/lib/auth/session";
import { withSecurityHeaders } from "@/lib/http/security-headers";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase";
import type { UserRole } from "@/types";

function signInWithMessage(message: string): string {
  return `${SIGN_IN_ROUTE}?error=${encodeURIComponent(message)}`;
}

/** Strażnik sesji i tras: ustala użytkownika i rolę, przekierowuje z cudzej przestrzeni. */
async function guardSessionAndRoute(context: APIContext, next: MiddlewareNext): Promise<Response> {
  const supabase = createClient(context.request.headers, context.cookies);
  context.locals.user = null;
  context.locals.profile = null;
  context.locals.instructorStanding = null;

  // Powód, dla którego zalogowany użytkownik jest traktowany jak anonim (wygasła sesja,
  // GoTrue nieosiągalny) albo bez roli mimo profilu (awaria bazy). Trafia do ?error=
  // tylko na trasach chronionych - strona główna nie ma go komu pokazać.
  let sessionProblem: string | null = null;
  // Rola potwierdzona przez resolveRole (wiersz profilu ma `role: string`, guard potrzebuje UserRole).
  let userRole: UserRole | null = null;
  // Kim jest konto instruktora w ośrodku (właściciel / instruktor / bez ośrodka) - z danych w bazie,
  // nie z roli konta (ADR-0004). `null` dla jeźdźca i przy awarii odczytu.
  let standing: InstructorStanding | null = null;

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

      // Powiązanie konta z instruktorem i właściciel jego ośrodka. Na każdej trasie, nie tylko
      // chronionej: górny pasek pokazuje „Mój panel” i pigułkę roli według tego, kim konto jest.
      // Wiersz instruktora konto widzi zawsze (RLS: account_id), ośrodek - gdy instruktor aktywny.
      // `active` odróżnia instruktora zdezaktywowanego, który dostaje ekran nieaktywnego konta (#73).
      if (userRole === "instructor") {
        const link = await supabase
          .from("instructors")
          .select("active, stables(owner_id)")
          .eq("account_id", session.user.id)
          .maybeSingle();

        if (link.error) {
          logError("auth:session", link.error);
          sessionProblem = OUTAGE_MESSAGE;
        } else {
          standing = instructorStandingOf(
            // Wygenerowane typy obiecują ośrodek (FK not-null), ale RLS ukrywa go zdezaktywowanemu.
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            link.data ? { active: link.data.active, stableOwnerId: link.data.stables?.owner_id ?? null } : null,
            session.user.id,
          );
          context.locals.instructorStanding = standing;
        }
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
      return context.redirect(homeRouteForAccount(role, standing));
    }

    if (guard.role && guard.role !== role) {
      return context.redirect(homeRouteForAccount(role, standing));
    }

    // Konto instruktora: bez ośrodka - wyłącznie zakładanie ośrodka (bez powiązania z instruktorem
    // RLS odetnie mu wszystko); właściciel - przestrzeń ośrodka; instruktor, który nie jest
    // właścicielem - „Moje sloty”, także gdy wejdzie pod adres przestrzeni ośrodka (#72);
    // zdezaktywowany - ekran nieaktywnego konta z każdej trasy chronionej (#73).
    if (role === "instructor") {
      if (!standing) {
        return context.redirect(signInWithMessage(sessionProblem ?? OUTAGE_MESSAGE));
      }

      const target = instructorRedirect(context.url.pathname, standing);
      if (target) {
        return context.redirect(target);
      }
    }
  }

  return next();
}

// Każda odpowiedź strony (także przekierowania) wychodzi z nagłówkami bezpieczeństwa.
// Pliki statyczne nie przechodzą przez worker — dla nich te same nagłówki są w public/_headers.
export const onRequest = defineMiddleware(async (context, next) =>
  withSecurityHeaders(await guardSessionAndRoute(context, next)),
);
