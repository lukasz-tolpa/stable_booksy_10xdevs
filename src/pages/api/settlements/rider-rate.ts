import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { isExpectedRateRefusal, RATE_SAVE_FAILED, riderRateSaveErrorMessage } from "@/lib/settlements/errors";
import { ownerRequest } from "@/lib/stables/owner-request";
import { listBoardingHorses } from "@/lib/boarding/queries";
import { saveRate } from "@/lib/settlements/queries";
import { backToRiderSettlement, backToSettlements, returnMonth, RIDER_PARAM } from "@/lib/settlements/redirect";
import { parseRiderKey } from "@/lib/settlements/rider";
import { riderRateStart } from "@/lib/settlements/rider-rate";
import { RIDER_RATE_KIND, riderRateSchema } from "@/lib/settlements/schemas";
import { SETTLEMENT_TEXTS } from "@/lib/settlements/texts";

export const prerender = false;

const SCOPE = "api:settlements/rider-rate";

/**
 * Stawka jeźdźca (#97): stawka indywidualna albo „usuń stawkę indywidualną” (zmiana bez kwoty — powrót
 * do stawki ośrodka), „od tego” albo „od następnego miesiąca”; drugi zapis na ten sam miesiąc nadpisuje.
 * Miesiąc „od” liczy serwer z dzisiejszej daty; reguły czasu pilnuje baza (SB026), jeźdźca spoza ośrodka
 * odrzuca RLS (42501). Powrót na rozliczenie jeźdźca tego samego miesiąca; błędny jeździec — na listę.
 * Rodzaj stawki indywidualnej to rodzaj jeźdźca w miesiącu, od którego stawka obowiązuje (`riderRateStart`,
 * #117/#112 — pensjonariusz: treningowa), liczony z pobytów jego koni tak jak na stronie, nie z formularza.
 */
export const POST: APIRoute = async (context) => {
  const now = new Date();
  const form = await context.request.formData();
  const month = returnMonth(form, now);
  const riderKey = parseRiderKey(formValue(form, RIDER_PARAM));
  if (riderKey === null) {
    return backToSettlements(context, month, SETTLEMENT_TEXTS.riderRate.unknownRider);
  }
  const back = (error?: string) => backToRiderSettlement(context, riderKey, month, error);

  const parsed = riderRateSchema.safeParse({
    kind: formValue(form, "kind"),
    amount: formValue(form, "amount"),
    from: formValue(form, "from"),
  });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const owner = await ownerRequest(context, SCOPE, back);
  if (owner instanceof Response) {
    return owner;
  }

  let boarding;
  try {
    boarding = await listBoardingHorses(owner.supabase, { stableId: owner.stableId });
  } catch (error) {
    logError(SCOPE, error);
    return back(RATE_SAVE_FAILED);
  }

  const { kind, fromMonth } = riderRateStart(boarding, riderKey, parsed.data.from, now);
  const { data, error } = await saveRate(owner.supabase, {
    stableId: owner.stableId,
    riderId: riderKey,
    kind,
    fromMonth,
    amount: parsed.data.kind === RIDER_RATE_KIND.set ? parsed.data.amount : null,
  });

  if (error) {
    const code = errorCode(error);
    if (!isExpectedRateRefusal(code)) {
      logError(SCOPE, error);
    }
    return back(riderRateSaveErrorMessage(code));
  }
  if (!data) {
    logError(SCOPE, new Error("Zapis stawki jeźdźca nie zwrócił wiersza"));
    return back(RATE_SAVE_FAILED);
  }

  return back();
};
