import { z } from "zod";
import { formValue, formValues } from "@/lib/form-data";
import { isValidIsoDate } from "@/lib/schedule/dates";

const SEATS_MESSAGE = "Limit miejsc musi być liczbą całkowitą, zero lub więcej";
/** Górna granica kolumny `schedule_slots.seats` (smallint); realnie ogranicza ją liczba koni. */
const MAX_SEATS = 32767;

const OPEN_HOUR_MESSAGE = "Godzina otwarcia musi być z zakresu 0-23";
const CLOSE_HOUR_MESSAGE = "Godzina zamknięcia musi być z zakresu 1-24";
const HOURS_ORDER_MESSAGE = "Godzina zamknięcia musi być późniejsza niż godzina otwarcia";

/** Godziny pracy: wspólne dla zapisu i walidacji po stronie klienta, żeby komunikaty brzmiały tak samo. */
const hourFields = {
  openHour: z.coerce.number().int().min(0, { error: OPEN_HOUR_MESSAGE }).max(23, { error: OPEN_HOUR_MESSAGE }),
  closeHour: z.coerce.number().int().min(1, { error: CLOSE_HOUR_MESSAGE }).max(24, { error: CLOSE_HOUR_MESSAGE }),
};

const hoursOrder = [
  (data: { openHour: number; closeHour: number }) => data.closeHour > data.openHour,
  { error: HOURS_ORDER_MESSAGE, path: ["closeHour"] },
] as const;

const scheduleHoursSchema = z.object(hourFields).refine(...hoursOrder);

/**
 * Walidacja godzin pracy po stronie klienta: pierwszy komunikat schematu grafiku albo `null`.
 * Ten sam schemat co na serwerze, więc komunikaty brzmią tak samo (pułapka z `test-plan.md` §6.3).
 * Niewybrana godzina (`""`) to brak godziny — schemat zrzutowałby ją na 0.
 */
export function hoursError(openHour: string, closeHour: string): string | null {
  if (openHour === "") {
    return OPEN_HOUR_MESSAGE;
  }

  if (closeHour === "") {
    return CLOSE_HOUR_MESSAGE;
  }

  const result = scheduleHoursSchema.safeParse({ openHour, closeHour });

  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

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
    ...hourFields,
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
  .refine(...hoursOrder);

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
