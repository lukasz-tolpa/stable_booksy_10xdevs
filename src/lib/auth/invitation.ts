import { INVITATION_TOKEN_PATTERN } from "@/lib/auth/constants";
import {
  INVITATION_INVALID_MESSAGE,
  INVITATION_REFUSAL_MESSAGES,
  INVITATION_REFUSED_HEADING,
  type InvitationRefusal,
} from "@/lib/auth/errors";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";

/**
 * Rejestracja z linku zaproszenia (#75): co strona rejestracji pokazuje dla tokenu z adresu.
 *
 * Stan zaproszenia podaje baza (`public.invitation_by_token`, dostępna anonimowo): nazwa
 * ośrodka, adres i stan. Żywe zaproszenie otwiera formularz w trybie zaproszenia; każdy inny
 * stan (i nieznany token) to jasny powód z prośbą o nowy link od właściciela. Zdania są
 * zamkniętym zbiorem w `@/lib/auth/errors` — kod stanu ani tekst bazy nie trafiają do interfejsu.
 */

/** Stan zaproszenia: żywe albo jeden z powodów, dla których link nie działa. */
export type InvitationState = "live" | InvitationRefusal;

/** Wiersz `invitation_by_token` ze stanem, który aplikacja zna. */
export interface InvitationRow {
  stable_name: string;
  email: string;
  state: InvitationState;
}

export type SignupInvitation =
  | { kind: "open"; token: string; stableName: string; email: string }
  | { kind: "refused"; heading: string; message: string; href: string; linkText: string };

/** Powody, po których ktoś ma już konto — karta prowadzi do logowania zamiast na stronę główną. */
const SIGN_IN_REFUSALS: ReadonlySet<InvitationRefusal> = new Set<InvitationRefusal>(["accepted", "has_account"]);

function isInvitationState(value: string): value is InvitationState {
  return value === "live" || Object.hasOwn(INVITATION_REFUSAL_MESSAGES, value);
}

/**
 * Wiersz z bazy (stan to tekst) jako `InvitationRow`; brak wiersza albo stan, którego aplikacja
 * nie zna, daje `null` — strona traktuje to jak nieznany token.
 */
export function toInvitationRow(
  row: { stable_name: string; email: string; state: string } | null,
): InvitationRow | null {
  if (!row || !isInvitationState(row.state)) {
    return null;
  }
  return { stable_name: row.stable_name, email: row.email, state: row.state };
}

/** Czy wartość parametru `zaproszenie` ma postać tokenu z linku (przed zapytaniem do bazy). */
export function isInvitationToken(value: string | null | undefined): value is string {
  return typeof value === "string" && INVITATION_TOKEN_PATTERN.test(value);
}

/** Widok rejestracji dla tokenu: formularz zaproszenia albo powód, dla którego link nie działa. */
export function signupInvitation(token: string, invitation: InvitationRow | null): SignupInvitation {
  if (invitation?.state === "live") {
    return { kind: "open", token, stableName: invitation.stable_name, email: invitation.email };
  }
  const refusal = invitation?.state;
  const signIn = refusal !== undefined && SIGN_IN_REFUSALS.has(refusal);
  return {
    kind: "refused",
    heading: INVITATION_REFUSED_HEADING,
    message: refusal === undefined ? INVITATION_INVALID_MESSAGE : INVITATION_REFUSAL_MESSAGES[refusal],
    href: signIn ? SIGN_IN_ROUTE : "/",
    linkText: signIn ? "Przejdź do logowania" : "Wróć na stronę główną",
  };
}
