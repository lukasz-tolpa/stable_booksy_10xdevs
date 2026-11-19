import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { SessionClient } from "@/lib/auth/session";
import { resolveOwner, type StableIdLoader } from "@/lib/instructors/owner";

// Stub strukturalny jak w session.test.ts: awarii GoTrue ani bazy nie da się wywołać na prawdziwym
// stacku, więc klient zwraca zadane `{ data, error }`, a odczyt ośrodka jest funkcją.

const OWNER = "11111111-1111-1111-1111-111111111111";

function fakeUser(id: string): User {
  return { id, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "" };
}

function client(getUser: () => Promise<{ data: { user: User | null }; error: unknown }>): SessionClient {
  return {
    auth: {
      getUser,
      signOut: () => Promise.resolve({ error: null }),
      signUp: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    },
  };
}

const signedIn = client(() => Promise.resolve({ data: { user: fakeUser(OWNER) }, error: null }));

const stableOf =
  (stableId: number | null): StableIdLoader =>
  () =>
    Promise.resolve(stableId);

describe("resolveOwner", () => {
  it("zalogowany właściciel dostaje identyfikator swojego ośrodka", async () => {
    const asked: string[] = [];
    const loader: StableIdLoader = (userId) => {
      asked.push(userId);
      return Promise.resolve(7);
    };

    expect(await resolveOwner(signedIn, loader)).toEqual({ kind: "owner", stableId: 7 });
    expect(asked).toEqual([OWNER]);
  });

  it("konto bez ośrodka to osobny wynik, nie awaria", async () => {
    expect(await resolveOwner(signedIn, stableOf(null))).toEqual({ kind: "no-stable" });
  });

  it("bez sesji — do logowania, ośrodka nie czyta", async () => {
    const anonymous = client(() =>
      Promise.resolve({ data: { user: null }, error: { name: "AuthSessionMissingError", status: 400 } }),
    );
    let asked = false;

    expect(
      await resolveOwner(anonymous, () => {
        asked = true;
        return Promise.resolve(7);
      }),
    ).toEqual({ kind: "signed-out" });
    expect(asked).toBe(false);
  });

  it("wygasła sesja — do logowania", async () => {
    const expired = client(() =>
      Promise.resolve({ data: { user: null }, error: { code: "refresh_token_not_found", status: 400 } }),
    );

    expect(await resolveOwner(expired, stableOf(7))).toEqual({ kind: "signed-out" });
  });

  it("GoTrue nieosiągalny to awaria z przyczyną, nie wylogowanie", async () => {
    const cause = new TypeError("fetch failed");
    const unreachable = client(() => Promise.reject(cause));

    expect(await resolveOwner(unreachable, stableOf(7))).toEqual({ kind: "outage", error: cause });
  });

  it("błąd odczytu ośrodka to awaria z przyczyną", async () => {
    const cause = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });

    expect(await resolveOwner(signedIn, () => Promise.reject(cause))).toEqual({ kind: "outage", error: cause });
  });
});
