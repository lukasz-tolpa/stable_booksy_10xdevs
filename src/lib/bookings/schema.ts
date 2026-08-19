import { z } from "zod";
import { isValidIsoDate } from "@/lib/schedule/dates";

/**
 * Formularz zapisu na jazdę. Ograniczenie godziny odpowiada check constraintowi
 * `bookings_hour_check` z migracji F-01 — walidacja tutaj daje komunikat po polsku
 * zamiast surowego błędu Postgresa. Zakres pracy ośrodka i zajętość slotu pilnuje
 * baza (23514/23505); guard dat przeszłych i minionych godzin robi endpoint.
 */
export const bookingSchema = z.object({
  stableId: z.coerce.number().int().positive({ error: "Nieprawidłowy ośrodek" }),
  day: z.string().refine(isValidIsoDate, { error: "Nieprawidłowa data" }),
  horseId: z.coerce.number().int().positive({ error: "Nieprawidłowy koń" }),
  hour: z.coerce.number().int().min(0, { error: "Nieprawidłowa godzina" }).max(23, { error: "Nieprawidłowa godzina" }),
});

export type BookingInput = z.infer<typeof bookingSchema>;
