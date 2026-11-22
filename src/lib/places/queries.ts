import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

type Client = SupabaseClient<Database>;

/** Plac ośrodka (GLOSSARY „Plac”) — wiersz `public.places`. */
export interface PlaceListItem {
  id: number;
  name: string;
  active: boolean;
}

/**
 * Wszystkie place ośrodka, także nieaktywne (zostają przy dniach już ułożonych), w kolejności
 * założenia — pierwszy aktywny to plac, na który baza kładzie slot bez wskazanego placu
 * (`private.default_place_id`). Filtr po ośrodku jest jawny obok RLS (`places_select_authenticated`).
 */
export async function listStablePlaces(client: Client, stableId: number): Promise<PlaceListItem[]> {
  const { data, error } = await client.from("places").select("id, name, active").eq("stable_id", stableId).order("id");

  if (error) {
    throw error;
  }

  return data;
}
