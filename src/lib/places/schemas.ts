import { z } from "zod";
import { formInt } from "@/lib/form-data";

/**
 * Schematy formularzy strony „Place” (#113). Komunikaty po polsku; `PlaceForm` powtarza je słowo
 * w słowo, żeby wyłączony JavaScript nie zmieniał tego, co widzi ośrodek. Unikalności nazwy tu nie
 * sprawdzamy — jej strażnikiem jest indeks `places_stable_name_key` (`placeErrorMessage`).
 */

/** Długość nazwy — odpowiednik `places_name_length` z migracji 20261201090000. */
export const PLACE_NAME_MAX = 60;
export const PLACE_NAME_EMPTY_MESSAGE = "Podaj nazwę placu";
export const PLACE_NAME_TOO_LONG_MESSAGE = `Nazwa placu może mieć najwyżej ${String(PLACE_NAME_MAX)} znaków`;

const nameField = z
  .string()
  .trim()
  .min(1, { error: PLACE_NAME_EMPTY_MESSAGE })
  .max(PLACE_NAME_MAX, { error: PLACE_NAME_TOO_LONG_MESSAGE });

const placeIdField = formInt("Nieprawidłowy plac").pipe(z.number().positive({ error: "Nieprawidłowy plac" }));

export const newPlaceSchema = z.object({ name: nameField });

export const renamePlaceSchema = z.object({ placeId: placeIdField, name: nameField });

/** Przełączenie flagi `active` — plac i docelowy stan. */
export const togglePlaceSchema = z.object({
  placeId: placeIdField,
  active: z.enum(["true", "false"]).transform((value) => value === "true"),
});
