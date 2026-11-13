import type { APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { cancelBookingAsStable, getStableBooking } from "@/lib/bookings/queries";
import { cancelSchema } from "@/lib/bookings/schema";
import { hasSlotStarted } from "@/lib/bookings/slots";
import { backToDayBookings } from "@/lib/bookings/stable-redirect";
import { formValue } from "@/lib/form-data";
import { parseScheduleDate } from "@/lib/schedule/dates";
import { getOwnedStableId } from "@/lib/stables/queries";
import { createClient } from "@/lib/supabase";

const NOT_FOUND_MESSAGE = "Nie znaleziono aktywnego zapisu w Twoim grafiku.";

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
      return backToDayBookings(context, formDay, { error: NOT_FOUND_MESSAGE });
    }

    // Ten sam próg co przy odwołaniu przez jeźdźca. Baza pozwala na odwołanie także wstecz,
    // więc to jedyna linia obrony.
    if (hasSlotStarted(booking.day, booking.hour)) {
      return backToDayBookings(context, booking.day, { error: "Nie można odwołać jazdy, która już się zaczęła." });
    }

    // `false` = wyścig (jeździec odwołał w międzyczasie) — z punktu widzenia ośrodka „nie znaleziono".
    const cancelled = await cancelBookingAsStable(supabase, parsed.data.bookingId);
    if (!cancelled) {
      return backToDayBookings(context, booking.day, { error: NOT_FOUND_MESSAGE });
    }

    return backToDayBookings(context, booking.day, { success: "odwolanie" });
  } catch {
    return backToDayBookings(context, formDay, { error: "Nie udało się odwołać zapisu. Spróbuj ponownie." });
  }
};
