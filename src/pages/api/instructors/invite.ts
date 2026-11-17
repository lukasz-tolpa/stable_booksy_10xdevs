import type { APIRoute } from "astro";
import { SIGN_IN_ROUTE } from "@/lib/auth/roles";
import { firstErrorMessage } from "@/lib/auth/schemas";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import {
  INSTRUCTOR_NO_STABLE,
  INVITATION_FAILED,
  invitationErrorMessage,
  isExpectedInvitationRefusal,
} from "@/lib/instructors/errors";
import {
  encodeInvitationFlash,
  INVITATION_FLASH_COOKIE,
  INVITATION_FLASH_MAX_AGE,
} from "@/lib/instructors/invitations";
import { issueInvitation } from "@/lib/instructors/queries";
import { backToInstructors, INSTRUCTORS_ROUTE } from "@/lib/instructors/redirect";
import { inviteInstructorSchema } from "@/lib/instructors/schemas";
import { logError } from "@/lib/log";
import { getOwnedStableId } from "@/lib/stables/queries";
import { createClient } from "@/lib/supabase";

export const prerender = false;

/**
 * Wystawienie zaproszenia instruktora do konta (#74) — także „Zaproś ponownie”: baza wycofuje
 * poprzednie zaproszenie instruktora. Token wraca z bazy jeden raz; trafia do krótkiego
 * ciasteczka na ścieżce strony Instruktorzy, która pokazuje link do skopiowania i je kasuje.
 * Aplikacja niczego nie wysyła — link przekazuje właściciel.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = inviteInstructorSchema.safeParse({
    instructorId: formValue(form, "instructorId"),
    email: formValue(form, "email"),
  });

  if (!parsed.success) {
    return backToInstructors(context, firstErrorMessage(parsed.error));
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

  // Jawne sprawdzenie obok bazy, która i tak bierze ośrodek z sesji (42501, SB013).
  const stableId = await getOwnedStableId(supabase, user.id);
  if (stableId === null) {
    return backToInstructors(context, INSTRUCTOR_NO_STABLE);
  }

  const { invitation, error } = await issueInvitation(supabase, parsed.data.instructorId, parsed.data.email);

  if (error) {
    const code = errorCode(error);
    if (!isExpectedInvitationRefusal(code)) {
      logError("api:instructors/invite", error);
    }
    return backToInstructors(context, invitationErrorMessage(code));
  }

  // Sukces dopiero, gdy baza oddała token — bez niego nie ma linku do pokazania.
  if (!invitation?.token) {
    logError("api:instructors/invite", new Error("issue_instructor_invitation bez tokenu"));
    return backToInstructors(context, INVITATION_FAILED);
  }

  context.cookies.set(
    INVITATION_FLASH_COOKIE,
    encodeInvitationFlash({ instructorId: parsed.data.instructorId, token: invitation.token }),
    {
      path: INSTRUCTORS_ROUTE,
      httpOnly: true,
      sameSite: "strict",
      secure: context.url.protocol === "https:",
      maxAge: INVITATION_FLASH_MAX_AGE,
    },
  );

  return backToInstructors(context);
};
