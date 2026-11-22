import { z } from "zod";
import { BOARDING_FORM_INVALID } from "@/lib/boarding/errors";
import { formInt } from "@/lib/form-data";
import { isValidIsoDate } from "@/lib/schedule/dates";
import { BOARDING_FEE_AMOUNT } from "@/lib/settlements/amounts";
import { RATE_FROM } from "@/lib/settlements/rates";
import { formAmount } from "@/lib/settlements/schemas";

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
  feeFromMissing: "Wybierz, od kiedy obowiązuje opłata",
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

/**
 * Opłata za pensjonat konia (#117), wzorem stawki ośrodka: koń (ukryte pole), kwota 0,00–100 000,00 zł
 * i „od tego” albo „od następnego miesiąca” (miesiąc liczy serwer; regułę czasu pilnuje baza, SB060).
 */
export const boardingFeeSchema = z.object({
  horseId: positiveId,
  amount: formAmount(BOARDING_FEE_AMOUNT),
  from: z.enum([RATE_FROM.current, RATE_FROM.next], { error: BOARDING_TEXTS.feeFromMissing }),
});

/** Usunięcie zaplanowanej zmiany opłaty za pensjonat. */
export const boardingFeeIdSchema = z.object({ feeId: positiveId });
