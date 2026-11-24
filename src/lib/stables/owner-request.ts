import type { APIContext } from "astro";
import { OUTAGE_MESSAGE } from "@/lib/auth/errors";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { asSessionClient, currentUser } from "@/lib/auth/session";
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
 * Decydujący o zapisie oczekującym (#126): właściciel ośrodka (każdy slot) albo instruktor z kontem (swój slot).
 * O którym zapisie kto decyduje, rozstrzyga funkcja bazy z sesji (`private.decides_on_slot`, odmowa SB066), więc
 * brama nie szuka ośrodka — wystarczy zalogowane konto.
 */
export interface BookingDecider {
  supabase: Client;
}

/** Kto może przejść przez bramę endpointu ośrodka — i co endpoint wtedy dostaje. */
interface StableCallers {
  owner: StableOwner;
  "booking-decider": BookingDecider;
}

type Resolved<T> =
  | { kind: "caller"; caller: T }
  | { kind: "no-stable" }
  | { kind: "signed-out" }
  | { kind: "outage"; error: unknown };

/** Jedna reguła na każdego wołającego: z klienta z sesją — wołający albo powód, dla którego go nie ma. */
const RESOLVERS: { [K in keyof StableCallers]: (supabase: Client) => Promise<Resolved<StableCallers[K]>> } = {
  owner: async (supabase) => {
    const owner = await resolveOwner(asSessionClient(supabase), (userId) => getOwnedStableId(supabase, userId));
    return owner.kind === "owner" ? { kind: "caller", caller: { supabase, stableId: owner.stableId } } : owner;
  },
  "booking-decider": async (supabase) => {
    const session = await currentUser(asSessionClient(supabase));
    switch (session.kind) {
      case "user":
        return { kind: "caller", caller: { supabase } };
      case "anonymous":
      case "expired":
        return { kind: "signed-out" };
      case "outage":
        return { kind: "outage", error: session.error };
    }
  },
};

/**
 * Wspólny początek każdego endpointu ośrodka (po walidacji formularza): klient z sesją i wołający, którego endpoint
 * wpuszcza (`caller`: właściciel z ośrodkiem albo decydujący o zapisie) — albo gotowa odpowiedź. Ośrodek bierzemy
 * z sesji, nigdy z formularza; baza i tak sprawdza go jeszcze raz (RLS, funkcje bazy). Brak sesji — logowanie;
 * awarię sesji albo odczytu ośrodka logujemy pod `scope` i zamieniamy na polski komunikat, nie na 500. `back` to
 * powrót na stronę formularza z komunikatem.
 */
export async function stableRequest<K extends keyof StableCallers>(
  context: APIContext,
  scope: string,
  back: (error: string) => Response,
  caller: K,
): Promise<StableCallers[K] | Response> {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return back(SUPABASE_NOT_CONFIGURED);
  }

  const resolved = await RESOLVERS[caller](supabase);
  switch (resolved.kind) {
    case "caller":
      return resolved.caller;
    case "signed-out":
      return context.redirect(SIGN_IN_ROUTE);
    case "no-stable":
      return back(OWNER_NO_STABLE);
    case "outage":
      logError(scope, resolved.error);
      return back(OUTAGE_MESSAGE);
  }
}

/** Brama endpointów właściciela (instruktorzy, place, rozliczenia, pensjonariusze) — `stableRequest(…, "owner")`. */
export function ownerRequest(
  context: APIContext,
  scope: string,
  back: (error: string) => Response,
): Promise<StableOwner | Response> {
  return stableRequest(context, scope, back, "owner");
}
