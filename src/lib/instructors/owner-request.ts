import type { APIContext } from "astro";
import { OUTAGE_MESSAGE } from "@/lib/auth/errors";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { asSessionClient } from "@/lib/auth/session";
import { INSTRUCTOR_NO_STABLE } from "@/lib/instructors/errors";
import { resolveOwner } from "@/lib/instructors/owner";
import { backToInstructors } from "@/lib/instructors/redirect";
import { logError } from "@/lib/log";
import { getOwnedStableId } from "@/lib/stables/queries";
import { SUPABASE_NOT_CONFIGURED, createClient } from "@/lib/supabase";

type Client = NonNullable<ReturnType<typeof createClient>>;

/** Właściciel wołający endpoint instruktorów: klient z jego sesją i jego ośrodek. */
export interface OwnerRequest {
  supabase: Client;
  stableId: number;
}

/**
 * Wspólny początek endpointów strony Instruktorzy (po walidacji formularza): klient, sesja
 * i ośrodek właściciela — albo gotowa odpowiedź. Ośrodek bierzemy z sesji, nigdy z formularza;
 * baza i tak sprawdza go jeszcze raz (RLS, funkcje zaproszeń). Awarię sesji albo odczytu ośrodka
 * logujemy pod `scope` i zamieniamy na polski komunikat — nie na niezalogowany 500. `back` to powrót
 * na stronę formularza z komunikatem (domyślnie Instruktorzy; strona „Place” podaje swój, #113).
 */
export async function ownerRequest(
  context: APIContext,
  scope: string,
  back: (context: APIContext, error: string) => Response = backToInstructors,
): Promise<OwnerRequest | Response> {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return back(context, SUPABASE_NOT_CONFIGURED);
  }

  const owner = await resolveOwner(asSessionClient(supabase), (userId) => getOwnedStableId(supabase, userId));

  switch (owner.kind) {
    case "owner":
      return { supabase, stableId: owner.stableId };
    case "signed-out":
      return context.redirect(SIGN_IN_ROUTE);
    case "no-stable":
      return back(context, INSTRUCTOR_NO_STABLE);
    case "outage":
      logError(scope, owner.error);
      return back(context, OUTAGE_MESSAGE);
  }
}
