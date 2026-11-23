import type { APIRoute } from "astro";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import {
  INSTRUCTOR_FORM_INVALID,
  INVITATION_INSTRUCTOR_NOT_FOUND,
  INVITATION_NOTHING_TO_REVOKE,
  revokeInvitationErrorMessage,
} from "@/lib/instructors/errors";
import { ownerRequest } from "@/lib/stables/owner-request";
import { revokeInvitation } from "@/lib/instructors/queries";
import { backToInstructors } from "@/lib/instructors/redirect";
import { instructorIdSchema } from "@/lib/instructors/schemas";
import { logError } from "@/lib/log";

export const prerender = false;

/** Wycofanie żywego zaproszenia instruktora (#74) — wysłany link przestaje działać. */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = instructorIdSchema.safeParse({ instructorId: formValue(form, "instructorId") });

  if (!parsed.success) {
    return backToInstructors(context, INSTRUCTOR_FORM_INVALID);
  }

  const owner = await ownerRequest(context, "api:instructors/revoke-invite", (error) =>
    backToInstructors(context, error),
  );
  if (owner instanceof Response) {
    return owner;
  }

  const { revoked, error } = await revokeInvitation(owner.supabase, parsed.data.instructorId);

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
