import { z } from "zod";
import { formInt } from "@/lib/form-data";
import { INVITE_EMAIL_MESSAGE } from "@/lib/instructors/errors";

/**
 * Schematy formularzy instruktorów. Komunikaty po polsku; `InstructorForm` powtarza je
 * słowo w słowo, żeby wyłączony JavaScript nie zmieniał tego, co widzi ośrodek.
 */

/**
 * Nazwa po przycięciu spacji musi być niepusta — odpowiednik `instructors_name_not_blank`.
 * Unikalności tu nie sprawdzamy: jej jedynym strażnikiem jest indeks
 * `instructors_stable_name_key` w bazie (komunikat: `instructorErrorMessage`).
 */
export const newInstructorSchema = z.object({
  name: z.string().trim().min(1, { error: "Podaj nazwę instruktora" }),
});

const instructorIdField = formInt("Nieprawidłowy instruktor").pipe(
  z.number().positive({ error: "Nieprawidłowy instruktor" }),
);

/** Przełączenie flagi `active` — identyfikator instruktora i docelowy stan. */
export const toggleInstructorSchema = z.object({
  instructorId: instructorIdField,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/**
 * Zaproszenie instruktora do konta (#74): instruktor i adres, dla którego zaproszenie zadziała.
 * Adres po przycięciu spacji i małymi literami — tak samo zapisuje go baza
 * (`instructor_invitations_email_check`) i tak porówna go z adresem konta przy przyjęciu.
 */
export const inviteInstructorSchema = z.object({
  instructorId: instructorIdField,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: INVITE_EMAIL_MESSAGE })),
});

/** Sam identyfikator instruktora — wycofanie zaproszenia. */
export const instructorIdSchema = z.object({ instructorId: instructorIdField });

/** Nadanie (`true`) albo odebranie (`false`) uprawnienia do układania grafiku (#78). */
export const schedulePermissionSchema = z.object({
  instructorId: instructorIdField,
  granted: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type NewInstructorInput = z.infer<typeof newInstructorSchema>;
export type ToggleInstructorInput = z.infer<typeof toggleInstructorSchema>;
export type InviteInstructorInput = z.infer<typeof inviteInstructorSchema>;
