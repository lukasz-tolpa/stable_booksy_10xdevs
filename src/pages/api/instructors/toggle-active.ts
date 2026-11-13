import type { APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { formValue } from "@/lib/form-data";
import {
  INSTRUCTOR_NO_STABLE,
  INSTRUCTOR_NOT_FOUND,
  INSTRUCTOR_TOGGLE_FAILED,
  INSTRUCTOR_TOGGLE_INVALID,
} from "@/lib/instructors/errors";
import { backToInstructors } from "@/lib/instructors/redirect";
import { toggleInstructorSchema } from "@/lib/instructors/schemas";
import { logError } from "@/lib/log";
import { getOwnedStableId } from "@/lib/stables/queries";
import { createClient } from "@/lib/supabase";

/**
 * Dezaktywacja i ponowna aktywacja instruktora. Dezaktywacja nigdy nie jest odmawiana
 * i nie rusza dni już ułożonych (ADR-0002) — to sama flaga.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = toggleInstructorSchema.safeParse({
    instructorId: formValue(form, "instructorId"),
    active: formValue(form, "active"),
  });

  if (!parsed.success) {
    return backToInstructors(context, INSTRUCTOR_TOGGLE_INVALID);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToInstructors(context, "Supabase nie jest skonfigurowany");
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return context.redirect(SIGN_IN_ROUTE);
  }

  const stableId = await getOwnedStableId(supabase, user.id);
  if (stableId === null) {
    return backToInstructors(context, INSTRUCTOR_NO_STABLE);
  }

  // Jawny warunek po stadninie obok polityki `instructors_update_own_stable`.
  // `.select().maybeSingle()`: UPDATE odfiltrowany przez RLS kończy się bez błędu i z zerem
  // wierszy — bez odczytu wyglądałby jak sukces. Cudzy i nieistniejący instruktor dostają
  // jeden komunikat, bez wyroczni istnienia.
  const { data, error } = await supabase
    .from("instructors")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.instructorId)
    .eq("stable_id", stableId)
    .select("id")
    .maybeSingle();

  if (error) {
    logError("api:instructors/toggle-active", error);
    return backToInstructors(context, INSTRUCTOR_TOGGLE_FAILED);
  }

  if (data === null) {
    return backToInstructors(context, INSTRUCTOR_NOT_FOUND);
  }

  return backToInstructors(context);
};
