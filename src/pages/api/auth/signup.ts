import type { APIContext, APIRoute } from "astro";
import { OUTAGE_MESSAGE, SIGNUP_CONFIRM_MESSAGE, USER_ALREADY_EXISTS } from "@/lib/auth/errors";
import { signupInvitation } from "@/lib/auth/invitation";
import { INSTRUCTOR_HOME_ROUTE, SIGN_IN_ROUTE, SIGN_UP_ROUTE, homeRouteForRole } from "@/lib/auth/roles";
import { firstErrorMessage, invitedSignUpSchema, signUpSchema } from "@/lib/auth/schemas";
import { authFailureMessage, signUpOutcome, type SignUpResult } from "@/lib/auth/session";
import { errorCode } from "@/lib/db-errors";
import { formValue } from "@/lib/form-data";
import { INVITATION_PARAM } from "@/lib/instructors/invitations";
import { getInvitationByToken } from "@/lib/instructors/queries";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase";

export const prerender = false;

type Client = NonNullable<ReturnType<typeof createClient>>;

function backToForm(context: APIContext, message: string, token?: string) {
  const invitation = token === undefined ? "" : `${INVITATION_PARAM}=${encodeURIComponent(token)}&`;
  return context.redirect(`${SIGN_UP_ROUTE}?${invitation}error=${encodeURIComponent(message)}`);
}

/** Strona rejestracji z tokenem sama pokazuje powód, dla którego link nie działa. */
function backToInvitation(context: APIContext, token: string) {
  return context.redirect(`${SIGN_UP_ROUTE}?${INVITATION_PARAM}=${encodeURIComponent(token)}`);
}

function afterSignUp(context: APIContext, outcome: Exclude<SignUpResult, { kind: "error" }>, home: string) {
  // Potwierdzanie e-mail jest wyłączone po obu stronach (enable_confirmations lokalnie,
  // mailer_autoconfirm na zdalnym), więc gałąź `confirm` to zabezpieczenie: bez sesji nie ma
  // wejścia do panelu, tylko jasna informacja zamiast cichego odbicia na logowanie.
  return outcome.kind === "confirm"
    ? context.redirect(`${SIGN_IN_ROUTE}?error=${encodeURIComponent(SIGNUP_CONFIRM_MESSAGE)}`)
    : context.redirect(home);
}

/**
 * Rejestracja z linku zaproszenia (#75). Zaproszenie przyjmuje baza w transakcji zakładania konta
 * (trigger `handle_new_user` z metadanymi `invitation_token`): rola `instructor`, powiązanie
 * z instruktorem i `accepted_at` albo odmowa bez konta. GoTrue nie przekazuje kodu tej odmowy,
 * więc powód bierzemy ze stanu zaproszenia - przed rejestracją i ponownie po jej niepowodzeniu
 * (link wycofany albo wykorzystany w międzyczasie). Adres konta to adres zaproszenia, nie pole
 * formularza.
 */
async function signUpWithInvitation(context: APIContext, form: FormData, supabase: Client): Promise<Response> {
  const token = formValue(form, INVITATION_PARAM);
  const parsed = invitedSignUpSchema.safeParse({
    fullName: formValue(form, "fullName"),
    password: formValue(form, "password"),
    confirmPassword: formValue(form, "confirmPassword"),
    token,
  });

  if (!parsed.success) {
    return backToForm(context, firstErrorMessage(parsed.error), token);
  }

  const { fullName, password } = parsed.data;

  const before = await getInvitationByToken(supabase, token);
  if (before.error) {
    logError("auth:signup", before.error);
    return backToForm(context, OUTAGE_MESSAGE, token);
  }
  const invitation = signupInvitation(token, before.invitation);
  if (invitation.kind === "refused") {
    return backToInvitation(context, token);
  }

  const outcome = await signUpOutcome(supabase, {
    email: invitation.email,
    password,
    role: "instructor",
    fullName,
    invitationToken: token,
  });

  if (outcome.kind !== "error") {
    // Konto instruktora, który nie jest właścicielem: prosto do „Moje sloty”.
    return afterSignUp(context, outcome, INSTRUCTOR_HOME_ROUTE);
  }

  if (errorCode(outcome.error) !== USER_ALREADY_EXISTS) {
    const after = await getInvitationByToken(supabase, token);
    if (!after.error && signupInvitation(token, after.invitation).kind === "refused") {
      return backToInvitation(context, token);
    }
  }
  return backToForm(context, authFailureMessage("auth:signup", outcome.error, "signup"), token);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const supabase = createClient(context.request.headers, context.cookies);

  if (form.has(INVITATION_PARAM)) {
    if (!supabase) {
      return backToForm(context, "Supabase nie jest skonfigurowany", formValue(form, INVITATION_PARAM));
    }
    return signUpWithInvitation(context, form, supabase);
  }

  const parsed = signUpSchema.safeParse({
    fullName: formValue(form, "fullName"),
    email: formValue(form, "email"),
    password: formValue(form, "password"),
    confirmPassword: formValue(form, "confirmPassword"),
    role: formValue(form, "role"),
  });

  if (!parsed.success) {
    return backToForm(context, firstErrorMessage(parsed.error));
  }

  const { fullName, email, password, role } = parsed.data;

  if (!supabase) {
    return backToForm(context, "Supabase nie jest skonfigurowany");
  }

  // Rola jedzie w metadanych użytkownika; profil zakłada trigger bazy z F-01,
  // który mapuje ją twardo na dozwoloną wartość.
  const outcome = await signUpOutcome(supabase, { email, password, role, fullName });

  if (outcome.kind === "error") {
    return backToForm(context, authFailureMessage("auth:signup", outcome.error, "signup"));
  }
  return afterSignUp(context, outcome, homeRouteForRole(role));
};
