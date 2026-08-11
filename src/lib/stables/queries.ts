import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { Stable } from "@/types";

type Client = SupabaseClient<Database>;

/** Pola ośrodka pokazywane w katalogu. */
export type StableListItem = Pick<Stable, "id" | "name" | "city" | "description">;

const LIST_COLUMNS = "id, name, city, description";

/**
 * Lista ośrodków, opcjonalnie zawężona frazą przygotowaną przez `prepareSearchTerm`.
 *
 * Filtr obejmuje nazwę I miejscowość w ALTERNATYWIE, więc musi być jednym wywołaniem
 * `or()`. Dwa osobne wywołania `ilike` na tym samym zapytaniu złożyłyby się w koniunkcję
 * i fraza musiałaby pasować do obu pól naraz.
 */
export async function listStables(client: Client, term: string | null): Promise<StableListItem[]> {
  let query = client.from("stables").select(LIST_COLUMNS).order("name");

  if (term) {
    query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%`);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Pojedynczy ośrodek albo `null`, gdy nie istnieje.
 *
 * Brak wiersza to normalny wynik, nie błąd — strona zamienia go na stan „nie znaleziono".
 * Błąd zapytania nadal leci wyjątkiem i jest łapany po stronie widoku.
 */
export async function getStableById(client: Client, id: number): Promise<StableListItem | null> {
  const { data, error } = await client.from("stables").select(LIST_COLUMNS).eq("id", id).maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}
