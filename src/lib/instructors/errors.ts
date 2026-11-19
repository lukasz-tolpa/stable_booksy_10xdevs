/**
 * Tłumaczenie kodów błędu bazy na komunikaty dla ośrodka przy dodawaniu instruktora.
 *
 * Jedyną odmową osiągalną z formularza jest zajęta nazwa — pusta nazwa odpada wcześniej
 * w `newInstructorSchema`. Pozostałe kody (RLS, sieć) dostają wariant domyślny.
 */

/** Nazwa zajęta w ośrodku — indeks `instructors_stable_name_key` (także wśród nieaktywnych). */
export const INSTRUCTOR_NAME_TAKEN = "23505";

const FALLBACK = "Nie udało się dodać instruktora. Spróbuj ponownie.";

/** Konto ośrodka bez stadniny (każdy endpoint strony Instruktorzy). */
export const INSTRUCTOR_NO_STABLE = "Twoje konto nie ma jeszcze stadniny";
/** Formularz z ukrytymi polami (przełączenie stanu, wycofanie zaproszenia) z nieczytelnym polem. */
export const INSTRUCTOR_FORM_INVALID = "Nieprawidłowe dane formularza";
/**
 * Pole adresu w formularzu zaproszenia — `inviteInstructorSchema` i `InviteForm` (bez JavaScriptu
 * i z nim ośrodek widzi to samo zdanie); także odmowa 23514 z bazy.
 */
export const INVITE_EMAIL_MESSAGE = "Podaj poprawny adres e-mail instruktora";
/** Cudzy albo nieistniejący instruktor — jeden komunikat, bez wyroczni istnienia. */
export const INSTRUCTOR_NOT_FOUND = "Nie znaleziono instruktora w Twojej stadninie.";
/** Przełączenie stanu nie powiodło się z przyczyny spoza reguł (awaria). */
export const INSTRUCTOR_TOGGLE_FAILED = "Nie udało się zmienić stanu instruktora. Spróbuj ponownie.";

/** Dezaktywacja instruktora właściciela — wyzwalacz `instructors_owner_stays_active` (#71). */
export const INSTRUCTOR_OWNER_STAYS_ACTIVE = "SB012";

/**
 * Odmowa przełączenia stanu instruktora. Strona nie pokazuje właścicielowi przełącznika,
 * więc SB012 dociera tu tylko ze starej strony albo spreparowanego formularza.
 */
export function instructorToggleErrorMessage(code: string | undefined): string {
  return code === INSTRUCTOR_OWNER_STAYS_ACTIVE
    ? "Właściciela ośrodka nie można dezaktywować."
    : INSTRUCTOR_TOGGLE_FAILED;
}

export function instructorErrorMessage(code: string | undefined): string {
  switch (code) {
    case INSTRUCTOR_NAME_TAKEN:
      return "Masz już instruktora o tej nazwie (wielkość liter nie ma znaczenia), być może wśród nieaktywnych. Nadaj inną nazwę albo aktywuj go ponownie.";
    default:
      return FALLBACK;
  }
}

/** Cudzy albo nieistniejący instruktor przy zaproszeniu — `owned_instructor_for_invitation` (#74). */
export const INVITATION_INSTRUCTOR_NOT_FOUND = "SB013";

/**
 * Odmowy wystawienia zaproszenia (`public.issue_instructor_invitation`, #74). Strona pokazuje
 * „Zaproś” tylko przy aktywnym instruktorze bez konta, więc SB014 i SB015 docierają tu ze
 * starej strony albo spreparowanego formularza; 23514 (adres) zwykle odpada już w schemacie.
 */
const INVITATION_REFUSALS = new Map<string, string>([
  [INVITATION_INSTRUCTOR_NOT_FOUND, INSTRUCTOR_NOT_FOUND],
  ["SB014", "Nie można zaprosić nieaktywnego instruktora. Najpierw go aktywuj."],
  ["SB015", "Ten instruktor ma już konto."],
  ["23514", INVITE_EMAIL_MESSAGE],
]);

/** Wystawienie zaproszenia nie powiodło się z przyczyny spoza reguł (awaria). */
export const INVITATION_FAILED = "Nie udało się utworzyć zaproszenia. Spróbuj ponownie.";
/** Wycofanie zaproszenia nie powiodło się z przyczyny spoza reguł (awaria). */
export const INVITATION_REVOKE_FAILED = "Nie udało się wycofać zaproszenia. Spróbuj ponownie.";
/** Wycofanie, gdy instruktor nie ma żywego zaproszenia (wygasło albo wycofano je wcześniej). */
export const INVITATION_NOTHING_TO_REVOKE = "Ten instruktor nie ma zaproszenia do wycofania.";

export function invitationErrorMessage(code: string | undefined): string {
  return (code === undefined ? undefined : INVITATION_REFUSALS.get(code)) ?? INVITATION_FAILED;
}

/** Odmowa wynikająca z reguł zaproszeń, nie awaria — endpoint jej nie loguje. */
export function isExpectedInvitationRefusal(code: string | undefined): boolean {
  return code !== undefined && INVITATION_REFUSALS.has(code);
}

export function revokeInvitationErrorMessage(code: string | undefined): string {
  return code === INVITATION_INSTRUCTOR_NOT_FOUND ? INSTRUCTOR_NOT_FOUND : INVITATION_REVOKE_FAILED;
}
