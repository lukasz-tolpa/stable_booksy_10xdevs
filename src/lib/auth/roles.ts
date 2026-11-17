import { INSTRUCTOR_LABEL, ROLE_LABELS, USER_ROLES } from "@/lib/auth/constants";
import type { UserRole } from "@/types";

/**
 * Tabela decyzyjna routingu: gdzie mieszka każda rola i który prefiks ścieżki
 * wymaga której roli. Middleware, endpointy i nawigacja czytają stąd zamiast
 * powielać `if (role === "instructor")` w kilku miejscach.
 *
 * Dodanie trasy w kolejnym slice'ie to jeden wpis w `PROTECTED_PREFIXES`.
 */

/** Trasa startowa każdej roli. */
export const ROLE_HOME: Record<UserRole, string> = {
  instructor: "/osrodek",
  rider: "/jezdziec",
};

export const SIGN_IN_ROUTE = "/auth/signin";

/**
 * Adres panelu ze scaffolda. Nie ma już strony pod tym adresem - middleware przenosi
 * z niego do przestrzeni roli, żeby stare linki nie prowadziły donikąd i żeby nie
 * istniały dwa równoległe panele.
 */
export const LEGACY_HOME_ROUTE = "/dashboard";

/** Ekran zakładania stadniny — konto instruktora bez ośrodka nie wychodzi poza niego. */
export const NEW_STABLE_ROUTE = "/osrodek/nowa-stadnina";

/** Endpoint przyjmujący formularz stadniny; musi być wyłączony z wymuszenia, żeby nie zapętlić przekierowań. */
export const CREATE_STABLE_ENDPOINT = "/api/stables/create";

/**
 * Przestrzeń instruktora, który nie jest właścicielem — strona „Moje sloty” (#72). Właściciel
 * mieszka w przestrzeni ośrodka (`ROLE_HOME.instructor`).
 */
export const INSTRUCTOR_HOME_ROUTE = "/instruktor";

/**
 * Kim jest konto `instructor` w ośrodku — wynika z danych w bazie, nie z roli konta (ADR-0004):
 * `none` — konto bez instruktora (rejestracja „Ośrodek”, ośrodek jeszcze niezałożony),
 * `owner` — instruktor właściciel ośrodka, `instructor` — instruktor z kontem bez praw właściciela.
 */
export type InstructorStanding = "none" | "owner" | "instructor";

/**
 * Powiązanie konta z instruktorem, tak jak widzi je sesja: `null` — konto bez instruktora;
 * `stableOwnerId` — właściciel jego ośrodka, `null`, gdy RLS nie pokazuje ośrodka
 * (instruktor zdezaktywowany).
 */
export interface InstructorLink {
  stableOwnerId: string | null;
}

/** Kim jest konto `instructor` w ośrodku — właściciel to konto zapisane przy ośrodku jego instruktora. */
export function instructorStandingOf(link: InstructorLink | null, accountId: string): InstructorStanding {
  if (!link) {
    return "none";
  }
  return link.stableOwnerId === accountId ? "owner" : "instructor";
}

export interface RouteGuard {
  prefix: string;
  /** `null` = wystarczy dowolna zalogowana sesja, bez wymogu konkretnej roli. */
  role: UserRole | null;
}

const PROTECTED_PREFIXES: readonly RouteGuard[] = [
  { prefix: ROLE_HOME.instructor, role: "instructor" },
  { prefix: INSTRUCTOR_HOME_ROUTE, role: "instructor" },
  { prefix: ROLE_HOME.rider, role: "rider" },
  { prefix: LEGACY_HOME_ROUTE, role: null },
];

/**
 * Trasa startowa samej roli — bez wiedzy o powiązaniu konta instruktora. Konto `instructor`
 * trafia do przestrzeni ośrodka, a middleware przenosi stamtąd instruktora, który nie jest
 * właścicielem (`instructorRedirect`). Gdy powiązanie jest znane, `homeRouteForAccount`.
 */
export function homeRouteForRole(role: UserRole): string {
  return ROLE_HOME[role];
}

/** Trasa startowa konta: jeździec — jego przestrzeń; konto instruktora — według powiązania z ośrodkiem. */
export function homeRouteForAccount(role: UserRole, standing: InstructorStanding | null): string {
  if (role !== "instructor") {
    return ROLE_HOME[role];
  }
  switch (standing) {
    case "instructor":
      return INSTRUCTOR_HOME_ROUTE;
    case "none":
      return NEW_STABLE_ROUTE;
    case "owner":
    case null:
      return ROLE_HOME.instructor;
  }
}

/**
 * Dokąd przenieść konto `instructor` z chronionej ścieżki, albo `null`, gdy może na niej zostać.
 * Konto bez ośrodka nie wychodzi poza zakładanie ośrodka; konto z ośrodkiem na nie nie wchodzi.
 * Właściciel mieszka w przestrzeni ośrodka, instruktor — w „Moje sloty”, i każdy z nich jest
 * przenoszony z przestrzeni drugiego do swojej.
 */
export function instructorRedirect(pathname: string, standing: InstructorStanding): string | null {
  const home = homeRouteForAccount("instructor", standing);

  if (standing === "none") {
    return isStableSetupPath(pathname) ? null : home;
  }

  if (isStableSetupPath(pathname)) {
    return home;
  }

  const foreignSpace = standing === "owner" ? INSTRUCTOR_HOME_ROUTE : ROLE_HOME.instructor;
  return matchesPrefix(pathname, foreignSpace) ? home : null;
}

/** Etykieta pigułki roli w górnym pasku: instruktor bez praw właściciela to „Instruktor”, nie „Ośrodek”. */
export function roleBadgeLabel(role: UserRole, standing: InstructorStanding | null): string {
  return role === "instructor" && standing === "instructor" ? INSTRUCTOR_LABEL : ROLE_LABELS[role];
}

/**
 * Kolumna `profiles.role` jest w bazie zwykłym tekstem z ograniczeniem CHECK, więc
 * wygenerowany typ to `string`. Ta straż zamienia go w rolę bez rzutowania i daje
 * miejsce na obsługę wartości, której aplikacja nie zna.
 */
export function isUserRole(value: string | null | undefined): value is UserRole {
  return USER_ROLES.some((role) => role === value);
}

/** Nazwa parametru adresu rejestracji, który wstępnie zaznacza rodzaj konta. */
export const SIGNUP_ROLE_PARAM = "rola";

/**
 * Wartość parametru `rola` każdej roli — polska, bo to ona jest widoczna w adresie.
 * Jedyna tabela: adres rejestracji czyta ją wprost, odczyt parametru szuka w niej roli.
 */
const SIGNUP_ROLE_PARAM_VALUES: Record<UserRole, string> = {
  rider: "jezdziec",
  instructor: "osrodek",
};

export const SIGN_UP_ROUTE = "/auth/signup";

/** Adres rejestracji z wstępnie zaznaczonym rodzajem konta — odwrotność `signupRoleFromParam`. */
export function signupRouteForRole(role: UserRole): string {
  return `${SIGN_UP_ROUTE}?${SIGNUP_ROLE_PARAM}=${SIGNUP_ROLE_PARAM_VALUES[role]}`;
}

/**
 * Rola wstępnie zaznaczona w formularzu rejestracji, z parametru `rola` w adresie.
 * `null` = formularz bez zaznaczenia: brak parametru, pusta albo nieznana wartość.
 * Dopasowanie jest dokładne, także co do wielkości liter.
 */
export function signupRoleFromParam(value: string | null | undefined): UserRole | null {
  return USER_ROLES.find((role) => SIGNUP_ROLE_PARAM_VALUES[role] === value) ?? null;
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
