import { z } from "zod";
import { isValidIsoDate } from "@/lib/schedule/dates";

/**
 * Liczba całkowita z pola formularza. Przyjmuje wyłącznie ciąg cyfr (po przycięciu
 * białych znaków) — `z.coerce.number()` zamieniałby brakujące lub puste pole na `0`,
 * przez co brak `hour` przechodził walidację i odbijał się dopiero od bazy
 * z mylącym komunikatem o godzinach pracy. Brak pola ma być błędem walidacji
 * z komunikatem tego pola (walidacja przed pierwszą mutacją, lekcja S-02).
 */
function formInt(message: string) {
  return z.string().trim().regex(/^\d+$/, { error: message }).transform(Number);
}

/**
 * Formularz zapisu na jazdę. Ograniczenie godziny odpowiada check constraintowi
 * `bookings_hour_check` z migracji F-01 — walidacja tutaj daje komunikat po polsku
 * zamiast surowego błędu Postgresa. Zakres pracy ośrodka, limit miejsc i jeden zapis na godzinę pilnuje
 * baza (23514/SB009/23505); guard dat przeszłych i minionych godzin robi endpoint.
 */
export const bookingSchema = z.object({
  stableId: formInt("Nieprawidłowy ośrodek").pipe(z.number().positive({ error: "Nieprawidłowy ośrodek" })),
  day: z.string().refine(isValidIsoDate, { error: "Nieprawidłowa data" }),
  instructorId: formInt("Nieprawidłowy instruktor").pipe(z.number().positive({ error: "Nieprawidłowy instruktor" })),
  hour: formInt("Nieprawidłowa godzina").pipe(z.number().max(23, { error: "Nieprawidłowa godzina" })),
});

export type BookingInput = z.infer<typeof bookingSchema>;

/** Formularz odwołania zapisu (S-06) — jedyne pole to identyfikator zapisu. */
export const cancelSchema = z.object({
  bookingId: formInt("Nieprawidłowy zapis").pipe(z.number().positive({ error: "Nieprawidłowy zapis" })),
});

export type CancelInput = z.infer<typeof cancelSchema>;

/**
 * Formularz przydziału konia przez ośrodek (#42). Pusty wybór („bez konia") cofa przydział.
 * Czy koń pracuje tego dnia i czy jest wolny w tej godzinie, rozstrzyga baza (23503/23505).
 */
export const assignHorseSchema = z.object({
  bookingId: formInt("Nieprawidłowy zapis").pipe(z.number().positive({ error: "Nieprawidłowy zapis" })),
  horseId: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[1-9]\d*$/.test(value), { error: "Nieprawidłowy koń" })
    .transform((value) => (value === "" ? null : Number(value))),
});

export type AssignHorseInput = z.infer<typeof assignHorseSchema>;
