import { z } from "zod";
import { MIN_PASSWORD_LENGTH, USER_ROLES } from "@/lib/auth/constants";

/**
 * Schematy walidacji wejścia z formularzy. Komunikaty są po polsku i są jedynym
 * źródłem treści błędów po stronie serwera — formularze po stronie klienta powtarzają
 * te same zdania, żeby wyłączony JavaScript nie zmieniał tego, co widzi użytkownik.
 */

const emailField = z.email({ error: "Podaj poprawny adres e-mail" });

export const signUpSchema = z
  .object({
    // Imię trafia do metadanych konta, a stamtąd trigger bazy przepisuje je na profil.
    // Przycinamy przed sprawdzeniem długości - inaczej same spacje przeszłyby walidację
    // i ośrodek zobaczyłby pusty wiersz zamiast jeźdźca (FR-005).
    fullName: z.string().trim().min(1, { error: "Podaj imię i nazwisko" }),
    email: emailField,
    password: z.string().min(MIN_PASSWORD_LENGTH, {
      error: `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`,
    }),
    confirmPassword: z.string().min(1, { error: "Powtórz hasło" }),
    // Nieznana rola odpada tutaj. Gdyby przeszła dalej, trigger bazy zamieniłby ją
    // po cichu na jeźdźca, a roli nie da się potem zmienić z poziomu sesji.
    role: z.enum(USER_ROLES, { error: "Wybierz rodzaj konta" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Hasła nie są takie same",
    path: ["confirmPassword"],
  });

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, { error: "Podaj hasło" }),
});

/**
 * Nazwa i miejscowość po przycięciu białych znaków muszą być niepuste — odpowiednik
 * ograniczeń `stables_name_not_blank` i `stables_city_not_blank` z migracji F-01.
 * Walidacja tutaj daje komunikat po polsku zamiast surowego błędu Postgresa.
 */
export const newStableSchema = z.object({
  name: z.string().trim().min(1, { error: "Podaj nazwę stadniny" }),
  city: z.string().trim().min(1, { error: "Podaj miejscowość" }),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type NewStableInput = z.infer<typeof newStableSchema>;

/** Pierwszy komunikat błędu z wyniku walidacji — endpointy przekazują go w parametrze `error`. */
export function firstErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Nieprawidłowe dane formularza";
}
