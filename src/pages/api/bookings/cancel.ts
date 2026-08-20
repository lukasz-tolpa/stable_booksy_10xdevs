import type { APIContext, APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { cancelBooking, getRiderBookings } from "@/lib/bookings/queries";
import { cancelSchema } from "@/lib/bookings/schema";
import { currentWarsawHour } from "@/lib/bookings/slots";
import { formValue } from "@/lib/form-data";
import { isPastDate, todayIso } from "@/lib/schedule/dates";
import { createClient } from "@/lib/supabase";

const MY_BOOKINGS_ROUTE = "/jezdziec/zapisy";
const NOT_FOUND_MESSAGE = "Nie znaleziono zapisu do odwołania.";

function backToMyBookings(context: APIContext, outcome: { error?: string; success?: boolean } = {}) {
  const params = new URLSearchParams();
  if (outcome.error) {
    params.set("error", outcome.error);
  } else if (outcome.success) {
    params.set("sukces", "1");
  }

  const query = params.toString();
  return context.redirect(query ? `${MY_BOOKINGS_ROUTE}?${query}` : MY_BOOKINGS_ROUTE);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = cancelSchema.safeParse({ bookingId: formValue(form, "bookingId") });
  if (!parsed.success) {
    return backToMyBookings(context, { error: firstErrorMessage(parsed.error) });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToMyBookings(context, { error: "Supabase nie jest skonfigurowany" });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(SIGN_IN_ROUTE);
  }

  try {
    // Odczyt PRZED mutacją: guard progu potrzebuje dnia i godziny slotu, a tym
    // danym nie może być źródłem formularz. Rozróżnia też "nie znaleziono"
    // (cudzy/nieistniejący zapis) od "jazda już się zaczęła".
    const bookings = await getRiderBookings(supabase, user.id);
    const booking = bookings.find((entry) => entry.id === parsed.data.bookingId && entry.status === "active");

    if (!booking) {
      return backToMyBookings(context, { error: NOT_FOUND_MESSAGE });
    }

    // Ten sam próg co przy zapisie (S-04): slot o godzinie <= bieżącej
    // (Europe/Warsaw) w dniu dzisiejszym już się zaczął. RLS pozwala na
    // UPDATE także wstecz, więc to jedyna linia obrony.
    if (isPastDate(booking.day) || (booking.day === todayIso() && booking.hour <= currentWarsawHour())) {
      return backToMyBookings(context, { error: "Nie można odwołać jazdy, która już się zaczęła." });
    }

    // `false` = wyścig (ktoś już odwołał w międzyczasie) albo RLS - z punktu
    // widzenia użytkownika to ten sam przypadek "nie znaleziono".
    const cancelled = await cancelBooking(supabase, parsed.data.bookingId, user.id);
    if (!cancelled) {
      return backToMyBookings(context, { error: NOT_FOUND_MESSAGE });
    }
  } catch {
    return backToMyBookings(context, { error: "Nie udało się odwołać zapisu. Spróbuj ponownie." });
  }

  return backToMyBookings(context, { success: true });
};
