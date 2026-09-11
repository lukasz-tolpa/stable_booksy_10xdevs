/**
 * Wynik każdego wywołania zależności na ścieżce auth w jednym miejscu.
 *
 * Endpointy (`signin.ts`, `signup.ts`, `signout.ts`) i middleware nie czytają już
 * `{ data, error }` z klienta bezpośrednio - dostają wynik dyskryminowany i tylko
 * mapują go na przekierowanie. Dzięki temu awarie częściowe, których prawdziwy stack
 * nie wywoła (odmowa wylogowania, błąd zapytania o profil, GoTrue nieosiągalny,
 * rejestracja bez sesji, klient rzucający wyjątek), są dowiedzione na stubie
 * w `session.test.ts`.
 *
 * `SessionClient` to wąski typ strukturalny powierzchni `auth`; prawdziwy klient
 * z `@/lib/supabase` spełnia go bez rzutowania (`asSessionClient` niżej). Zapytanie
 * o profil idzie osobno jako `RoleLoader`: typy PostgREST (`from().select()`) są za
 * głębokie, żeby dało się je opisać wąskim interfejsem (ts2589), więc wołający buduje
 * loader z prawdziwego klienta (`profileRoleLoader`) albo z już pobranego wiersza
 * (middleware), a test podstawia funkcję.
 *
 * auth-js rzuca dalej wszystko, co nie jest AuthError (np. wyjątek adaptera ciasteczek),
 * dlatego każdy helper łapie wyjątek i oddaje go jako wynik - nigdy jako niezalogowany 500.
 */

import type { User } from "@supabase/supabase-js";
import {
  OUTAGE_MESSAGE,
  authErrorMessage,
  isExpectedUserError,
  isProviderOutage,
  isRateLimited,
  type AuthAction,
} from "@/lib/auth/errors";
import { isUserRole } from "@/lib/auth/roles";
import { errorCode } from "@/lib/db-errors";
import { logError, type LogSink } from "@/lib/log";
import type { createClient } from "@/lib/supabase";
import type { UserRole } from "@/types";

/**
 * Komunikat dla użytkownika po błędzie GoTrue + wpis w logu, gdy to nie jest błąd
 * użytkownika (złe hasło, istniejące konto, limit prób nie są incydentami).
 * `sink` jest parametrem, żeby test nie dotykał konsoli.
 */
export function authFailureMessage(scope: string, error: unknown, action: AuthAction, sink?: LogSink): string {
  if (isProviderOutage(error)) {
    logError(scope, error, sink);
    return OUTAGE_MESSAGE;
  }
  const code = errorCode(error);
  if (isRateLimited(code)) {
    // Limit prób to błąd użytkownika, ale też sygnał credential stuffingu: wpis bez treści
    // (sam kod i status), żeby był ślad, a do logu nie trafił żaden adres ani tekst dostawcy.
    logError(scope, { code, status: errorStatus(error) }, sink);
  } else if (!isExpectedUserError(code)) {
    logError(scope, error, sink);
  }
  return authErrorMessage(code, action);
}

function errorStatus(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
}

export interface SessionClient {
  auth: {
    signOut(): Promise<{ error: unknown }>;
    getUser(): Promise<{ data: { user: User | null }; error: unknown }>;
    signUp(credentials: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown> };
    }): Promise<{ data: { user: User | null; session: object | null }; error: unknown }>;
  };
}

/** Odczyt wiersza profilu; `error` niesie awarię zapytania, `data: null` brak wiersza. */
export type RoleLoader = (userId: string) => PromiseLike<{ data: { role: string } | null; error: unknown }>;

type RealClient = NonNullable<ReturnType<typeof createClient>>;

/** Prawdziwy klient jako `SessionClient` - bez rzutowania; gdy przestanie pasować, padnie `astro check`. */
export const asSessionClient = (client: RealClient): SessionClient => client;

/** Loader roli z prawdziwego klienta dla endpointów (middleware buduje loader z pobranego wiersza). */
export const profileRoleLoader =
  (client: RealClient): RoleLoader =>
  (userId) =>
    client.from("profiles").select("role").eq("id", userId).maybeSingle();

export type SignOutResult = { ok: true } | { ok: false; error: unknown };
export type RoleResult = { kind: "role"; role: UserRole } | { kind: "no-role" } | { kind: "outage"; error: unknown };
export type UserResult =
  | { kind: "user"; user: User }
  | { kind: "anonymous" }
  | { kind: "expired"; error: unknown }
  | { kind: "outage"; error: unknown };
export type SignUpResult =
  | { kind: "session"; role: UserRole }
  | { kind: "confirm" }
  | { kind: "error"; error: unknown };

/** Wylogowanie: `ok: false` także wtedy, gdy klient rzuci - sesja wtedy na pewno została. */
export async function signOutUser(client: SessionClient): Promise<SignOutResult> {
  try {
    const { error } = await client.auth.signOut();
    return error ? { ok: false, error } : { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/** Rola z profilu; błąd zapytania to awaria, nie brak roli (nie wylogowujemy za awarię). */
export async function resolveRole(loadRole: RoleLoader, userId: string): Promise<RoleResult> {
  try {
    const { data, error } = await loadRole(userId);
    if (error) return { kind: "outage", error };
    const role = data?.role;
    return isUserRole(role) ? { kind: "role", role } : { kind: "no-role" };
  } catch (error) {
    return { kind: "outage", error };
  }
}

/**
 * auth-js zgłasza brak sesji jako AuthSessionMissingError (400, bez kodu) - zarówno gdy
 * nie ma ciasteczka, jak i gdy GoTrue odrzucił sesję (403 session_not_found jest
 * zamieniane na ten sam błąd, a ciasteczko usuwane przez samego klienta). Świadomie:
 * oba przypadki to anonim - użytkownik i tak ląduje na logowaniu z czystym stanem.
 * "Wygasła sesja" zostaje dla awarii odświeżania tokenu (refresh_token_not_found,
 * refresh_token_already_used, bad_jwt), które auth-js oddaje jako AuthApiError.
 */
function isMissingSessionError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AuthSessionMissingError";
}

/** Użytkownik z sesji: awaria dostawcy ≠ wygasła sesja ≠ anonim; wyjątek klienta to awaria. */
export async function currentUser(client: SessionClient): Promise<UserResult> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error) {
      if (isMissingSessionError(error)) return { kind: "anonymous" };
      return isProviderOutage(error) ? { kind: "outage", error } : { kind: "expired", error };
    }
    return data.user ? { kind: "user", user: data.user } : { kind: "anonymous" };
  } catch (error) {
    return { kind: "outage", error };
  }
}

/** Rejestracja: brak sesji bez błędu (potwierdzenie e-mail / anty-enumeracja) nie jest wejściem do panelu. */
export async function signUpOutcome(
  client: SessionClient,
  input: { email: string; password: string; role: UserRole; fullName: string },
): Promise<SignUpResult> {
  try {
    const { data, error } = await client.auth.signUp({
      email: input.email,
      password: input.password,
      // Trigger `handle_new_user` przepisuje oba klucze na wiersz profilu; pusty string
      // zamienia na NULL, więc przycięcie po stronie schematu jest tym, co gwarantuje
      // realne imię na liście zapisów ośrodka (FR-005).
      options: { data: { role: input.role, full_name: input.fullName } },
    });
    if (error) return { kind: "error", error };
    return data.session ? { kind: "session", role: input.role } : { kind: "confirm" };
  } catch (error) {
    return { kind: "error", error };
  }
}
