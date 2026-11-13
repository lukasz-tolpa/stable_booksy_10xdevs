import type { APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { assignHorse, getStableBooking } from "@/lib/bookings/queries";
import { assignHorseSchema } from "@/lib/bookings/schema";
import {
  horseAssignmentErrorMessage,
  isHorseAssignmentRefusal,
  STABLE_BOOKING_NOT_FOUND,
} from "@/lib/bookings/stable-errors";
import { backToDayBookings } from "@/lib/bookings/stable-redirect";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { parseScheduleDate } from "@/lib/schedule/dates";
import { getOwnedStableId } from "@/lib/stables/queries";
import { createClient } from "@/lib/supabase";

/**
 * Przydział, zmiana albo cofnięcie konia przez ośrodek (#42). Bez progu czasu — przydział
 * po terminie jazdy jest dozwolony (uzupełnienie statystyk). Reguły (koń pracuje tego dnia,
 * jeden zapis konia w godzinie, tylko ośrodek) pilnuje baza.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  // Tylko cel powrotu; dzień zapisu do decyzji bierzemy z bazy.
  const formDay = parseScheduleDate(formValue(form, "day"));

  const parsed = assignHorseSchema.safeParse({
    bookingId: formValue(form, "bookingId"),
    horseId: formValue(form, "horseId"),
  });
  if (!parsed.success) {
    return backToDayBookings(context, formDay, { error: firstErrorMessage(parsed.error) });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToDayBookings(context, formDay, { error: "Supabase nie jest skonfigurowany" });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(SIGN_IN_ROUTE);
  }

  try {
    const stableId = await getOwnedStableId(supabase, user.id);
    const booking = stableId === null ? null : await getStableBooking(supabase, parsed.data.bookingId, stableId);

    if (booking?.status !== "active") {
      return backToDayBookings(context, formDay, { error: STABLE_BOOKING_NOT_FOUND });
    }

    const assigned = await assignHorse(supabase, booking, parsed.data.horseId);
    if (!assigned) {
      return backToDayBookings(context, booking.day, { error: STABLE_BOOKING_NOT_FOUND });
    }

    return backToDayBookings(context, booking.day, { success: "przydzial" });
  } catch (error) {
    // Guardraile żyją w bazie; tutaj tłumaczymy ich kody na komunikat. Odmowa reguły to
    // decyzja ośrodka, wszystko inne to awaria — ta trafia do logu.
    const code = errorCode(error);
    if (!isHorseAssignmentRefusal(code)) {
      logError("api:bookings/assign-horse", error);
    }
    return backToDayBookings(context, formDay, { error: horseAssignmentErrorMessage(code) });
  }
};
