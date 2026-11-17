import type { APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import {
  INSTRUCTOR_NO_STABLE,
  INSTRUCTOR_TOGGLE_INVALID,
  INVITATION_INSTRUCTOR_NOT_FOUND,
  INVITATION_NOTHING_TO_REVOKE,
  revokeInvitationErrorMessage,
} from "@/lib/instructors/errors";
import { revokeInvitation } from "@/lib/instructors/queries";
import { backToInstructors } from "@/lib/instructors/redirect";
import { instructorIdSchema } from "@/lib/instructors/schemas";
import { logError } from "@/lib/log";
import { getOwnedStableId } from "@/lib/stables/queries";
import { createClient } from "@/lib/supabase";

export const prerender = false;

/** Wycofanie żywego zaproszenia instruktora (#74) — wysłany link przestaje działać. */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = instructorIdSchema.safeParse({ instructorId: formValue(form, "instructorId") });

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

  const { revoked, error } = await revokeInvitation(supabase, parsed.data.instructorId);

  if (error) {
    const code = errorCode(error);
    if (code !== INVITATION_INSTRUCTOR_NOT_FOUND) {
      logError("api:instructors/revoke-invite", error);
    }
    return backToInstructors(context, revokeInvitationErrorMessage(code));
  }

  // `false` od bazy: zaproszenie wygasło albo wycofano je wcześniej (np. w drugiej karcie).
  if (!revoked) {
    return backToInstructors(context, INVITATION_NOTHING_TO_REVOKE);
  }

  return backToInstructors(context);
};
