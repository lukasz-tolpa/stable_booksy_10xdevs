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

/** Zaplanowana zmiana stawki do usunięcia. */
export const rateIdSchema = z.object({
  rateId: formInt("Nieprawidłowa zmiana stawki").pipe(z.number().positive({ error: "Nieprawidłowa zmiana stawki" })),
});

export type StableRateInput = z.infer<typeof stableRateSchema>;
