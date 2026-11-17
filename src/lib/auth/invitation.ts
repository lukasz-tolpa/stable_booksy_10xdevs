import { INVITATION_TOKEN_PATTERN } from "@/lib/auth/constants";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";

/**
 * Rejestracja z linku zaproszenia (#75): co strona rejestracji pokazuje dla tokenu z adresu.
 *
 * Stan zaproszenia podaje baza (`public.invitation_by_token`, dostępna anonimowo): nazwa
 * ośrodka, adres i stan. Żywe zaproszenie otwiera formularz w trybie zaproszenia; każdy inny
 * stan (i nieznany token) to jasny powód z prośbą o nowy link od właściciela. Zdania są
 * zamkniętym zbiorem — kod stanu ani tekst bazy nie trafiają do interfejsu.
 */

/** Wiersz `invitation_by_token` — `null`, gdy baza nie zna tokenu. */
export interface InvitationRow {
  stable_name: string;
  email: string;
  state: string;
}

export type SignupInvitation =
  | { kind: "open"; token: string; stableName: string; email: string }
  | { kind: "refused"; heading: string; message: string; href: string; linkText: string };

export const INVITATION_REFUSED_HEADING = "Link zaproszenia nie działa";

const ASK_OWNER = "Poproś właściciela ośrodka o nowy link.";

const INVALID = `Ten link zaproszenia jest nieprawidłowy — sprawdź, czy skopiowano go w całości. ${ASK_OWNER}`;

const REFUSALS: Record<string, string> = {
  expired: `Ten link zaproszenia wygasł — zaproszenie jest ważne 7 dni. ${ASK_OWNER}`,
  revoked: `Ten link zaproszenia został wycofany albo zastąpiony nowszym. ${ASK_OWNER}`,
  accepted:
    "Ten link zaproszenia został już wykorzystany. Jeśli to Twoje konto, zaloguj się; jeśli nie, poproś właściciela ośrodka o nowy link.",
  inactive: `Instruktor z tego zaproszenia jest nieaktywny w ośrodku. ${ASK_OWNER}`,
  has_account:
    "Instruktor z tego zaproszenia ma już konto. Jeśli to Ty, zaloguj się; jeśli nie, poproś właściciela ośrodka o nowy link.",
};

/** Stany, po których ktoś ma już konto — karta prowadzi do logowania zamiast na stronę główną. */
const SIGN_IN_STATES: ReadonlySet<string> = new Set(["accepted", "has_account"]);

/** Czy wartość parametru `zaproszenie` ma postać tokenu z linku (przed zapytaniem do bazy). */
export function isInvitationToken(value: string | null | undefined): value is string {
  return typeof value === "string" && INVITATION_TOKEN_PATTERN.test(value);
}

/** Widok rejestracji dla tokenu: formularz zaproszenia albo powód, dla którego link nie działa. */
export function signupInvitation(token: string, invitation: InvitationRow | null): SignupInvitation {
  if (invitation?.state === "live") {
    return { kind: "open", token, stableName: invitation.stable_name, email: invitation.email };
  }
  const state = invitation?.state;
  const message = (state === undefined ? undefined : REFUSALS[state]) ?? INVALID;
  const signIn = state !== undefined && SIGN_IN_STATES.has(state);
  return {
    kind: "refused",
    heading: INVITATION_REFUSED_HEADING,
    message,
    href: signIn ? SIGN_IN_ROUTE : "/",
    linkText: signIn ? "Przejdź do logowania" : "Wróć na stronę główną",
  };
}
