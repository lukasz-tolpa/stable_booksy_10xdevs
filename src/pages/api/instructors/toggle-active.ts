import type { APIRoute } from "astro";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import {
  INSTRUCTOR_FORM_INVALID,
  INSTRUCTOR_NOT_FOUND,
  INSTRUCTOR_OWNER_STAYS_ACTIVE,
  instructorToggleErrorMessage,
} from "@/lib/instructors/errors";
import { ownerRequest } from "@/lib/instructors/owner-request";
import { backToInstructors } from "@/lib/instructors/redirect";
import { toggleInstructorSchema } from "@/lib/instructors/schemas";
import { logError } from "@/lib/log";

export const prerender = false;

/**
 * Dezaktywacja i ponowna aktywacja instruktora. Dezaktywacja nie rusza dni już ułożonych
 * (ADR-0002) — to sama flaga; baza odmawia jej wyłącznie dla właściciela (SB012). Żywe
 * zaproszenie instruktora wycofuje przy dezaktywacji baza, w tej samej transakcji.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = toggleInstructorSchema.safeParse({
    instructorId: formValue(form, "instructorId"),
    active: formValue(form, "active"),
  });

  if (!parsed.success) {
    return backToInstructors(context, INSTRUCTOR_FORM_INVALID);
  }

  const owner = await ownerRequest(context, "api:instructors/toggle-active");
  if (owner instanceof Response) {
    return owner;
  }

  // Jawny warunek po stadninie obok polityki `instructors_update_own_stable`.
  // `.select().maybeSingle()`: UPDATE odfiltrowany przez RLS kończy się bez błędu i z zerem
  // wierszy — bez odczytu wyglądałby jak sukces. Cudzy i nieistniejący instruktor dostają
  // jeden komunikat, bez wyroczni istnienia.
  const { data, error } = await owner.supabase
    .from("instructors")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.instructorId)
    .eq("stable_id", owner.stableId)
    .select("id")
    .maybeSingle();

  if (error) {
    const code = errorCode(error);
    if (code !== INSTRUCTOR_OWNER_STAYS_ACTIVE) {
      logError("api:instructors/toggle-active", error);
    }
    return backToInstructors(context, instructorToggleErrorMessage(code));
  }

  if (data === null) {
    return backToInstructors(context, INSTRUCTOR_NOT_FOUND);
  }

  return backToInstructors(context);
};
