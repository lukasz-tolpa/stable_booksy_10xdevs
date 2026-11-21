import { z } from "zod";
import { formInt } from "@/lib/form-data";
import { EXTRA_COST_AMOUNT, parseAmount, RATE_AMOUNT, type AmountLimits } from "@/lib/settlements/amounts";
import { RATE_FROM } from "@/lib/settlements/rates";
import { parseRiderKey } from "@/lib/settlements/rider";

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

/** Nazwa kosztu dodatkowego: 1–80 znaków po przycięciu (CHECK `extra_costs_name_check`). */
export const COST_NAME_MAX = 80;

export const COST_TEXTS = {
  rider: "Wybierz jeźdźca",
  nameMissing: "Podaj nazwę kosztu",
  nameTooLong: `Nazwa kosztu może mieć najwyżej ${String(COST_NAME_MAX)} znaków`,
  costId: "Nieprawidłowy koszt dodatkowy",
} as const;

const costName = z
  .string()
  .trim()
  .min(1, { error: COST_TEXTS.nameMissing })
  // Znaki jak `char_length` w bazie (punkty kodowe), nie jednostki UTF-16.
  .refine((name) => Array.from(name).length <= COST_NAME_MAX, { error: COST_TEXTS.nameTooLong });

const costId = formInt(COST_TEXTS.costId).pipe(z.number().positive({ error: COST_TEXTS.costId }));

/** Jeździec (konto) z listy jeźdźców ośrodka; czy jest jeźdźcem ośrodka, pilnuje RLS. */
const costRider = z.string().transform((raw, ctx) => {
  const key = parseRiderKey(raw.trim());
  if (key === null) {
    ctx.addIssue({ code: "custom", message: COST_TEXTS.rider, input: raw });
    return z.NEVER;
  }
  return key;
});

/** „Dopisz koszt” (#96): jeździec, nazwa i kwota; miesiąc to oglądany miesiąc strony (`returnMonth`). */
export const extraCostSchema = z.object({
  rider: costRider,
  name: costName,
  amount: formAmount(EXTRA_COST_AMOUNT),
});

/** „Popraw” koszt dodatkowy: nowa nazwa i kwota (jeździec i miesiąc kosztu się nie zmieniają). */
export const extraCostUpdateSchema = z.object({
  costId,
  name: costName,
  amount: formAmount(EXTRA_COST_AMOUNT),
});

/** „Usuń” koszt dodatkowy. */
export const costIdSchema = z.object({ costId });

export type ExtraCostInput = z.infer<typeof extraCostSchema>;
export type RiderRateInput = z.infer<typeof riderRateSchema>;
