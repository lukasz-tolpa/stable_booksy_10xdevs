import type { APIContext, APIRoute } from "astro";
import { SIGNUP_CONFIRM_MESSAGE } from "@/lib/auth/errors";
import { SIGN_IN_ROUTE, homeRouteForRole } from "@/lib/auth/roles";
import { firstErrorMessage, signUpSchema } from "@/lib/auth/schemas";
import { authFailureMessage, signUpOutcome } from "@/lib/auth/session";
import { formValue } from "@/lib/form-data";
import { createClient } from "@/lib/supabase";

function backToForm(context: APIContext, message: string) {
  return context.redirect(`/auth/signup?error=${encodeURIComponent(message)}`);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

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

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToForm(context, "Supabase nie jest skonfigurowany");
  }

  // Rola jedzie w metadanych użytkownika; profil zakłada trigger bazy z F-01,
  // który mapuje ją twardo na dozwoloną wartość.
  const outcome = await signUpOutcome(supabase, { email, password, role, fullName });

  switch (outcome.kind) {
    case "error":
      return backToForm(context, authFailureMessage("auth:signup", outcome.error, "signup"));
    case "confirm":
      // Potwierdzanie e-mail jest wyłączone po obu stronach (enable_confirmations lokalnie,
      // mailer_autoconfirm na zdalnym), więc ta gałąź to zabezpieczenie: bez sesji nie ma
      // wejścia do panelu, tylko jasna informacja zamiast cichego odbicia na logowanie.
      return context.redirect(`${SIGN_IN_ROUTE}?error=${encodeURIComponent(SIGNUP_CONFIRM_MESSAGE)}`);
    case "session":
      return context.redirect(homeRouteForRole(outcome.role));
  }
};
