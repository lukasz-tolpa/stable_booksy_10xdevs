import { formatMoney } from "@/lib/format";

/**
 * Kwoty rozliczeń (spec #93): grosze jako liczba całkowita — nigdy liczba zmiennoprzecinkowa.
 * Tu jest odczyt pola formularza; zapis kwoty w interfejsie to `formatMoney` z `@/lib/format`.
 */

/** Granice kwoty jednego rodzaju (w groszach, włącznie) i jego nazwa w komunikacie. */
export interface AmountLimits {
  /** Np. `Stawka` — „Stawka może wynosić najwyżej 10 000,00 zł”. */
  name: string;
  min: number;
  max: number;
}

/** Stawka: 0,00–10 000,00 zł (CHECK `rates_amount_range_check`). */
export const RATE_AMOUNT: AmountLimits = { name: "Stawka", min: 0, max: 1_000_000 };

/** Koszt dodatkowy (#96): 0,01–100 000,00 zł (CHECK `extra_costs_amount_range_check`). */
export const EXTRA_COST_AMOUNT: AmountLimits = { name: "Koszt", min: 1, max: 10_000_000 };

export type ParsedAmount = { ok: true; grosze: number } | { ok: false; message: string };

export const AMOUNT_TEXTS = {
  missing: "Podaj kwotę",
  invalid: "Podaj kwotę w złotych, np. 120 albo 120,50",
  tooPrecise: "Kwota może mieć najwyżej dwa miejsca po przecinku",
  negative: "Kwota nie może być ujemna",
} as const;

/** Spacje, które wolno wpisać między grupami tysięcy (zwykła, twarda, wąska twarda). */
const SPACE = "[ \\u00a0\\u202f]";
/** Złote: same cyfry albo grupy po trzy cyfry oddzielone spacją; potem do dwóch miejsc po przecinku. */
const AMOUNT = new RegExp(`^(\\d+|\\d{1,3}(?:${SPACE}\\d{3})+)(?:[.,](\\d{1,2}))?$`);
const TOO_PRECISE = new RegExp(`^(\\d+|\\d{1,3}(?:${SPACE}\\d{3})+)[.,]\\d{3,}$`);
/** Więcej cyfr złotych niż ma sens dla limitu — bez ryzyka utraty dokładności `Number`. */
const MAX_ZLOTY_DIGITS = 9;

/**
 * Kwota z pola formularza na grosze: „120”, „120,5”, „120,50”, „120.50”, „1 250,00”. Brak kwoty,
 * trzy miejsca po przecinku, wartość ujemna, przekroczenie granic i inny zapis — polski komunikat.
 */
export function parseAmount(raw: string, limits: AmountLimits): ParsedAmount {
  const text = raw.trim();
  if (text === "") {
    return { ok: false, message: AMOUNT_TEXTS.missing };
  }
  if (text.startsWith("-") && (AMOUNT.test(text.slice(1)) || TOO_PRECISE.test(text.slice(1)))) {
    return { ok: false, message: AMOUNT_TEXTS.negative };
  }
  if (TOO_PRECISE.test(text)) {
    return { ok: false, message: AMOUNT_TEXTS.tooPrecise };
  }
  const match = AMOUNT.exec(text);
  if (!match) {
    return { ok: false, message: AMOUNT_TEXTS.invalid };
  }

  const zloty = match[1].replace(new RegExp(SPACE, "g"), "").replace(/^0+(?=\d)/, "");
  const fraction = (match.at(2) ?? "").padEnd(2, "0");
  const grosze = zloty.length > MAX_ZLOTY_DIGITS ? Infinity : Number(zloty) * 100 + Number(fraction);

  if (grosze > limits.max) {
    return { ok: false, message: `${limits.name} może wynosić najwyżej ${formatMoney(limits.max)}` };
  }
  if (grosze < limits.min) {
    return { ok: false, message: `${limits.name} musi wynosić co najmniej ${formatMoney(limits.min)}` };
  }
  return { ok: true, grosze };
}
