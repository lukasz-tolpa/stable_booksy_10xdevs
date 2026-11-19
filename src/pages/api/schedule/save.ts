import type { APIContext, APIRoute } from "astro";
import { SIGN_IN_ROUTE, homeRouteForAccount, isUserRole, scheduleRouteFor } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode, errorDetails } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { isPastDate, parseScheduleDate } from "@/lib/schedule/dates";
import { logError } from "@/lib/log";
import {
  SCHEDULE_DAY_PAST,
  SCHEDULE_PERMISSION_MISSING,
  isScheduleRefusal,
  scheduleErrorMessage,
  type ScheduleCaller,
} from "@/lib/schedule/errors";
import { saveScheduleDay } from "@/lib/schedule/queries";
import { parseScheduleDayForm } from "@/lib/schedule/schema";
import { SUPABASE_NOT_CONFIGURED, createClient } from "@/lib/supabase";

/**
 * Zapis grafiku dnia — właściciela i instruktora z uprawnieniem do układania grafiku (#79). Ośrodek
 * wybiera baza z sesji (`save_schedule_day` → `private.schedule_stable_id()`), nigdy formularz.
 * Powrót na stronę grafiku konta (`scheduleRouteFor`); konto bez niej — instruktor, któremu
 * odebrano uprawnienie przy otwartym formularzu — wraca na swoją stronę startową z odmową, bo
 * middleware i tak przeniósłby je ze strony grafiku, gubiąc komunikat.
 */
function backTo(context: APIContext, route: string, day: string | null, message?: string) {
  const params = new URLSearchParams();
  if (day) {
    params.set("dzien", day);
  }
  if (message) {
    params.set("error", message);
  }

  const query = params.toString();
  return context.redirect(query ? `${route}?${query}` : route);
}

export const POST: APIRoute = async (context) => {
  const { profile, instructorStanding: standing } = context.locals;
  if (!context.locals.user || !profile || !isUserRole(profile.role)) {
    return context.redirect(SIGN_IN_ROUTE);
  }

  const home = homeRouteForAccount(profile.role, standing);
  const scheduleRoute = scheduleRouteFor(standing);
  // Instruktor (z uprawnieniem albo po jego utracie) dostaje komunikaty instruktora.
  const caller: ScheduleCaller =
    standing === "instructor" || standing === "arranging-instructor" || standing === "inactive"
      ? "instructor"
      : "owner";
  const back = (day: string | null, message?: string) =>
    scheduleRoute ? backTo(context, scheduleRoute, day, message) : backTo(context, home, null, message);

  const form = await context.request.formData();
  const rawDay = parseScheduleDate(formValue(form, "day"));

  const parsed = parseScheduleDayForm(form);

  if (!parsed.success) {
    return back(rawDay, firstErrorMessage(parsed.error));
  }

  // Blokada dat przeszłych po stronie serwera, nie tylko w interfejsie - historia
  // zapisów nie ma się zmieniać po fakcie.
  if (isPastDate(parsed.data.day)) {
    return back(parsed.data.day, scheduleErrorMessage(SCHEDULE_DAY_PAST, undefined, caller));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return back(parsed.data.day, SUPABASE_NOT_CONFIGURED);
  }

  try {
    await saveScheduleDay(supabase, parsed.data);
  } catch (error) {
    // Guardraile żyją w bazie; tutaj wyłącznie tłumaczymy ich kody (i liczby z DETAIL) na komunikat.
    const code = errorCode(error);
    if (!isScheduleRefusal(code, caller)) {
      logError("api:schedule/save", error);
    }
    const message = scheduleErrorMessage(code, errorDetails(error), caller);
    // Uprawnienie odebrane w chwili zapisu: strona grafiku już nie wpuści, odmowa idzie na stronę startową.
    return code === SCHEDULE_PERMISSION_MISSING && caller === "instructor"
      ? backTo(context, home, null, message)
      : back(parsed.data.day, message);
  }

  return back(parsed.data.day);
};
