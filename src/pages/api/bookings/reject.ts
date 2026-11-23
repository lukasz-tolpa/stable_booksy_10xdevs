import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { decisionRefusal, isDecisionConfirmed } from "@/lib/bookings/decisions";
import { rejectBooking } from "@/lib/bookings/queries";
import { rejectSchema } from "@/lib/bookings/schema";
import { backAfterPendingDecision } from "@/lib/bookings/stable-redirect";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { parseScheduleDate } from "@/lib/schedule/dates";
import { stableRequest } from "@/lib/stables/owner-request";
import type { BookingStatus } from "@/types";

export const prerender = false;

const SCOPE = "api:bookings/reject";

/**
 * Odrzucenie zapisu oczekującego przez właściciela albo instruktora z kontem na jego slocie (#125, #126, GLOSSARY
 * „Odrzucenie zapisu”) z „Zapisów do przyjęcia” albo (#128) z zapisów dnia przy slocie, z powodem, który jeździec
 * zobaczy. Reguły (kto decyduje — z sesji, powód 1–300 znaków, zapis oczekujący, slot się nie zaczął) pilnuje
 * funkcja bazy `reject_booking`; endpoint waliduje formularz tymi samymi regułami przed mutacją, tłumaczy kody bazy
 * na zamknięty zbiór polskich komunikatów (`decisionRefusal`) i ogłasza sukces dopiero, gdy baza oddała zapis
 * odrzucony. Wraca na zapisy dnia, gdy decyzja zapadła przy slocie, inaczej na „Zapisy do przyjęcia” wołającego
 * (`backAfterPendingDecision`).
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  // Decyzja przy slocie na zapisach dnia (#128) wraca na ten dzień; bez dnia — na „Zapisy do przyjęcia”.
  const day = parseScheduleDate(formValue(form, "day"));
  const back = (error: string) => backAfterPendingDecision(context, day, { error });

  const parsed = rejectSchema.safeParse({
    bookingId: formValue(form, "bookingId"),
    reason: formValue(form, "reason"),
  });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const caller = await stableRequest(context, SCOPE, back, "booking-decider");
  if (caller instanceof Response) {
    return caller;
  }

  let status: BookingStatus;
  try {
    status = await rejectBooking(caller.supabase, parsed.data.bookingId, parsed.data.reason);
  } catch (error) {
    const refusal = decisionRefusal("reject", errorCode(error));
    // Odmowa reguły to projektowany UX; nieznany kod to awaria — do logu.
    if (refusal.unexpected) {
      logError(SCOPE, error);
    }
    return back(refusal.message);
  }

  // Odczyt zwrotny: sukces tylko, gdy baza potwierdziła stan zapisu po zmianie.
  if (!isDecisionConfirmed("reject", status)) {
    logError(SCOPE, new Error(`Zapis ${String(parsed.data.bookingId)} po odrzuceniu ma stan ${status}`));
    return back(decisionRefusal("reject", undefined).message);
  }

  return backAfterPendingDecision(context, day, { success: "odrzucenie" });
};
