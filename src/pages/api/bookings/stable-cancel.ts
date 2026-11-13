import type { APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { cancelBookingAsStable, getStableBooking } from "@/lib/bookings/queries";
import { cancelSchema } from "@/lib/bookings/schema";
import { hasSlotStarted } from "@/lib/bookings/slots";
import {
  STABLE_BOOKING_NOT_FOUND,
  STABLE_CANCEL_FAILED,
  STABLE_CANCEL_SLOT_STARTED,
} from "@/lib/bookings/stable-errors";
import { backToDayBookings } from "@/lib/bookings/stable-redirect";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { parseScheduleDate } from "@/lib/schedule/dates";
import { getOwnedStableId } from "@/lib/stables/queries";
import { createClient } from "@/lib/supabase";

/**
 * Odwołanie zapisu przez ośrodek (#42): dowolny aktywny zapis własnego grafiku, przed jego
 * terminem, bez powodu. Krok potwierdzenia jest na liście dnia; tu przychodzi już decyzja.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  // Tylko cel powrotu; dzień i godzinę zapisu do progu bierzemy z bazy.
  const formDay = parseScheduleDate(formValue(form, "day"));

  const parsed = cancelSchema.safeParse({ bookingId: formValue(form, "bookingId") });
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

    // Ten sam próg co przy odwołaniu przez jeźdźca. Baza pozwala na odwołanie także wstecz,
    // więc to jedyna linia obrony.
    if (hasSlotStarted(booking.day, booking.hour)) {
      return backToDayBookings(context, booking.day, { error: STABLE_CANCEL_SLOT_STARTED });
    }

    // `false` = wyścig (jeździec odwołał w międzyczasie) — z punktu widzenia ośrodka „nie znaleziono".
    const cancelled = await cancelBookingAsStable(supabase, booking);
    if (!cancelled) {
      return backToDayBookings(context, booking.day, { error: STABLE_BOOKING_NOT_FOUND });
    }

    return backToDayBookings(context, booking.day, { success: "odwolanie" });
  } catch (error) {
    // Odmowy reguł są rozstrzygane wyżej; tu trafia wyłącznie awaria zależności.
    logError("api:bookings/stable-cancel", error);
    return backToDayBookings(context, formDay, { error: STABLE_CANCEL_FAILED });
  }
};
