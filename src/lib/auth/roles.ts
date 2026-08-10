import { USER_ROLES } from "@/lib/auth/constants";
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

/**
 * Adres panelu ze scaffolda. Nie ma już strony pod tym adresem - middleware przenosi
 * z niego do przestrzeni roli, żeby stare linki nie prowadziły donikąd i żeby nie
 * istniały dwa równoległe panele.
 */
export const LEGACY_HOME_ROUTE = "/dashboard";

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
  { prefix: ROLE_HOME.stable, role: "stable" },
  { prefix: ROLE_HOME.rider, role: "rider" },
  { prefix: LEGACY_HOME_ROUTE, role: null },
];

export function homeRouteForRole(role: UserRole): string {
  return ROLE_HOME[role];
}

/**
 * Kolumna `profiles.role` jest w bazie zwykłym tekstem z ograniczeniem CHECK, więc
 * wygenerowany typ to `string`. Ta straż zamienia go w rolę bez rzutowania i daje
 * miejsce na obsługę wartości, której aplikacja nie zna.
 */
export function isUserRole(value: string | null | undefined): value is UserRole {
  return USER_ROLES.some((role) => role === value);
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

/** Czy to stary adres panelu, z którego trzeba przenieść użytkownika do jego przestrzeni. */
export function isLegacyHomeRoute(pathname: string): boolean {
  return matchesPrefix(pathname, LEGACY_HOME_ROUTE);
}

/**
 * Czy na tej ścieżce wolno pominąć wymuszenie założenia stadniny. Obejmuje sam ekran
 * zakładania i endpoint przyjmujący formularz — bez tego middleware przekierowywałby
 * na cel, który sam blokuje.
 */
export function isStableSetupPath(pathname: string): boolean {
  return matchesPrefix(pathname, NEW_STABLE_ROUTE) || matchesPrefix(pathname, CREATE_STABLE_ENDPOINT);
}
