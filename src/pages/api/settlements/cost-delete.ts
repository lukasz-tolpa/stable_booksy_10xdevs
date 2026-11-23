import { firstErrorMessage } from "@/lib/auth/schemas";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { COST_DELETE_FAILED, COST_NOT_FOUND } from "@/lib/settlements/errors";
import { ownerRequest } from "@/lib/stables/owner-request";
import { deleteCost } from "@/lib/settlements/queries";
import { costFormEndpoint } from "@/lib/settlements/redirect";
import { costIdSchema } from "@/lib/settlements/schemas";

export const prerender = false;

const SCOPE = "api:settlements/cost-delete";

/**
 * „Usuń” koszt dodatkowy (#96), także w minionym miesiącu. Cudzy albo już usunięty koszt to zero
 * usuniętych wierszy. Powrót do rozliczenia jeźdźca tego samego miesiąca; formularz bez jeźdźca
 * (spreparowany) odrzuca `costFormEndpoint`, nic nie zapisując.
 */
export const POST = costFormEndpoint(async (context, { form, back }) => {
  const parsed = costIdSchema.safeParse({ costId: formValue(form, "costId") });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const owner = await ownerRequest(context, SCOPE, back);
  if (owner instanceof Response) {
    return owner;
  }

  const { data, error } = await deleteCost(owner.supabase, owner.stableId, parsed.data.costId);

  if (error) {
    // Usunięcie nie ma reguł bazy, którymi by odmówiła — każdy błąd to awaria.
    logError(SCOPE, error);
    return back(COST_DELETE_FAILED);
  }
  if (data.length === 0) {
    return back(COST_NOT_FOUND);
  }

  return back();
});
