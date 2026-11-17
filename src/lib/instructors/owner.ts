import { currentUser, type SessionClient } from "@/lib/auth/session";

/**
 * Kto woła endpoint instruktorów: właściciel z ośrodkiem, konto bez ośrodka, nikt (brak albo
 * wygaśnięcie sesji) albo nie wiadomo, bo zależność zawiodła. Wynik dyskryminowany jak w
 * `@/lib/auth/session` — endpoint tylko mapuje go na przekierowanie.
 */
export type OwnerResult =
  | { kind: "owner"; stableId: number }
  | { kind: "no-stable" }
  | { kind: "signed-out" }
  | { kind: "outage"; error: unknown };

/**
 * Odczyt ośrodka należącego do konta; `null` — konto bez ośrodka. Rzuca przy błędzie zapytania
 * (jak `getOwnedStableId`); typy PostgREST są za głębokie na wąski interfejs, więc wołający
 * podaje funkcję, a test ją podstawia.
 */
export type StableIdLoader = (userId: string) => PromiseLike<number | null>;

/** Sesja, potem ośrodek właściciela; wyjątek odczytu ośrodka to awaria, nie brak ośrodka. */
export async function resolveOwner(client: SessionClient, loadStableId: StableIdLoader): Promise<OwnerResult> {
  const session = await currentUser(client);

  switch (session.kind) {
    case "anonymous":
    case "expired":
      return { kind: "signed-out" };
    case "outage":
      return { kind: "outage", error: session.error };
    case "user":
      break;
  }

  try {
    const stableId = await loadStableId(session.user.id);
    return stableId === null ? { kind: "no-stable" } : { kind: "owner", stableId };
  } catch (error) {
    return { kind: "outage", error };
  }
}
