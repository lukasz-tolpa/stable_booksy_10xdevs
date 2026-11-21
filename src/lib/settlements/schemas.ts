import { z } from "zod";
import { formInt } from "@/lib/form-data";
import { parseAmount, RATE_AMOUNT, type AmountLimits } from "@/lib/settlements/amounts";
import { RATE_FROM } from "@/lib/settlements/rates";

/**
 * Schematy formularzy rozliczeń (spec #93). Walidacja przed pierwszą mutacją — brak albo błędne pole
 * to komunikat tego pola, nie odmowa bazy (test-plan §6.4). Ośrodek nigdy nie przychodzi z formularza.
 */

/** Kwota z pola formularza na grosze (`parseAmount`) — komunikat pola, gdy zapis jest nie do przyjęcia. */
export function formAmount(limits: AmountLimits) {
  return z.string().transform((raw, ctx) => {
    const parsed = parseAmount(raw, limits);
    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: parsed.message, input: raw });
      return z.NEVER;
    }
    return parsed.grosze;
  });
}

export const RATE_FROM_MESSAGE = "Wybierz, od kiedy obowiązuje stawka";

/** Stawka ośrodka (#94): kwota i „od tego” albo „od następnego miesiąca” (miesiąc liczy serwer). */
export const stableRateSchema = z.object({
  amount: formAmount(RATE_AMOUNT),
  from: z.enum([RATE_FROM.current, RATE_FROM.next], { error: RATE_FROM_MESSAGE }),
});

/** Rodzaj zmiany stawki jeźdźca (#97) — wartość ukrytego pola `kind` formularza. */
export const RIDER_RATE_KIND = { set: "indywidualna", end: "osrodka" } as const;

const RIDER_RATE_KIND_MESSAGE = "Nieprawidłowa zmiana stawki";

/**
 * Stawka jeźdźca (#97): stawka indywidualna (kwota jak przy stawce ośrodka, także 0,00 zł) albo
 * „usuń stawkę indywidualną” — powrót do stawki ośrodka, bez kwoty. Oba „od tego / od następnego miesiąca”.
 */
export const riderRateSchema = z.discriminatedUnion(
  "kind",
  [
    stableRateSchema.extend({ kind: z.literal(RIDER_RATE_KIND.set) }),
    stableRateSchema.pick({ from: true }).extend({ kind: z.literal(RIDER_RATE_KIND.end) }),
  ],
  { error: RIDER_RATE_KIND_MESSAGE },
);

/** Zaplanowana zmiana stawki do usunięcia. */
export const rateIdSchema = z.object({
  rateId: formInt("Nieprawidłowa zmiana stawki").pipe(z.number().positive({ error: "Nieprawidłowa zmiana stawki" })),
});

export type StableRateInput = z.infer<typeof stableRateSchema>;
export type RiderRateInput = z.infer<typeof riderRateSchema>;
