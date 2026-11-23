import type { APIContext } from "astro";
import { OUTAGE_MESSAGE } from "@/lib/auth/errors";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { asSessionClient, currentUser } from "@/lib/auth/session";
import { logError } from "@/lib/log";
import { SUPABASE_NOT_CONFIGURED, createClient } from "@/lib/supabase";

type Client = NonNullable<ReturnType<typeof createClient>>;

/**
 * Wspólny początek przyjęcia i odrzucenia zapisu (po walidacji formularza): klient z sesją wołającego — albo
 * gotowa odpowiedź. Decydować może właściciel ośrodka (każdy slot) i instruktor z kontem (swój slot, #126);
 * kto decyduje o którym zapisie, rozstrzyga funkcja bazy z sesji (`private.decides_on_slot`, odmowa SB066), więc
 * endpoint nie szuka ośrodka sam. Brak sesji — logowanie; awarię sesji logujemy pod `scope` i zamieniamy na polski
 * komunikat, nie na 500. `back` to powrót na „Zapisy do przyjęcia” z komunikatem.
 */
export async function bookingDeciderRequest(
  context: APIContext,
  scope: string,
  back: (error: string) => Response,
): Promise<{ supabase: Client } | Response> {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return back(SUPABASE_NOT_CONFIGURED);
  }

  const session = await currentUser(asSessionClient(supabase));
  switch (session.kind) {
    case "user":
      return { supabase };
    case "anonymous":
    case "expired":
      return context.redirect(SIGN_IN_ROUTE);
    case "outage":
      logError(scope, session.error);
      return back(OUTAGE_MESSAGE);
  }
}
