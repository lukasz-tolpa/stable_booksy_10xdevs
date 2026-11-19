declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /** Profil zalogowanego użytkownika (rola, nazwa). `null` dla żądań anonimowych. */
    profile: import("@/types").Profile | null;
    /**
     * Kim jest konto `instructor` w ośrodku (właściciel / instruktor / bez ośrodka) — ustala
     * middleware z danych w bazie. `null` dla jeźdźca, anonima i przy awarii odczytu.
     */
    instructorStanding: import("@/lib/auth/roles").InstructorStanding | null;
  }
}
