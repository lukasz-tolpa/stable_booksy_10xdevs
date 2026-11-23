import type { APIContext } from "astro";
import { OUTAGE_MESSAGE } from "@/lib/auth/errors";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { asSessionClient } from "@/lib/auth/session";
import { resolveOwner } from "@/lib/instructors/owner";
import { logError } from "@/lib/log";
import { getOwnedStableId } from "@/lib/stables/queries";
import { SUPABASE_NOT_CONFIGURED, createClient } from "@/lib/supabase";

type Client = NonNullable<ReturnType<typeof createClient>>;

/** Konto ośrodka bez ośrodka — middleware go nie wpuszcza, więc to tylko obrona endpointu. */
export const OWNER_NO_STABLE = "Twoje konto nie ma jeszcze ośrodka.";

/** Właściciel wołający endpoint ośrodka: klient z jego sesją i jego ośrodek. */
export interface StableOwner {
  supabase: Client;
  stableId: number;
}

/**
 * Wspólny początek każdego endpointu właściciela (instruktorzy, place, rozliczenia, pensjonariusze — po
 * walidacji formularza): klient, sesja i ośrodek właściciela — albo gotowa odpowiedź. Ośrodek bierzemy z sesji,
 * nigdy z formularza; baza i tak sprawdza go jeszcze raz (RLS, funkcje bazy). Brak sesji — logowanie; awarię
 * sesji albo odczytu ośrodka logujemy pod `scope` i zamieniamy na polski komunikat, nie na 500. `back` to powrót
 * na stronę formularza z komunikatem.
 */
export async function ownerRequest(
  context: APIContext,
  scope: string,
  back: (error: string) => Response,
): Promise<StableOwner | Response> {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return back(SUPABASE_NOT_CONFIGURED);
  }

  const owner = await resolveOwner(asSessionClient(supabase), (userId) => getOwnedStableId(supabase, userId));

  switch (owner.kind) {
    case "owner":
      return { supabase, stableId: owner.stableId };
    case "signed-out":
      return context.redirect(SIGN_IN_ROUTE);
    case "no-stable":
      return back(OWNER_NO_STABLE);
    case "outage":
      logError(scope, owner.error);
      return back(OUTAGE_MESSAGE);
  }
}
