import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { ScheduleDayInput } from "@/lib/schedule/schema";

type Client = SupabaseClient<Database>;

export interface ScheduleDayData {
  id: number;
  day: string;
  openHour: number;
  closeHour: number;
  horseIds: number[];
}

const DAY_COLUMNS = "id, day, open_hour, close_hour, schedule_day_horses(horse_id)";

interface RawScheduleDay {
  id: number;
  day: string;
  open_hour: number;
  close_hour: number;
  schedule_day_horses: { horse_id: number }[];
}

function toScheduleDay(row: RawScheduleDay): ScheduleDayData {
  return {
    id: row.id,
    day: row.day,
    openHour: row.open_hour,
    closeHour: row.close_hour,
    horseIds: row.schedule_day_horses.map((entry) => entry.horse_id),
  };
}

/** Grafik stadniny na konkretny dzień albo `null`, gdy nie został jeszcze ułożony. */
export async function getScheduleDay(client: Client, stableId: number, day: string): Promise<ScheduleDayData | null> {
  const { data, error } = await client
    .from("schedule_days")
    .select(DAY_COLUMNS)
    .eq("stable_id", stableId)
    .eq("day", day)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toScheduleDay(data) : null;
}

/**
 * Ostatnio ułożony dzień stadniny — źródło podpowiedzi przy nowym dniu.
 * Ośrodki pracują w powtarzalnym rytmie, więc przepisywanie tego samego zakresu
 * to najczęstsza czynność na tym ekranie.
 */
export async function getLatestScheduleDay(client: Client, stableId: number): Promise<ScheduleDayData | null> {
  const { data, error } = await client
    .from("schedule_days")
    .select(DAY_COLUMNS)
    .eq("stable_id", stableId)
    .order("day", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toScheduleDay(data) : null;
}

/**
 * Zapis całego dnia: godziny plus zestaw koni.
 *
 * KOLEJNOŚĆ JEST KRYTYCZNA. Najpierw usuwamy odpięte konie, dopiero potem wstawiamy
 * dopięte. Usunięcie może się nie udać (23503, gdy koń ma zapis w tym dniu), wstawienie
 * praktycznie nie — przy odwrotnej kolejności nieudane usunięcie zostawiłoby dzień
 * z dołożonymi końmi i nieusuniętymi starymi, czyli w stanie, którego ośrodek nie zamawiał.
 */
export async function saveScheduleDay(client: Client, stableId: number, input: ScheduleDayInput): Promise<void> {
  const { data: dayRow, error: dayError } = await client
    .from("schedule_days")
    .upsert(
      { stable_id: stableId, day: input.day, open_hour: input.openHour, close_hour: input.closeHour },
      { onConflict: "stable_id,day" },
    )
    .select("id")
    .single();

  if (dayError) {
    throw dayError;
  }

  const scheduleDayId = dayRow.id;

  const removal = client.from("schedule_day_horses").delete().eq("schedule_day_id", scheduleDayId);
  const { error: removeError } =
    input.horseIds.length === 0 ? await removal : await removal.not("horse_id", "in", `(${input.horseIds.join(",")})`);

  if (removeError) {
    throw removeError;
  }

  if (input.horseIds.length === 0) {
    return;
  }

  const { error: insertError } = await client.from("schedule_day_horses").upsert(
    input.horseIds.map((horseId) => ({
      schedule_day_id: scheduleDayId,
      horse_id: horseId,
      stable_id: stableId,
    })),
    { onConflict: "schedule_day_id,horse_id", ignoreDuplicates: true },
  );

  if (insertError) {
    throw insertError;
  }
}
