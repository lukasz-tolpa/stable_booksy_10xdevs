import type { APIContext, APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { homeRouteForRole } from "@/lib/auth/roles";
import { firstErrorMessage, signUpSchema } from "@/lib/auth/schemas";
import { formValue } from "@/lib/form-data";

function backToForm(context: APIContext, message: string) {
  return context.redirect(`/auth/signup?error=${encodeURIComponent(message)}`);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = signUpSchema.safeParse({
    email: formValue(form, "email"),
    password: formValue(form, "password"),
    confirmPassword: formValue(form, "confirmPassword"),
    role: formValue(form, "role"),
  });

  if (!parsed.success) {
    return backToForm(context, firstErrorMessage(parsed.error));
  }

  const { email, password, role } = parsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToForm(context, "Supabase nie jest skonfigurowany");
  }

  // Rola jedzie w metadanych użytkownika; profil zakłada trigger bazy z F-01,
  // który mapuje ją twardo na dozwoloną wartość.
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { role } },
  });

  if (error) {
    return backToForm(context, error.message);
  }

  // Potwierdzanie adresu e-mail jest wyłączone po obu stronach (enable_confirmations
  // lokalnie, mailer_autoconfirm na zdalnym), więc konto jest już zalogowane -
  // kierujemy prosto do przestrzeni roli, którą właśnie wysłaliśmy, bez odczytu profilu.
  return context.redirect(homeRouteForRole(role));
};
