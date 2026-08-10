import type { UserRole } from "@/types";

/**
 * Tabela decyzyjna routingu: gdzie mieszka każda rola i który prefiks ścieżki
 * wymaga której roli. Middleware, endpointy i nawigacja czytają stąd zamiast
 * powielać `if (role === "stable")` w kilku miejscach.
 *
 * Dodanie trasy w kolejnym slice'ie to jeden wpis w `PROTECTED_PREFIXES`.
 */

/** Trasa startowa każdej roli. */
export const ROLE_HOME: Record<UserRole, string> = {
  stable: "/osrodek",
  rider: "/jezdziec",
};

export const SIGN_IN_ROUTE = "/auth/signin";

/** Ekran zakładania stadniny — konto ośrodka bez stadniny nie wychodzi poza niego. */
export const NEW_STABLE_ROUTE = "/osrodek/nowa-stadnina";

/** Endpoint przyjmujący formularz stadniny; musi być wyłączony z wymuszenia, żeby nie zapętlić przekierowań. */
export const CREATE_STABLE_ENDPOINT = "/api/stables/create";

export interface RouteGuard {
  prefix: string;
  /** `null` = wystarczy dowolna zalogowana sesja, bez wymogu konkretnej roli. */
  role: UserRole | null;
}

const PROTECTED_PREFIXES: readonly RouteGuard[] = [
  { prefix: "/osrodek", role: "stable" },
  { prefix: "/jezdziec", role: "rider" },
  { prefix: "/dashboard", role: null },
];

export function homeRouteForRole(role: UserRole): string {
  return ROLE_HOME[role];
}

/**
 * Dopasowanie po granicy segmentu, nie po samym `startsWith` — inaczej `/osrodekxyz`
 * zostałby uznany za część przestrzeni ośrodka.
 */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Zwraca regułę chroniącą podaną ścieżkę albo `null`, gdy ścieżka jest publiczna. */
export function routeGuardFor(pathname: string): RouteGuard | null {
  return PROTECTED_PREFIXES.find((entry) => matchesPrefix(pathname, entry.prefix)) ?? null;
}

/**
 * Czy na tej ścieżce wolno pominąć wymuszenie założenia stadniny. Obejmuje sam ekran
 * zakładania i endpoint przyjmujący formularz — bez tego middleware przekierowywałby
 * na cel, który sam blokuje.
 */
export function isStableSetupPath(pathname: string): boolean {
  return matchesPrefix(pathname, NEW_STABLE_ROUTE) || matchesPrefix(pathname, CREATE_STABLE_ENDPOINT);
}
