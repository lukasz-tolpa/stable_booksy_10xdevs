import { z } from "zod";
import { isValidIsoDate } from "@/lib/schedule/dates";

/**
 * Formularz grafiku dnia. Ograniczenia godzin odpowiadają check constraintom
 * `schedule_days_open_hour_check`, `schedule_days_close_hour_check` i
 * `schedule_days_hours_order_check` z migracji F-01 — walidacja tutaj daje komunikat
 * po polsku zamiast surowego błędu Postgresa.
 *
 * Godziny to przedział półotwarty [open_hour, close_hour): zakres 10-16 daje jazdy
 * o 10, 11, 12, 13, 14 i 15.
 */
export const scheduleDaySchema = z
  .object({
    day: z.string().refine(isValidIsoDate, { error: "Nieprawidłowa data" }),
    openHour: z.coerce.number().int().min(0, { error: "Godzina otwarcia musi być z zakresu 0-23" }).max(23, {
      error: "Godzina otwarcia musi być z zakresu 0-23",
    }),
    closeHour: z.coerce.number().int().min(1, { error: "Godzina zamknięcia musi być z zakresu 1-24" }).max(24, {
      error: "Godzina zamknięcia musi być z zakresu 1-24",
    }),
    // Pusta lista jest dozwolona: dzień z godzinami, ale bez koni to legalny stan -
    // jeździec zobaczy wtedy zero wolnych slotów, co jest poprawne.
    horseIds: z.array(z.coerce.number().int().positive()),
  })
  .refine((data) => data.closeHour > data.openHour, {
    error: "Godzina zamknięcia musi być późniejsza niż godzina otwarcia",
    path: ["closeHour"],
  });

export type ScheduleDayInput = z.infer<typeof scheduleDaySchema>;
