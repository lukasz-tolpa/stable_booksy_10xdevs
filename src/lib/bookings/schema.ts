import { z } from "zod";
import {
  REJECTION_REASON_MAX,
  REJECT_NO_REASON,
  REJECT_REASON_TOO_LONG,
  rejectionErrorMessage,
} from "@/lib/bookings/rejection";
import { formInt } from "@/lib/form-data";
import { isValidIsoDate } from "@/lib/schedule/dates";

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
  // Koń pensjonatowy wybrany przy zapisie na slot treningowy (#115); pusty albo brak — baza przydzieli jedynego
  // konia pensjonariusza. Czy koń jest jego i stoi w ośrodku w dniu jazdy, rozstrzyga baza (SB051).
  horseId: z
    .string()
    .trim()
    .refine((value) => value === "" || /^[1-9]\d*$/.test(value), { error: "Nieprawidłowy koń" })
    .transform((value) => (value === "" ? undefined : Number(value)))
    .optional(),
});

export type BookingInput = z.infer<typeof bookingSchema>;

/** Formularz odwołania zapisu (S-06) — jedyne pole to identyfikator zapisu. */
export const cancelSchema = z.object({
  bookingId: formInt("Nieprawidłowy zapis").pipe(z.number().positive({ error: "Nieprawidłowy zapis" })),
});

export type CancelInput = z.infer<typeof cancelSchema>;

/** Formularz przyjęcia zapisu przez ośrodek (#124) — sam identyfikator zapisu, jak przy odwołaniu. */
export const acceptSchema = cancelSchema;

/**
 * Formularz odrzucenia zapisu przez ośrodek (#125): zapis i powód, który jeździec zobaczy — przycięty,
 * 1–`REJECTION_REASON_MAX` znaków. Te same reguły i komunikaty co w bazie (SB070/SB071), sprawdzane przed mutacją.
 */
export const rejectSchema = z.object({
  bookingId: formInt("Nieprawidłowy zapis").pipe(z.number().positive({ error: "Nieprawidłowy zapis" })),
  reason: z
    .string({ error: rejectionErrorMessage(REJECT_NO_REASON) })
    .trim()
    .min(1, { error: rejectionErrorMessage(REJECT_NO_REASON) })
    .max(REJECTION_REASON_MAX, { error: rejectionErrorMessage(REJECT_REASON_TOO_LONG) }),
});

export type RejectInput = z.infer<typeof rejectSchema>;

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
