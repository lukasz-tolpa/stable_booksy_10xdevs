import { z } from "zod";
import { INVITATION_TOKEN_PATTERN, MIN_PASSWORD_LENGTH, USER_ROLES } from "@/lib/auth/constants";

/**
 * Schematy walidacji wejścia z formularzy. Komunikaty są po polsku i są jedynym
 * źródłem treści błędów po stronie serwera — formularze po stronie klienta powtarzają
 * te same zdania, żeby wyłączony JavaScript nie zmieniał tego, co widzi użytkownik.
 */

const emailField = z.email({ error: "Podaj poprawny adres e-mail" });

const accountFields = {
  // Imię trafia do metadanych konta, a stamtąd trigger bazy przepisuje je na profil.
  // Przycinamy przed sprawdzeniem długości - inaczej same spacje przeszłyby walidację
  // i ośrodek zobaczyłby pusty wiersz zamiast jeźdźca (FR-005).
  fullName: z.string().trim().min(1, { error: "Podaj imię i nazwisko" }),
  password: z.string().min(MIN_PASSWORD_LENGTH, {
    error: `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`,
  }),
  confirmPassword: z.string().min(1, { error: "Powtórz hasło" }),
};

const passwordsMatch = {
  check: (data: { password: string; confirmPassword: string }) => data.password === data.confirmPassword,
  params: { error: "Hasła nie są takie same", path: ["confirmPassword"] },
};

export const signUpSchema = z
  .object({
    fullName: accountFields.fullName,
    email: emailField,
    password: accountFields.password,
    confirmPassword: accountFields.confirmPassword,
    // Nieznana rola odpada tutaj. Gdyby przeszła dalej, trigger bazy zamieniłby ją
    // po cichu na jeźdźca, a roli nie da się potem zmienić z poziomu sesji.
    role: z.enum(USER_ROLES, { error: "Wybierz rodzaj konta" }),
  })
  .refine(passwordsMatch.check, passwordsMatch.params);

/** Odmowa schematu dla tokenu spoza postaci z linku — strona pokaże wtedy powód zaproszenia. */
export const INVITATION_TOKEN_MESSAGE = "Link zaproszenia jest nieprawidłowy";

/**
 * Rejestracja z linku zaproszenia (#75). Bez roli i bez adresu: konto z zaproszenia jest zawsze
 * kontem instruktora (trigger `handle_new_user`), a adres wyznacza zaproszenie — endpoint bierze
 * go z `invitation_by_token`, nie z formularza, gdzie pole jest zablokowane.
 */
export const invitedSignUpSchema = z
  .object({
    ...accountFields,
    token: z.string({ error: INVITATION_TOKEN_MESSAGE }).regex(INVITATION_TOKEN_PATTERN, {
      error: INVITATION_TOKEN_MESSAGE,
    }),
  })
  .refine(passwordsMatch.check, passwordsMatch.params);

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, { error: "Podaj hasło" }),
});

/**
 * Nazwa, miejscowość i nazwa instruktora właściciela po przycięciu białych znaków muszą być
 * niepuste — odpowiednik ograniczeń `stables_name_not_blank`, `stables_city_not_blank`
 * i `instructors_name_not_blank`. Walidacja tutaj daje komunikat po polsku zamiast surowego
 * błędu Postgresa. Nazwa instruktora pojawia się przy slotach właściciela, jak nazwa każdego
 * instruktora, i potem się nie zmienia.
 */
export const newStableSchema = z.object({
  name: z.string().trim().min(1, { error: "Podaj nazwę stadniny" }),
  city: z.string().trim().min(1, { error: "Podaj miejscowość" }),
  instructorName: z
    .string({ error: "Podaj swoją nazwę instruktora" })
    .trim()
    .min(1, { error: "Podaj swoją nazwę instruktora" }),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type InvitedSignUpInput = z.infer<typeof invitedSignUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type NewStableInput = z.infer<typeof newStableSchema>;

/** Pierwszy komunikat błędu z wyniku walidacji — endpointy przekazują go w parametrze `error`. */
export function firstErrorMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Nieprawidłowe dane formularza";
}
