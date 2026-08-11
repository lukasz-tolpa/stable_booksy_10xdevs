import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { Horse, Stable } from "@/types";

type Client = SupabaseClient<Database>;

/** Pola ośrodka pokazywane w katalogu. */
export type StableListItem = Pick<Stable, "id" | "name" | "city" | "description">;

/** Pola konia pokazywane na liście stada. */
export type HorseListItem = Pick<Horse, "id" | "name" | "notes" | "active">;

const LIST_COLUMNS = "id, name, city, description";
const HORSE_COLUMNS = "id, name, notes, active";

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

/**
 * Identyfikator stadniny należącej do podanego właściciela albo `null`.
 *
 * Konto ośrodka zawsze ma stadninę — wymusza to middleware od S-01 — ale endpointy
 * i tak muszą ją odczytać, żeby wiedzieć, do czego przypiąć konia.
 */
export async function getOwnedStableId(client: Client, ownerId: string): Promise<number | null> {
  const { data, error } = await client.from("stables").select("id").eq("owner_id", ownerId).maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

/**
 * Stado stadniny, posortowane: najpierw aktywne, potem wycofane, w obu grupach po imieniu.
 *
 * Filtr po `stable_id` jest KONIECZNY: polityka odczytu na `horses` jest otwarta dla
 * każdego zalogowanego (jeździec musi widzieć imię konia w slocie), więc bez niego
 * ośrodek zobaczyłby konie cudzych stadnin.
 */
export async function listStableHorses(client: Client, stableId: number): Promise<HorseListItem[]> {
  const { data, error } = await client
    .from("horses")
    .select(HORSE_COLUMNS)
    .eq("stable_id", stableId)
    .order("active", { ascending: false })
    .order("name");

  if (error) {
    throw error;
  }

  return data;
}
