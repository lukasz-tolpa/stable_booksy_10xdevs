import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { bookingDeciderRequest } from "@/lib/bookings/decider-request";
import { acceptanceErrorMessage } from "@/lib/bookings/acceptance";
import { acceptBooking } from "@/lib/bookings/queries";
import { acceptSchema } from "@/lib/bookings/schema";
import { backAfterPendingDecision } from "@/lib/bookings/stable-redirect";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { parseScheduleDate } from "@/lib/schedule/dates";

const SCOPE = "api:bookings/accept";

/**
 * Przyjęcie zapisu oczekującego przez właściciela albo instruktora z kontem na jego slocie (#124, #126, GLOSSARY
 * „Przyjęcie zapisu”) z „Zapisów do przyjęcia” albo (#128) z zapisów dnia przy slocie. Reguły (kto decyduje —
 * z sesji, zapis oczekujący, slot się nie zaczął, limit miejsc — także przy dwóch równoczesnych przyjęciach)
 * pilnuje funkcja bazy `accept_booking`; endpoint waliduje formularz przed mutacją i tłumaczy jej kody na zamknięty
 * zbiór polskich komunikatów. Wraca na zapisy dnia, gdy decyzja zapadła przy slocie, inaczej na „Zapisy do
 * przyjęcia” wołającego (`backAfterPendingDecision`).
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  // Decyzja przy slocie na zapisach dnia (#128) wraca na ten dzień; bez dnia — na „Zapisy do przyjęcia”.
  const day = parseScheduleDate(formValue(form, "day"));
  const back = (error: string) => backAfterPendingDecision(context, day, { error });

  const parsed = acceptSchema.safeParse({ bookingId: formValue(form, "bookingId") });
  if (!parsed.success) {
    return back(firstErrorMessage(parsed.error));
  }

  const caller = await bookingDeciderRequest(context, SCOPE, back);
  if (caller instanceof Response) {
    return caller;
  }

  try {
    await acceptBooking(caller.supabase, parsed.data.bookingId);
  } catch (error) {
    const message = acceptanceErrorMessage(errorCode(error));
    // Odmowa reguły to projektowany UX; nieznany kod to awaria — do logu.
    if (message === acceptanceErrorMessage(undefined)) {
      logError(SCOPE, error);
    }
    return back(message);
  }

  return backAfterPendingDecision(context, day, { success: "przyjecie" });
};
