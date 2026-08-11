import { z } from "zod";

/**
 * Schematy walidacji formularzy stadniny. Komunikaty po polsku, spójnie z
 * `src/lib/auth/schemas.ts` — formularze po stronie klienta powtarzają je słowo w słowo,
 * żeby wyłączony JavaScript nie zmieniał tego, co widzi użytkownik.
 */

/**
 * Imię po przycięciu białych znaków musi być niepuste — odpowiednik ograniczenia
 * `horses_name_not_blank` z migracji F-01. Walidacja tutaj daje komunikat po polsku
 * zamiast surowego błędu Postgresa.
 */
export const newHorseSchema = z.object({
  name: z.string().trim().min(1, { error: "Podaj imię konia" }),
  notes: z.string().trim().optional(),
});

/** Przełączenie flagi `active` — identyfikator konia i docelowy stan. */
export const toggleHorseSchema = z.object({
  horseId: z.coerce.number().int().positive({ error: "Nieprawidłowy koń" }),
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export type NewHorseInput = z.infer<typeof newHorseSchema>;
export type ToggleHorseInput = z.infer<typeof toggleHorseSchema>;
