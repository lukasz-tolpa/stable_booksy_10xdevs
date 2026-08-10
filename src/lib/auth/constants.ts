import type { UserRole } from "@/types";

/**
 * Minimalna długość hasła. Jedno źródło dla walidacji po stronie klienta
 * (formularz rejestracji) i po stronie serwera (schemat zod) — użytkownik nie może
 * dostać dwóch różnych komunikatów o tym samym błędzie.
 */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Dozwolone role kont. `satisfies` wiąże tę listę z typem wyprowadzonym ze schematu
 * bazy, więc rozjazd z ograniczeniem `profiles_role_check` wyjdzie przy kompilacji,
 * a nie dopiero jako błąd Postgresa w czasie rejestracji.
 */
export const USER_ROLES = ["stable", "rider"] as const satisfies readonly UserRole[];

/** Etykiety ról widoczne dla użytkownika. */
export const ROLE_LABELS: Record<UserRole, string> = {
  stable: "Ośrodek",
  rider: "Jeździec",
};
