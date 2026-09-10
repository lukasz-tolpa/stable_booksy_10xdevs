/**
 * Tłumaczenie błędów GoTrue (Supabase Auth) na komunikaty dla użytkownika.
 *
 * Odpowiednik `bookingErrorMessage` / `scheduleErrorMessage` dla obszaru auth.
 * Mapujemy po `error.code` (auth-js >= 2.43 niesie kody z `error-codes.d.ts`),
 * nigdy po treści `error.message`, bo ta jest po angielsku i przy awarii sieci
 * brzmi `fetch failed` albo `{}`. Zbiór zdań jest zamknięty i pilnowany testem.
 */

import { errorCode } from "@/lib/db-errors";

export const INVALID_CREDENTIALS = "invalid_credentials";
export const EMAIL_NOT_CONFIRMED = "email_not_confirmed";
export const USER_ALREADY_EXISTS = "user_already_exists";
export const EMAIL_EXISTS = "email_exists";
export const WEAK_PASSWORD = "weak_password";
export const RATE_LIMITED = ["over_request_rate_limit", "over_email_send_rate_limit"] as const;
export const REQUEST_TIMEOUT = "request_timeout";

export type AuthAction = "signin" | "signup";

export const OUTAGE_MESSAGE = "Chwilowy problem z połączeniem. Spróbuj ponownie za chwilę.";
export const SIGN_OUT_FAILED_MESSAGE = "Nie udało się wylogować. Spróbuj ponownie.";
export const SESSION_EXPIRED_MESSAGE = "Sesja wygasła. Zaloguj się ponownie.";
export const SIGNUP_CONFIRM_MESSAGE = "Konto utworzone. Potwierdź adres e-mail z wiadomości, a potem zaloguj się.";
/** Sign-in: profil bez rozpoznawalnej roli - użytkownik nic z tym nie zrobi sam. */
export const BROKEN_ACCOUNT_MESSAGE = "Nie udało się ustalić rodzaju Twojego konta. Skontaktuj się z obsługą.";
/** Middleware: sesja jest, ale profil nie mówi kim jest użytkownik. */
export const BROKEN_SESSION_MESSAGE = "Nie udało się ustalić rodzaju Twojego konta. Zaloguj się ponownie.";

const FALLBACK: Record<AuthAction, string> = {
  signin: "Nie udało się zalogować. Spróbuj ponownie.",
  signup: "Nie udało się utworzyć konta. Spróbuj ponownie.",
};

const USER_ERROR_CODES: ReadonlySet<string> = new Set([
  INVALID_CREDENTIALS,
  EMAIL_NOT_CONFIRMED,
  USER_ALREADY_EXISTS,
  EMAIL_EXISTS,
  WEAK_PASSWORD,
  ...RATE_LIMITED,
]);

/** Komunikat dla użytkownika; nieznany kod daje wariant domyślny danej akcji. */
export function authErrorMessage(code: string | undefined, action: AuthAction): string {
  switch (code) {
    case INVALID_CREDENTIALS:
      return "Nieprawidłowy e-mail lub hasło.";
    case EMAIL_NOT_CONFIRMED:
      return "Adres e-mail nie został jeszcze potwierdzony. Sprawdź skrzynkę.";
    case USER_ALREADY_EXISTS:
    case EMAIL_EXISTS:
      return "Konto z tym adresem już istnieje. Zaloguj się.";
    case WEAK_PASSWORD:
      return "Hasło nie spełnia wymagań bezpieczeństwa. Wybierz dłuższe hasło.";
    case RATE_LIMITED[0]:
    case RATE_LIMITED[1]:
      return "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.";
    case REQUEST_TIMEOUT:
      return OUTAGE_MESSAGE;
    default:
      return FALLBACK[action];
  }
}

/**
 * Awaria transportu (GoTrue nieosiągalny): auth-js rzuca `AuthRetryableFetchError`
 * ze statusem 0 i bez kodu; `fetch` rzuca `TypeError` bez kodu i bez statusu.
 * Wszystko, co niesie kod albo prawdziwy status HTTP, jest odpowiedzią serwera.
 */
export function isTransportError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if (errorCode(error) !== undefined) return false;
  const status = "status" in error ? error.status : undefined;
  return status === undefined || status === 0;
}

/** Błąd, który użytkownik wywołał sam (złe hasło, istniejące konto, limit) - nie incydent, bez wpisu w logu. */
export function isExpectedUserError(code: string | undefined): boolean {
  return code !== undefined && USER_ERROR_CODES.has(code);
}
