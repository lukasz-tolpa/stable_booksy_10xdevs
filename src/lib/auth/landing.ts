import { SIGN_IN_ROUTE, homeRouteForRole, isUserRole, signupRouteForRole } from "@/lib/auth/roles";
import type { UserRole } from "@/types";

/** Przycisk połowy strony głównej: napis i adres. */
export interface LandingAction {
  label: string;
  href: string;
}

/**
 * Wejścia strony głównej: przycisk każdej połowy (`null` = połowa bez przycisku)
 * i adres logowania dla linii „Masz już konto?” (`null` = linii nie ma).
 */
export type LandingEntries = Record<UserRole, LandingAction | null> & {
  signInRoute: string | null;
};

const SIGNUP_LABELS: Record<UserRole, string> = {
  rider: "Załóż konto jeźdźca",
  stable: "Załóż konto ośrodka",
};

const HOME_LABEL = "Mój panel";

/**
 * Co strona główna proponuje odwiedzającemu. Gość dostaje w każdej połowie rejestrację
 * jej roli i linię o logowaniu. Zalogowany dostaje „Mój panel” w połowie swojej roli,
 * pod adresem z tej samej tabeli ról co górny pasek; profil bez rozpoznanej roli nie
 * dostaje żadnego przycisku.
 */
export function landingEntries(signedIn: boolean, profileRole: string | null | undefined): LandingEntries {
  if (!signedIn) {
    return {
      rider: { label: SIGNUP_LABELS.rider, href: signupRouteForRole("rider") },
      stable: { label: SIGNUP_LABELS.stable, href: signupRouteForRole("stable") },
      signInRoute: SIGN_IN_ROUTE,
    };
  }

  const role = isUserRole(profileRole) ? profileRole : null;
  const home = (half: UserRole): LandingAction | null =>
    role === half ? { label: HOME_LABEL, href: homeRouteForRole(half) } : null;

  return { rider: home("rider"), stable: home("stable"), signInRoute: null };
}
