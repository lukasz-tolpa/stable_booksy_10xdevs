import type { APIContext } from "astro";
import { OUTAGE_MESSAGE } from "@/lib/auth/errors";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { asSessionClient } from "@/lib/auth/session";
import { resolveOwner } from "@/lib/instructors/owner";
import { logError } from "@/lib/log";
import { SETTLEMENT_NO_STABLE } from "@/lib/settlements/errors";
import { getOwnedStableId } from "@/lib/stables/queries";
import { SUPABASE_NOT_CONFIGURED, createClient } from "@/lib/supabase";

type Client = NonNullable<ReturnType<typeof createClient>>;

/** Właściciel wołający endpoint rozliczeń: klient z jego sesją i jego ośrodek. */
export interface SettlementOwner {
  supabase: Client;
  stableId: number;
}

/**
 * Wspólny początek endpointów rozliczeń (po walidacji formularza): klient, sesja i ośrodek
 * właściciela — albo gotowa odpowiedź (`back` z komunikatem). Ośrodek zawsze z sesji, nigdy
 * z formularza; RLS i tak sprawdza go jeszcze raz. Awaria sesji albo odczytu ośrodka — log pod `scope`.
 */
export async function settlementOwner(
  context: APIContext,
  scope: string,
  back: (error: string) => Response,
): Promise<SettlementOwner | Response> {
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
      return back(SETTLEMENT_NO_STABLE);
    case "outage":
      logError(scope, owner.error);
      return back(OUTAGE_MESSAGE);
  }
}
