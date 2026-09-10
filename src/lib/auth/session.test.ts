import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  currentUser,
  resolveRole,
  signOutUser,
  signUpOutcome,
  type RoleLoader,
  type SessionClient,
} from "@/lib/auth/session";

// Stub strukturalny (M3L2): awarie częściowe - odmowa wylogowania, błąd zapytania o profil,
// GoTrue nieosiągalny, rejestracja bez sesji - nie dają się wywołać na prawdziwym stacku,
// więc klient jest obiektem zwracającym zadane `{ data, error }`, a loader roli funkcją. Bez mockowania modułów.

interface Results {
  signOut?: { error: unknown };
  /** Klient rzuca (np. TypeError z fetch) zamiast zwrócić `{ error }`. */
  signOutThrows?: Error;
  getUser?: { data: { user: User | null }; error: unknown };
  signUp?: { data: { user: User | null; session: object | null }; error: unknown };
}

function roleLoader(result: { data: { role: string } | null; error: unknown }): RoleLoader {
  return () => Promise.resolve(result);
}

// Minimalny użytkownik GoTrue - helpery czytają tylko `id`; reszta pól nie ma znaczenia.
function fakeUser(id: string): User {
  return { id, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };
}

function stubClient(results: Results): SessionClient {
  return {
    auth: {
      signOut: () =>
        results.signOutThrows
          ? Promise.reject(results.signOutThrows)
          : Promise.resolve(results.signOut ?? { error: null }),
      getUser: () => Promise.resolve(results.getUser ?? { data: { user: null }, error: null }),
      signUp: () => Promise.resolve(results.signUp ?? { data: { user: null, session: null }, error: null }),
    },
  };
}

const AUTH_OUTAGE = { name: "AuthRetryableFetchError", status: 0, code: undefined, message: "fetch failed" };

describe("signOutUser", () => {
  it("odmowa GoTrue nie udaje wylogowania i oddaje błąd", async () => {
    const error = { status: 500, message: "boom" };

    await expect(signOutUser(stubClient({ signOut: { error } }))).resolves.toEqual({ ok: false, error });
  });

  it("wyjątek z klienta też jest porażką, nie wybuchem", async () => {
    const thrown = new TypeError("fetch failed");

    const result = await signOutUser(stubClient({ signOutThrows: thrown }));

    expect(result).toEqual({ ok: false, error: thrown });
  });

  it("brak błędu to udane wylogowanie", async () => {
    await expect(signOutUser(stubClient({ signOut: { error: null } }))).resolves.toEqual({ ok: true });
  });
});

describe("resolveRole", () => {
  it("błąd zapytania o profil to awaria, nie brak roli", async () => {
    const error = { code: "PGRST000", message: "connection refused" };

    await expect(resolveRole(roleLoader({ data: null, error }), "u1")).resolves.toEqual({ kind: "outage", error });
  });

  it.each([
    ["brak wiersza profilu", null],
    ["rola spoza aplikacji", { role: "admin" }],
  ])("%s to brak roli", async (_label, data) => {
    await expect(resolveRole(roleLoader({ data, error: null }), "u1")).resolves.toEqual({ kind: "no-role" });
  });

  it("profil z rolą jeźdźca daje rolę", async () => {
    await expect(resolveRole(roleLoader({ data: { role: "rider" }, error: null }), "u1")).resolves.toEqual({
      kind: "role",
      role: "rider",
    });
  });
});

describe("currentUser", () => {
  it("GoTrue nieosiągalny to awaria, nie anonim", async () => {
    await expect(currentUser(stubClient({ getUser: { data: { user: null }, error: AUTH_OUTAGE } }))).resolves.toEqual({
      kind: "outage",
      error: AUTH_OUTAGE,
    });
  });

  // GoTrue odpowiada, ale sam ma awarię (np. bez bazy): 5xx to problem dostawcy,
  // nie sesji użytkownika - komunikat o chwilowym problemie, nie "Sesja wygasła".
  it("błąd 5xx z GoTrue to awaria, nie wygaśnięcie", async () => {
    const error = { code: "unexpected_failure", status: 500, message: "Database error querying schema" };

    await expect(currentUser(stubClient({ getUser: { data: { user: null }, error } }))).resolves.toEqual({
      kind: "outage",
      error,
    });
  });

  it("odrzucona sesja to wygaśnięcie", async () => {
    const error = {
      code: "session_not_found",
      status: 403,
      message: "Session from session_id claim in JWT does not exist",
    };

    await expect(currentUser(stubClient({ getUser: { data: { user: null }, error } }))).resolves.toEqual({
      kind: "expired",
      error,
    });
  });

  // auth-js zgłasza brak ciasteczka sesji jako AuthSessionMissingError (400, bez kodu):
  // to zwykły anonim, nie wygaśnięcie - inaczej każdy gość na trasie chronionej
  // widziałby "Sesja wygasła", a każde anonimowe żądanie trafiałoby do logu.
  it("brak ciasteczka sesji (AuthSessionMissingError) to anonim, nie wygaśnięcie", async () => {
    const error = { name: "AuthSessionMissingError", status: 400, code: undefined, message: "Auth session missing!" };

    await expect(currentUser(stubClient({ getUser: { data: { user: null }, error } }))).resolves.toEqual({
      kind: "anonymous",
    });
  });

  it("brak użytkownika bez błędu to anonim", async () => {
    await expect(currentUser(stubClient({ getUser: { data: { user: null }, error: null } }))).resolves.toEqual({
      kind: "anonymous",
    });
  });

  it("użytkownik z ważną sesją wraca w całości", async () => {
    const user = fakeUser("u1");

    await expect(currentUser(stubClient({ getUser: { data: { user }, error: null } }))).resolves.toEqual({
      kind: "user",
      user,
    });
  });
});

describe("signUpOutcome", () => {
  const input = { email: "nowy@example.com", password: "sekret123", role: "rider" as const };

  it("konto bez sesji wymaga potwierdzenia, a nie wejścia do panelu", async () => {
    const client = stubClient({ signUp: { data: { user: fakeUser("u2"), session: null }, error: null } });

    await expect(signUpOutcome(client, input)).resolves.toEqual({ kind: "confirm" });
  });

  it("konto z sesją wchodzi do przestrzeni wysłanej roli", async () => {
    const client = stubClient({ signUp: { data: { user: fakeUser("u2"), session: {} }, error: null } });

    await expect(signUpOutcome(client, input)).resolves.toEqual({ kind: "session", role: "rider" });
  });

  it("błąd GoTrue wraca w całości do zmapowania", async () => {
    const error = { code: "user_already_exists", status: 422, message: "User already registered" };
    const client = stubClient({ signUp: { data: { user: null, session: null }, error } });

    await expect(signUpOutcome(client, input)).resolves.toEqual({ kind: "error", error });
  });
});
