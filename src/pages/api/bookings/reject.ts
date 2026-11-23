import type { APIRoute } from "astro";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { bookingDeciderRequest } from "@/lib/bookings/decider-request";
import { rejectBooking } from "@/lib/bookings/queries";
import { rejectionErrorMessage } from "@/lib/bookings/rejection";
import { rejectSchema } from "@/lib/bookings/schema";
import { backToPendingBookings } from "@/lib/bookings/stable-redirect";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";

const SCOPE = "api:bookings/reject";

/**
 * Odrzucenie zapisu oczekującego przez właściciela albo instruktora z kontem na jego slocie (#125, #126, GLOSSARY
 * „Odrzucenie zapisu”) z „Zapisów do przyjęcia”, z powodem, który jeździec zobaczy. Reguły (kto decyduje — z sesji,
 * powód 1–300 znaków, zapis oczekujący, slot się nie zaczął) pilnuje funkcja bazy `reject_booking`; endpoint
 * waliduje formularz tymi samymi regułami przed mutacją i tłumaczy kody bazy na zamknięty zbiór polskich
 * komunikatów. Wraca na „Zapisy do przyjęcia” wołającego (`backToPendingBookings`).
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const back = (error: string) => backToPendingBookings(context, { error });

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

  try {
    await rejectBooking(caller.supabase, parsed.data.bookingId, parsed.data.reason);
  } catch (error) {
    const message = rejectionErrorMessage(errorCode(error));
    // Odmowa reguły to projektowany UX; nieznany kod to awaria — do logu.
    if (message === rejectionErrorMessage(undefined)) {
      logError(SCOPE, error);
    }
    return back(message);
  }

  return backToPendingBookings(context, { success: "odrzucenie" });
};
