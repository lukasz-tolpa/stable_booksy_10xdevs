import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { bookingDeciderRequest } from "@/lib/bookings/decider-request";
import { rejectBooking } from "@/lib/bookings/queries";
import { rejectionErrorMessage } from "@/lib/bookings/rejection";
import { rejectSchema } from "@/lib/bookings/schema";
import { backAfterPendingDecision } from "@/lib/bookings/stable-redirect";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { parseScheduleDate } from "@/lib/schedule/dates";

const SCOPE = "api:bookings/reject";

/**
 * Odrzucenie zapisu oczekującego przez właściciela albo instruktora z kontem na jego slocie (#125, #126, GLOSSARY
 * „Odrzucenie zapisu”) z „Zapisów do przyjęcia” albo (#128) z zapisów dnia przy slocie, z powodem, który jeździec
 * zobaczy. Reguły (kto decyduje — z sesji, powód 1–300 znaków, zapis oczekujący, slot się nie zaczął) pilnuje
 * funkcja bazy `reject_booking`; endpoint waliduje formularz tymi samymi regułami przed mutacją i tłumaczy kody bazy
 * na zamknięty zbiór polskich komunikatów. Wraca na zapisy dnia, gdy decyzja zapadła przy slocie, inaczej na
 * „Zapisy do przyjęcia” wołającego (`backAfterPendingDecision`).
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

  const caller = await bookingDeciderRequest(context, SCOPE, back);
  if (caller instanceof Response) {
    return caller;
  }

  let status: string;
  try {
    status = await rejectBooking(caller.supabase, parsed.data.bookingId, parsed.data.reason);
  } catch (error) {
    const message = rejectionErrorMessage(errorCode(error));
    // Odmowa reguły to projektowany UX; nieznany kod to awaria — do logu.
    if (message === rejectionErrorMessage(undefined)) {
      logError(SCOPE, error);
    }
    return back(message);
  }

  // Odczyt zwrotny: sukces tylko, gdy baza potwierdziła stan zapisu po zmianie.
  if (status !== "rejected") {
    logError(SCOPE, new Error(`Zapis ${String(parsed.data.bookingId)} po decyzji ma stan ${status}`));
    return back(rejectionErrorMessage(undefined));
  }

  return backAfterPendingDecision(context, day, { success: "odrzucenie" });
};
