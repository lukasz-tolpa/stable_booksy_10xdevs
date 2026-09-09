import type { APIContext, APIRoute } from "astro";
import { ROLE_HOME, SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { bookingErrorMessage } from "@/lib/bookings/errors";
import { createBooking } from "@/lib/bookings/queries";
import { bookingSchema } from "@/lib/bookings/schema";
import { currentWarsawHour } from "@/lib/bookings/slots";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { isPastDate, parseScheduleDate, todayIso } from "@/lib/schedule/dates";
import { getScheduleDay } from "@/lib/schedule/queries";
import { parseStableId } from "@/lib/stables/search";
import { createClient } from "@/lib/supabase";

function backToStable(
  context: APIContext,
  stableId: number | null,
  day: string | null,
  outcome: { error?: string; success?: boolean } = {},
) {
  // Bez poprawnego identyfikatora ośrodka nie ma dokąd wrócić — katalog jest
  // jedynym sensownym miejscem docelowym.
  if (stableId === null) {
    return context.redirect(ROLE_HOME.rider);
  }

  const params = new URLSearchParams();
  if (day) {
    params.set("dzien", day);
  }
  if (outcome.error) {
    params.set("error", outcome.error);
  } else if (outcome.success) {
    params.set("sukces", "1");
  }

  const query = params.toString();
  const route = `/jezdziec/osrodki/${String(stableId)}`;
  return context.redirect(query ? `${route}?${query}` : route);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const rawStableId = parseStableId(formValue(form, "stableId"));
  const rawDay = parseScheduleDate(formValue(form, "day"));

  const parsed = bookingSchema.safeParse({
    stableId: formValue(form, "stableId"),
    day: formValue(form, "day"),
    horseId: formValue(form, "horseId"),
    hour: formValue(form, "hour"),
  });

  if (!parsed.success) {
    return backToStable(context, rawStableId, rawDay, { error: firstErrorMessage(parsed.error) });
  }

  const { stableId, day, horseId, hour } = parsed.data;

  // Guardy dat PRZED mutacją: baza nie pilnuje przeszłości (RLS przepuszcza INSERT
  // w miniony dzień), więc to jedyna linia obrony. Ten sam próg co w computeSlotSections:
  // slot o godzinie <= bieżącej (Europe/Warsaw) uznajemy za miniony.
  if (isPastDate(day)) {
    return backToStable(context, stableId, day, { error: "Nie można zapisać się na miniony dzień." });
  }

  if (day === todayIso() && hour <= currentWarsawHour()) {
    return backToStable(context, stableId, day, { error: "Ta godzina już minęła. Wybierz późniejszy slot." });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToStable(context, stableId, day, { error: "Supabase nie jest skonfigurowany" });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(SIGN_IN_ROUTE);
  }

  try {
    // Dzień grafiku rozwiązywany po stronie serwera z pary (ośrodek, data) — formularzowi
    // nie ufamy tak samo, jak nie ufamy mu w sprawie rider_id (ten idzie z sesji,
    // co wymusza też polityka INSERT).
    const scheduleDay = await getScheduleDay(supabase, stableId, day);
    if (!scheduleDay) {
      return backToStable(context, stableId, day, { error: "Ośrodek nie ułożył grafiku na ten dzień." });
    }

    await createBooking(supabase, { scheduleDayId: scheduleDay.id, horseId, hour, riderId: user.id });
  } catch (error) {
    // Guardraile żyją w bazie; tutaj wyłącznie tłumaczymy ich kody na komunikat.
    return backToStable(context, stableId, day, { error: bookingErrorMessage(errorCode(error)) });
  }

  return backToStable(context, stableId, day, { success: true });
};
