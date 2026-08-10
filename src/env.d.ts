declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /** Profil zalogowanego użytkownika (rola, nazwa). `null` dla żądań anonimowych. */
    profile: import("@/types").Profile | null;
  }
}
