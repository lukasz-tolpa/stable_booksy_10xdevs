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
export const USER_ROLES = ["instructor", "rider"] as const satisfies readonly UserRole[];

/**
 * Etykiety ról widoczne dla użytkownika. Konto instruktora zakłada się w rejestracji wyborem
 * „Ośrodek” — tak zostaje założony ośrodek i jego właściciel.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  instructor: "Ośrodek",
  rider: "Jeździec",
};

/** Etykieta konta instruktora, który nie jest właścicielem (pigułka roli w górnym pasku, #72). */
export const INSTRUCTOR_LABEL = "Instruktor";

/**
 * Postać tokenu z linku zaproszenia (`/auth/signup?zaproszenie=<token>`, #74): 32 losowe bajty
 * zapisane szesnastkowo małymi literami — tak, jak zwraca je `issue_instructor_invitation`.
 */
export const INVITATION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
