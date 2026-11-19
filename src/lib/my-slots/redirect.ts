import type { APIContext } from "astro";
import { INSTRUCTOR_HOME_ROUTE } from "@/lib/auth/roles";

/** Potwierdzenie przydziału konia w „Moje sloty” (`sukces=przydzial`). */
export const MY_SLOTS_HORSE_ASSIGNED = "Przydział konia zapisany.";

/** Potwierdzenie na „Moje sloty” dla parametru `sukces=`; `null` — brak albo nieznana wartość. */
export function mySlotsSuccessMessage(value: string | null): string | null {
  return value === "przydzial" ? MY_SLOTS_HORSE_ASSIGNED : null;
}

/** Powrót na „Moje sloty” z wynikiem przydziału konia przez instruktora (#81). */
export function backToMySlots(context: APIContext, outcome: { error: string } | { success: "przydzial" }) {
  const params = new URLSearchParams("error" in outcome ? { error: outcome.error } : { sukces: outcome.success });
  return context.redirect(`${INSTRUCTOR_HOME_ROUTE}?${params.toString()}`);
}
