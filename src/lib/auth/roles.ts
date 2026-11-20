import { INSTRUCTOR_LABEL, ROLE_LABELS, STABLE_LABEL, USER_ROLES } from "@/lib/auth/constants";
import { STABLE_DAY_BOOKINGS_ROUTE } from "@/lib/bookings/stable-redirect";
import { INSTRUCTORS_ROUTE } from "@/lib/instructors/redirect";
import type { ScheduleCaller } from "@/lib/schedule/errors";
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
 * Ekran komunikatu dla konta instruktora zdezaktywowanego przez właściciela (#73) — jedyna
 * trasa chroniona, na którą takie konto wchodzi. Leży w przestrzeni instruktora, więc chroni
 * ją ta sama reguła roli.
 */
export const INACTIVE_INSTRUCTOR_ROUTE = `${INSTRUCTOR_HOME_ROUTE}/konto-nieaktywne`;

/** Grafik dnia właściciela — w przestrzeni ośrodka. */
export const OWNER_SCHEDULE_ROUTE = `${ROLE_HOME.instructor}/grafik`;

/**
 * Zakładka „Grafik” instruktora z uprawnieniem do układania grafiku (#79) — ten sam formularz dnia
 * co u właściciela, w przestrzeni instruktora. Instruktora bez uprawnienia middleware przenosi
 * stąd do „Moje sloty”.
 */
export const INSTRUCTOR_SCHEDULE_ROUTE = `${INSTRUCTOR_HOME_ROUTE}/grafik`;

/**
 * Podsumowanie miesiąca (spec #87) — jedna strona w przestrzeni każdej roli, miesiąc w `?miesiac=RRRR-MM`.
 * Właściciel: wszyscy jeźdźcy ośrodka (#88), wejście z panelu i ze Statystyk.
 */
export const OWNER_MONTH_SUMMARY_ROUTE = `${ROLE_HOME.instructor}/podsumowanie`;

/**
 * Zakładka „Podsumowanie miesiąca” instruktora z kontem (#90): jazdy z jego slotów. Ma ją każdy
 * aktywny instruktor, który nie jest właścicielem — z uprawnieniem do układania grafiku i bez.
 */
export const INSTRUCTOR_MONTH_SUMMARY_ROUTE = `${INSTRUCTOR_HOME_ROUTE}/podsumowanie`;

/** Podsumowanie miesiąca jeźdźca (#91): własne jazdy, osobno w każdym ośrodku. */
export const RIDER_MONTH_SUMMARY_ROUTE = `${ROLE_HOME.rider}/podsumowanie`;

/**
 * Kim jest konto `instructor` w ośrodku — wynika z danych w bazie, nie z roli konta (ADR-0004):
 * `none` — konto bez instruktora (rejestracja „Ośrodek”, ośrodek jeszcze niezałożony),
 * `owner` — instruktor właściciel ośrodka, `instructor` — instruktor z kontem bez praw właściciela,
 * `arranging-instructor` — taki instruktor z uprawnieniem do układania grafiku (#79): dochodzi mu
 * zakładka „Grafik”, poza tym wszystko jak u `instructor`,
 * `inactive` — instruktor zdezaktywowany przez właściciela (#73): RLS odcina mu cały ośrodek.
 */
export type InstructorStanding = "none" | "owner" | "instructor" | "arranging-instructor" | "inactive";

/**
 * Powiązanie konta z instruktorem, tak jak widzi je sesja: `null` — konto bez instruktora;
 * `active` — czy instruktor jest aktywny (swój wiersz konto widzi także po dezaktywacji);
 * `stableOwnerId` — właściciel jego ośrodka, `null`, gdy RLS nie pokazuje ośrodka
 * (instruktor zdezaktywowany); `arrangesSchedule` — uprawnienie do układania grafiku.
 */
export interface InstructorLink {
  active: boolean;
  stableOwnerId: string | null;
  arrangesSchedule: boolean;
}

/** Zakładka w przestrzeni instruktora albo sekcja przestrzeni ośrodka. */
export interface InstructorTab {
  href: string;
  label: string;
}

/** Zakładki przestrzeni instruktora wspólne dla stanów z uprawnieniem do grafiku i bez. */
const MY_SLOTS_TAB: InstructorTab = { href: INSTRUCTOR_HOME_ROUTE, label: "Moje sloty" };
const MONTH_SUMMARY_TAB: InstructorTab = { href: INSTRUCTOR_MONTH_SUMMARY_ROUTE, label: "Podsumowanie miesiąca" };

/**
 * Sekcje przestrzeni ośrodka właściciela — dolny pasek nawigacji na telefonie (spec #83), żeby
 * panel, Grafik, Zapisy, Konie, Instruktorzy i Statystyki były pod ręką na każdej stronie ośrodka.
 */
const STABLE_SECTIONS: readonly InstructorTab[] = [
  { href: ROLE_HOME.instructor, label: "Panel" },
  { href: OWNER_SCHEDULE_ROUTE, label: "Grafik" },
  { href: STABLE_DAY_BOOKINGS_ROUTE, label: "Zapisy" },
  { href: `${ROLE_HOME.instructor}/konie`, label: "Konie" },
  { href: INSTRUCTORS_ROUTE, label: "Instruktorzy" },
  { href: `${ROLE_HOME.instructor}/statystyki`, label: "Statystyki" },
];

/**
 * Wszystko, co zależy od tego, kim konto `instructor` jest w ośrodku — w jednym miejscu:
 * trasa startowa, ścieżki chronione, na których konto może zostać (`staysOn`; z pozostałych
 * middleware przenosi je na `home`), etykieta pigułki roli w górnym pasku, strona grafiku dnia
 * (`schedule`, `null` — konto grafiku nie układa), czyje komunikaty grafiku dostaje (`scheduleCaller`;
 * instruktor także po utracie uprawnienia) i zakładki przestrzeni instruktora (`tabs`; pusta lista —
 * bez paska zakładek).
 * Właściciel mieszka w przestrzeni ośrodka, instruktor — w „Moje sloty”; konto bez ośrodka nie
 * wychodzi poza zakładanie ośrodka, a konto z ośrodkiem na nie nie wchodzi; zdezaktywowany
 * instruktor widzi wyłącznie ekran nieaktywnego konta, aktywne konto na ten ekran nie wchodzi.
 */
const STANDINGS: Record<
  InstructorStanding,
  {
    home: string;
    staysOn: (pathname: string) => boolean;
    badgeLabel: string;
    schedule: string | null;
    scheduleCaller: ScheduleCaller;
    tabs: readonly InstructorTab[];
    sections: readonly InstructorTab[];
  }
> = {
  none: {
    home: NEW_STABLE_ROUTE,
    staysOn: isStableSetupPath,
    badgeLabel: STABLE_LABEL,
    schedule: null,
    scheduleCaller: "owner",
    tabs: [],
    sections: [],
  },
  owner: {
    home: ROLE_HOME.instructor,
    staysOn: (pathname) => isActiveAccountPath(pathname) && !matchesPrefix(pathname, INSTRUCTOR_HOME_ROUTE),
    badgeLabel: STABLE_LABEL,
    schedule: OWNER_SCHEDULE_ROUTE,
    scheduleCaller: "owner",
    tabs: [],
    sections: STABLE_SECTIONS,
  },
  instructor: {
    home: INSTRUCTOR_HOME_ROUTE,
    staysOn: (pathname) => isInstructorSpacePath(pathname) && !matchesPrefix(pathname, INSTRUCTOR_SCHEDULE_ROUTE),
    badgeLabel: INSTRUCTOR_LABEL,
    schedule: null,
    scheduleCaller: "instructor",
    tabs: [MY_SLOTS_TAB, MONTH_SUMMARY_TAB],
    sections: [],
  },
  "arranging-instructor": {
    home: INSTRUCTOR_HOME_ROUTE,
    staysOn: isInstructorSpacePath,
    badgeLabel: INSTRUCTOR_LABEL,
    schedule: INSTRUCTOR_SCHEDULE_ROUTE,
    scheduleCaller: "instructor",
    tabs: [MY_SLOTS_TAB, { href: INSTRUCTOR_SCHEDULE_ROUTE, label: "Grafik" }, MONTH_SUMMARY_TAB],
    sections: [],
  },
  inactive: {
    home: INACTIVE_INSTRUCTOR_ROUTE,
    staysOn: (pathname) => matchesPrefix(pathname, INACTIVE_INSTRUCTOR_ROUTE),
    badgeLabel: INSTRUCTOR_LABEL,
    schedule: null,
    scheduleCaller: "instructor",
    tabs: [],
    sections: [],
  },
};

/** Ścieżka dla aktywnego konta z ośrodkiem: poza zakładaniem ośrodka i ekranem nieaktywnego konta. */
function isActiveAccountPath(pathname: string): boolean {
  return !isStableSetupPath(pathname) && !matchesPrefix(pathname, INACTIVE_INSTRUCTOR_ROUTE);
}

/**
 * Ścieżka aktywnego instruktora, który nie jest właścicielem: wszystko poza przestrzenią ośrodka
 * (konie, zapisy, odwołania, statystyki, instruktorzy i grafik właściciela zostają przy nim).
 */
function isInstructorSpacePath(pathname: string): boolean {
  return isActiveAccountPath(pathname) && !matchesPrefix(pathname, ROLE_HOME.instructor);
}

/**
 * Kim jest konto `instructor` w ośrodku — właściciel to konto zapisane przy ośrodku jego instruktora.
 * Uprawnienie do układania grafiku liczy się tylko u aktywnego instruktora, który nie jest
 * właścicielem (właściciel ma wszystkie prawa, nieaktywnemu baza i tak je zeruje).
 */
export function instructorStandingOf(link: InstructorLink | null, accountId: string): InstructorStanding {
  if (!link) {
    return "none";
  }
  if (!link.active) {
    return "inactive";
  }
  if (link.stableOwnerId === accountId) {
    return "owner";
  }
  return link.arrangesSchedule ? "arranging-instructor" : "instructor";
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
  return role === "instructor" && standing !== null ? STANDINGS[standing].home : ROLE_HOME[role];
}

/** Dokąd przenieść konto `instructor` z chronionej ścieżki, albo `null`, gdy może na niej zostać (`STANDINGS`). */
export function instructorRedirect(pathname: string, standing: InstructorStanding): string | null {
  const { home, staysOn } = STANDINGS[standing];
  return staysOn(pathname) ? null : home;
}

/** Strona grafiku dnia konta albo `null`, gdy konto grafiku nie układa (endpoint zapisu wraca na nią). */
export function scheduleRouteFor(standing: InstructorStanding | null): string | null {
  return standing === null ? null : STANDINGS[standing].schedule;
}

/**
 * Czyje komunikaty dostaje konto przy zapisie grafiku: instruktor (z uprawnieniem, po jego utracie
 * albo zdezaktywowany) — instruktora; właściciel i konto bez powiązania (jeździec) — właściciela.
 */
export function scheduleCallerFor(standing: InstructorStanding | null): ScheduleCaller {
  return standing === null ? "owner" : STANDINGS[standing].scheduleCaller;
}

/** Zakładki przestrzeni instruktora — pusta lista, gdy konto ich nie ma (pasek się nie pokazuje). */
export function instructorTabs(standing: InstructorStanding | null): readonly InstructorTab[] {
  return standing === null ? [] : STANDINGS[standing].tabs;
}

/** Sekcje przestrzeni ośrodka — tylko u właściciela; pusta lista, gdy konto ich nie ma (pasek się nie pokazuje). */
export function stableSections(standing: InstructorStanding | null): readonly InstructorTab[] {
  return standing === null ? [] : STANDINGS[standing].sections;
}

/**
 * Adres bieżącej sekcji dla `pathname` (dolny pasek ją zaznacza): najdłuższy pasujący adres, więc
 * na stronie sekcji wygrywa sekcja, a nie panel, pod którym leży. `null` — strona spoza sekcji.
 */
export function currentSection(pathname: string, sections: readonly InstructorTab[]): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  let current: string | null = null;
  for (const section of sections) {
    if (matchesPrefix(path, section.href) && section.href.length > (current?.length ?? 0)) {
      current = section.href;
    }
  }
  return current;
}

/**
 * Sekcje dolnego paska na stronie `pathname`: tylko u właściciela i tylko w przestrzeni ośrodka
 * (na stronie głównej i innych stronach spoza sekcji pasek się nie pokazuje). Pusta lista — bez paska.
 */
export function stableTabBarSections(standing: InstructorStanding | null, pathname: string): readonly InstructorTab[] {
  const sections = stableSections(standing);
  return currentSection(pathname, sections) === null ? [] : sections;
}

/** Etykieta pigułki roli w górnym pasku: instruktor bez praw właściciela to „Instruktor”, nie „Ośrodek”. */
export function roleBadgeLabel(role: UserRole, standing: InstructorStanding | null): string {
  return role === "instructor" && standing !== null ? STANDINGS[standing].badgeLabel : ROLE_LABELS[role];
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
