import type { APIContext, APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { homeRouteForRole, isUserRole } from "@/lib/auth/roles";
import { firstErrorMessage, signInSchema } from "@/lib/auth/schemas";
import { formValue } from "@/lib/form-data";

function backToForm(context: APIContext, message: string) {
  return context.redirect(`/auth/signin?error=${encodeURIComponent(message)}`);
}

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();

  const parsed = signInSchema.safeParse({
    email: formValue(form, "email"),
    password: formValue(form, "password"),
  });

  if (!parsed.success) {
    return backToForm(context, firstErrorMessage(parsed.error));
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return backToForm(context, "Supabase nie jest skonfigurowany");
  }

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return backToForm(context, error.message);
  }

  // Rolę czytamy z profilu, a nie z metadanych tokenu - metadane użytkownik może
  // sam nadpisać przez API Auth, więc nie nadają się na podstawę decyzji o dostępie.
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();

  if (!isUserRole(profile?.role)) {
    await supabase.auth.signOut();
    return backToForm(context, "Nie udało się ustalić rodzaju Twojego konta. Skontaktuj się z obsługą.");
  }

  return context.redirect(homeRouteForRole(profile.role));
};
