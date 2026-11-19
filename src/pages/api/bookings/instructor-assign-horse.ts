import type { APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { assignHorseSchema } from "@/lib/bookings/schema";
import {
  instructorHorseAssignmentErrorMessage,
  isInstructorHorseAssignmentRefusal,
} from "@/lib/bookings/stable-errors";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { logError } from "@/lib/log";
import { assignMySlotHorse } from "@/lib/my-slots/queries";
import { backToMySlots } from "@/lib/my-slots/redirect";
import { SUPABASE_NOT_CONFIGURED, createClient } from "@/lib/supabase";

export const prerender = false;

/**
 * Przydział, zmiana albo zdjęcie konia przez instruktora przy zapisie na jego slot (#81).
 * Zapis wyszukuje baza przez dostęp wywołującego (`assign_my_slot_horse` bierze instruktora
 * z sesji) — endpoint nie sprawdza własności sam. Bez progu czasu, jak u właściciela.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = assignHorseSchema.safeParse({
    bookingId: formValue(form, "bookingId"),
    horseId: formValue(form, "horseId"),
  });
  if (!parsed.success) {
    return backToMySlots(context, { error: firstErrorMessage(parsed.error) });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToMySlots(context, { error: SUPABASE_NOT_CONFIGURED });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(SIGN_IN_ROUTE);
  }

  try {
    await assignMySlotHorse(supabase, parsed.data.bookingId, parsed.data.horseId);
    return backToMySlots(context, { success: "przydzial" });
  } catch (error) {
    // Odmowa reguły (koń zajęty, nie pracuje, zapis odwołany, zapis spoza moich slotów) to
    // decyzja bazy; wszystko inne to awaria — ta trafia do logu.
    const code = errorCode(error);
    if (!isInstructorHorseAssignmentRefusal(code)) {
      logError("api:bookings/instructor-assign-horse", error);
    }
    return backToMySlots(context, { error: instructorHorseAssignmentErrorMessage(code) });
  }
};
