import { SIGN_IN_ROUTE, homeRouteForRole, isUserRole, signupRouteForRole } from "@/lib/auth/roles";
import { STABLE_DAY_BOOKINGS_ROUTE } from "@/lib/bookings/stable-redirect";
import type { UserRole } from "@/types";

/** Przycisk połowy strony głównej: napis i adres. */
export interface LandingAction {
  label: string;
  href: string;
}

/** Przycisk zamknięcia sekcji „Jeden dzień”: wejście połowy razem z rolą, do której należy. */
export interface LandingClosingAction extends LandingAction {
  role: UserRole;
}

/**
 * Wejścia strony głównej: przycisk każdej połowy (`null` = połowa bez przycisku),
 * adres logowania dla linii „Masz już konto?” (`null` = linii nie ma) i przyciski
 * zamknięcia sekcji „Jeden dzień” - te same wejścia co w połowach, w ich kolejności
 * (pusta lista = zamknięcie bez przycisków).
 */
export type LandingEntries = Record<UserRole, LandingAction | null> & {
  signInRoute: string | null;
  closing: LandingClosingAction[];
  /** Dokąd prowadzi „Zapisz się” z ilustracji listy slotów (`null` = zostaje nieklikalne). */
  bookRoute: string | null;
};

/**
 * Cel „Zapisz się” z ilustracji dla zalogowanego: jeździec trafia tam, gdzie naprawdę
 * się zapisuje (lista ośrodków), ośrodek — do zapisów jeźdźców w swoim grafiku.
 */
const BOOK_ROUTES: Record<UserRole, string> = {
  rider: homeRouteForRole("rider"),
  stable: STABLE_DAY_BOOKINGS_ROUTE,
};

/** Kolejność połów na stronie - w tej samej stoją przyciski zamknięcia. */
const HALVES = ["rider", "stable"] as const satisfies readonly UserRole[];

const SIGNUP_LABELS: Record<UserRole, string> = {
  rider: "Załóż konto jeźdźca",
  stable: "Załóż konto ośrodka",
};

const HOME_LABEL = "Mój panel";

/**
 * Odwiedzający stronę główną: `null` to gość, obiekt to zalogowany z rolą swojego
 * profilu (tekst z bazy; brak profilu albo nieznana wartość to brak rozpoznanej roli).
 */
export type LandingVisitor = { profileRole: string | null | undefined } | null;

/**
 * Co strona główna proponuje odwiedzającemu. Gość dostaje w każdej połowie rejestrację
 * jej roli i linię o logowaniu. Zalogowany dostaje „Mój panel” w połowie swojej roli,
 * pod adresem z tej samej tabeli ról co górny pasek; profil bez rozpoznanej roli nie
 * dostaje żadnego przycisku. Zamknięcie sekcji „Jeden dzień” powtarza przyciski połów:
 * połowa bez przycisku nie ma go też tam.
 */
export function landingEntries(visitor: LandingVisitor): LandingEntries {
  const halves = halfActions(visitor);
  const closing = HALVES.flatMap((role) => {
    const action = halves[role];
    return action ? [{ role, ...action }] : [];
  });
  return {
    ...halves,
    signInRoute: visitor === null ? SIGN_IN_ROUTE : null,
    closing,
    bookRoute: bookRoute(visitor),
  };
}

function bookRoute(visitor: LandingVisitor): string | null {
  if (visitor === null) return SIGN_IN_ROUTE;
  return isUserRole(visitor.profileRole) ? BOOK_ROUTES[visitor.profileRole] : null;
}

function halfActions(visitor: LandingVisitor): Record<UserRole, LandingAction | null> {
  if (visitor === null) {
    return {
      rider: { label: SIGNUP_LABELS.rider, href: signupRouteForRole("rider") },
      stable: { label: SIGNUP_LABELS.stable, href: signupRouteForRole("stable") },
    };
  }

  const role = isUserRole(visitor.profileRole) ? visitor.profileRole : null;
  const home = (half: UserRole): LandingAction | null =>
    role === half ? { label: HOME_LABEL, href: homeRouteForRole(half) } : null;

  return { rider: home("rider"), stable: home("stable") };
}
