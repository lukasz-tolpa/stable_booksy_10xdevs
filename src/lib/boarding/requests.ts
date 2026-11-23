import type { APIContext } from "astro";
import { OUTAGE_MESSAGE } from "@/lib/auth/errors";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { asSessionClient, currentUser } from "@/lib/auth/session";
import { logError } from "@/lib/log";
import { SUPABASE_NOT_CONFIGURED, createClient } from "@/lib/supabase";

type Client = NonNullable<ReturnType<typeof createClient>>;

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
