import type { APIContext, APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode, errorMessage } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { isPastDate, parseScheduleDate } from "@/lib/schedule/dates";
import { SCHEDULE_DAY_PAST, scheduleErrorMessage } from "@/lib/schedule/errors";
import { saveScheduleDay } from "@/lib/schedule/queries";
import { parseScheduleDayForm } from "@/lib/schedule/schema";
import { getOwnedStableId } from "@/lib/stables/queries";
import { createClient } from "@/lib/supabase";

const SCHEDULE_ROUTE = "/osrodek/grafik";

function backToDay(context: APIContext, day: string | null, message?: string) {
  const params = new URLSearchParams();
  if (day) {
    params.set("dzien", day);
  }
  if (message) {
    params.set("error", message);
  }

  const query = params.toString();
  return context.redirect(query ? `${SCHEDULE_ROUTE}?${query}` : SCHEDULE_ROUTE);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const rawDay = parseScheduleDate(formValue(form, "day"));

  const parsed = parseScheduleDayForm(form);

  if (!parsed.success) {
    return backToDay(context, rawDay, firstErrorMessage(parsed.error));
  }

  // Blokada dat przeszłych po stronie serwera, nie tylko w interfejsie - historia
  // zapisów nie ma się zmieniać po fakcie.
  if (isPastDate(parsed.data.day)) {
    return backToDay(context, parsed.data.day, scheduleErrorMessage(SCHEDULE_DAY_PAST));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToDay(context, parsed.data.day, "Supabase nie jest skonfigurowany");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(SIGN_IN_ROUTE);
  }

  const stableId = await getOwnedStableId(supabase, user.id);
  if (stableId === null) {
    return backToDay(context, parsed.data.day, "Twoje konto nie ma jeszcze stadniny");
  }

  try {
    await saveScheduleDay(supabase, parsed.data);
  } catch (error) {
    // Guardraile żyją w bazie; tutaj wyłącznie tłumaczymy ich kody na komunikat.
    return backToDay(context, parsed.data.day, scheduleErrorMessage(errorCode(error), errorMessage(error)));
  }

  return backToDay(context, parsed.data.day);
};
