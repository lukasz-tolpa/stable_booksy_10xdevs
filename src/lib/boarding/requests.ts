import type { APIContext } from "astro";
import { OUTAGE_MESSAGE } from "@/lib/auth/errors";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { asSessionClient, currentUser } from "@/lib/auth/session";
import { BOARDING_NO_STABLE } from "@/lib/boarding/errors";
import { resolveOwner } from "@/lib/instructors/owner";
import { logError } from "@/lib/log";
import { getOwnedStableId } from "@/lib/stables/queries";
import { SUPABASE_NOT_CONFIGURED, createClient } from "@/lib/supabase";

type Client = NonNullable<ReturnType<typeof createClient>>;

/**
 * Wspólny początek endpointów koni pensjonatowych (po walidacji formularza): klient z sesją albo gotowa
 * odpowiedź (`back` z komunikatem, brak sesji — logowanie). Ośrodek i stronę bierze baza z sesji; jawne
 * sprawdzenie właściciela po stronie aplikacji tylko zawęża, kto w ogóle wysyła zapytanie.
 */
export async function boardingOwner(
  context: APIContext,
  scope: string,
  back: (error: string) => Response,
): Promise<Client | Response> {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return back(SUPABASE_NOT_CONFIGURED);
  }

  const owner = await resolveOwner(asSessionClient(supabase), (userId) => getOwnedStableId(supabase, userId));

  switch (owner.kind) {
    case "owner":
      return supabase;
    case "signed-out":
      return context.redirect(SIGN_IN_ROUTE);
    case "no-stable":
      return back(BOARDING_NO_STABLE);
    case "outage":
      logError(scope, owner.error);
      return back(OUTAGE_MESSAGE);
  }
}

/** Pensjonariusz: klient z sesją dowolnego zalogowanego konta — czy pobyt jest jego, sprawdza baza (SB041). */
export async function boardingRider(
  context: APIContext,
  scope: string,
  back: (error: string) => Response,
): Promise<Client | Response> {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return back(SUPABASE_NOT_CONFIGURED);
  }

  const session = await currentUser(asSessionClient(supabase));
  switch (session.kind) {
    case "user":
      return supabase;
    case "anonymous":
    case "expired":
      return context.redirect(SIGN_IN_ROUTE);
    case "outage":
      logError(scope, session.error);
      return back(OUTAGE_MESSAGE);
  }
}
