import type { APIRoute } from "astro";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import {
  INSTRUCTOR_FORM_INVALID,
  isExpectedSchedulePermissionRefusal,
  schedulePermissionErrorMessage,
} from "@/lib/instructors/errors";
import { ownerRequest } from "@/lib/stables/owner-request";
import { setSchedulePermission } from "@/lib/instructors/queries";
import { backToInstructors } from "@/lib/instructors/redirect";
import { schedulePermissionSchema } from "@/lib/instructors/schemas";
import { logError } from "@/lib/log";

export const prerender = false;

/**
 * Przełącznik „Układa grafik” (#78): właściciel nadaje albo odbiera instruktorowi uprawnienie do
 * układania grafiku. Kto może je dostać (aktywny instruktor z kontem, nie właściciel), pilnuje
 * `public.set_schedule_permission`; dezaktywacja odbiera je w bazie, w tej samej transakcji.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = schedulePermissionSchema.safeParse({
    instructorId: formValue(form, "instructorId"),
    granted: formValue(form, "granted"),
  });

  if (!parsed.success) {
    return backToInstructors(context, INSTRUCTOR_FORM_INVALID);
  }

  const owner = await ownerRequest(context, "api:instructors/schedule-permission", (error) =>
    backToInstructors(context, error),
  );
  if (owner instanceof Response) {
    return owner;
  }

  const { error } = await setSchedulePermission(owner.supabase, parsed.data.instructorId, parsed.data.granted);

  if (error) {
    const code = errorCode(error);
    if (!isExpectedSchedulePermissionRefusal(code)) {
      logError("api:instructors/schedule-permission", error);
    }
    return backToInstructors(context, schedulePermissionErrorMessage(code));
  }

  return backToInstructors(context);
};
