import { z } from "zod";
import { BOARDING_FORM_INVALID } from "@/lib/boarding/errors";
import { formInt } from "@/lib/form-data";
import { isValidIsoDate } from "@/lib/schedule/dates";

/**
 * Schematy formularzy koni pensjonatowych i pobytów (#114). Walidacja przed pierwszą mutacją — brak albo
 * błędne pole to komunikat tego pola, nie odmowa bazy (test-plan §6.4). Ośrodek i strona (ośrodek albo
 * pensjonariusz) nigdy nie przychodzą z formularza — bierze je baza z sesji.
 */

export const BOARDING_TEXTS = {
  nameMissing: "Podaj imię konia",
  emailInvalid: "Podaj poprawny adres e-mail konta pensjonariusza",
  arrivalMissing: "Podaj dzień przyjazdu",
  departureMissing: "Podaj dzień wyjazdu",
  formInvalid: BOARDING_FORM_INVALID,
} as const;

function isoDay(message: string) {
  return z.string().trim().refine(isValidIsoDate, { error: message });
}

const positiveId = formInt(BOARDING_TEXTS.formInvalid).pipe(z.number().positive({ error: BOARDING_TEXTS.formInvalid }));

/** „Dodaj konia pensjonatowego”: imię, adres e-mail konta pensjonariusza (jak zapisuje go GoTrue) i dzień przyjazdu. */
export const boardingHorseSchema = z.object({
  name: z.string().trim().min(1, { error: BOARDING_TEXTS.nameMissing }),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: BOARDING_TEXTS.emailInvalid })),
  arrival: isoDay(BOARDING_TEXTS.arrivalMissing),
});

/** „Nowy pobyt” konia, który wrócił do ośrodka. */
export const newStaySchema = z.object({
  horseId: positiveId,
  arrival: isoDay(BOARDING_TEXTS.arrivalMissing),
});

/** Dzień wyjazdu pobytu — ośrodek i pensjonariusz. */
export const departureSchema = z.object({
  stayId: positiveId,
  departure: isoDay(BOARDING_TEXTS.departureMissing),
});
