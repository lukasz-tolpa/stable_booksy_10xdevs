import { z } from "zod";
import { formValue, formValues } from "@/lib/form-data";
import { isValidIsoDate } from "@/lib/schedule/dates";

const SEATS_MESSAGE = "Limit miejsc musi być liczbą całkowitą, zero lub więcej";
/** Górna granica kolumny `schedule_slots.seats` (smallint); realnie ogranicza ją liczba koni. */
const MAX_SEATS = 32767;

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
    instructorIds: z.array(z.coerce.number().int().positive()),
    // Siatka instruktor × godzina. Godzina bez wpisu ma w bazie limit zero, więc lista
    // nie musi być pełna; spójność z zakresem dnia sprawdza `public.save_schedule_day`.
    seats: z.array(
      z.object({
        instructorId: z.coerce.number().int().positive(),
        hour: z.coerce.number().int().min(0).max(23),
        seats: z.coerce
          .number({ error: SEATS_MESSAGE })
          .int({ error: SEATS_MESSAGE })
          .min(0, { error: SEATS_MESSAGE })
          .max(MAX_SEATS, { error: SEATS_MESSAGE }),
      }),
    ),
  })
  .refine((data) => data.closeHour > data.openHour, {
    error: "Godzina zamknięcia musi być późniejsza niż godzina otwarcia",
    path: ["closeHour"],
  });

export type ScheduleDayInput = z.infer<typeof scheduleDaySchema>;

/** Nazwa pola limitu miejsc w formularzu grafiku: jedno pole na instruktora i godzinę. */
export function seatFieldName(instructorId: number, hour: number): string {
  return `seats.${String(instructorId)}.${String(hour)}`;
}

const SEAT_FIELD = /^seats\.(\d+)\.(\d+)$/;

/**
 * Formularz grafiku dnia → dane do zapisu. Limity instruktora, którego nie wskazano w tym
 * dniu, są pomijane (odznaczony instruktor nie wystawia miejsc); puste pole limitu to zero.
 */
export function parseScheduleDayForm(form: FormData) {
  const instructorIds = formValues(form, "instructorIds");
  const seats: { instructorId: string; hour: string; seats: string }[] = [];

  for (const [name, value] of form.entries()) {
    const match = SEAT_FIELD.exec(name);
    if (!match || typeof value !== "string" || !instructorIds.includes(match[1])) {
      continue;
    }
    seats.push({ instructorId: match[1], hour: match[2], seats: value.trim() === "" ? "0" : value });
  }

  return scheduleDaySchema.safeParse({
    day: formValue(form, "day"),
    openHour: formValue(form, "openHour"),
    closeHour: formValue(form, "closeHour"),
    horseIds: formValues(form, "horseIds"),
    instructorIds,
    seats,
  });
}
