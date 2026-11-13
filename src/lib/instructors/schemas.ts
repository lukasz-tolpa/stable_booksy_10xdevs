import { z } from "zod";
import { formInt } from "@/lib/form-data";

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

/** Przełączenie flagi `active` — identyfikator instruktora i docelowy stan. */
export const toggleInstructorSchema = z.object({
  instructorId: formInt("Nieprawidłowy instruktor").pipe(z.number().positive({ error: "Nieprawidłowy instruktor" })),
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type NewInstructorInput = z.infer<typeof newInstructorSchema>;
export type ToggleInstructorInput = z.infer<typeof toggleInstructorSchema>;
