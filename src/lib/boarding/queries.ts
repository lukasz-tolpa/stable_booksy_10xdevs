import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { MyBoardingHorseRow, StableBoardingRow } from "@/lib/boarding/view";

type Client = SupabaseClient<Database>;

/**
 * Odczyty i zapisy koni pensjonatowych i pobytów (#114). Zapis wyłącznie przez funkcje bazy (tabele
 * `horse_owners` i `horse_stays` są zamknięte dla zapisu); ośrodek i strona (ośrodek albo pensjonariusz)
 * z sesji, nigdy z argumentu. Każda funkcja zapisu zwraca identyfikator, który baza oddała — endpoint
 * ogłasza sukces dopiero z nim (test-plan §6.4).
 */

/** Lista „Pensjonariusze” ośrodka właściciela: jeden wiersz na pobyt. Rzuca przy błędzie odczytu. */
export async function listStableBoardingHorses(client: Client): Promise<StableBoardingRow[]> {
  const { data, error } = await client.rpc("get_stable_boarding_horses");
  if (error) {
    throw error;
  }
  return data;
}

export async function addBoardingHorse(client: Client, input: { name: string; email: string; arrival: string }) {
  const { data, error } = await client.rpc("add_boarding_horse", {
    p_name: input.name,
    p_rider_email: input.email,
    p_arrival: input.arrival,
  });
  return { horseId: typeof data === "number" ? data : null, error };
}

export async function addHorseStay(client: Client, horseId: number, arrival: string) {
  const { data, error } = await client.rpc("add_horse_stay", { p_horse_id: horseId, p_arrival: arrival });
  return { stayId: typeof data === "number" ? data : null, error };
}

/** Dzień wyjazdu pobytu — właściciel ośrodka albo pensjonariusz (strona z sesji). */
export async function setStayDeparture(client: Client, stayId: number, departure: string) {
  const { data, error } = await client.rpc("set_stay_departure", { p_stay_id: stayId, p_departure: departure });
  return { stayId: typeof data === "number" ? data : null, error };
}

/**
 * Konie pensjonatowe pensjonariusza z ośrodkiem i pobytami. Filtr po koncie jawnie obok RLS (wiersze
 * `horse_owners` czyta właściciel ośrodka i sam pensjonariusz). Rzuca przy błędzie odczytu.
 */
export async function listMyBoardingHorses(client: Client, riderId: string): Promise<MyBoardingHorseRow[]> {
  const { data, error } = await client
    .from("horse_owners")
    .select("horse_id, horses(name), stables(name), horse_stays(id, arrival_day, departure_day, departure_set_by)")
    .eq("rider_id", riderId);
  if (error) {
    throw error;
  }
  return data.map((row) => ({
    horseId: row.horse_id,
    horseName: row.horses.name,
    stableName: row.stables.name,
    stays: row.horse_stays.map((stay) => ({
      id: stay.id,
      arrivalDay: stay.arrival_day,
      departureDay: stay.departure_day,
      departureSetBy: stay.departure_set_by,
    })),
  }));
}

/** Czy jeździec ma choć jednego konia pensjonatowego — wtedy nawigacja pokazuje „Moje konie”. Rzuca przy błędzie. */
export async function hasBoardingHorses(client: Client, riderId: string): Promise<boolean> {
  const { count, error } = await client
    .from("horse_owners")
    .select("horse_id", { count: "exact", head: true })
    .eq("rider_id", riderId);
  if (error) {
    throw error;
  }
  return (count ?? 0) > 0;
}
