import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { HORSE_HAS_BOOKINGS, HORSE_NOT_IN_STABLE, ScheduleSaveError } from "@/lib/schedule/errors";
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
 *
 * Sortowanie po `created_at`, a NIE po `day`: chodzi o dzień ułożony ostatnio, nie
 * o ten najdalszy w przyszłości. Inaczej jeden nietypowy dzień zaplanowany na sierpień
 * podpowiadałby swoje wartości przy układaniu jutra.
 */
export async function getLatestScheduleDay(client: Client, stableId: number): Promise<ScheduleDayData | null> {
  const { data, error } = await client
    .from("schedule_days")
    .select(DAY_COLUMNS)
    .eq("stable_id", stableId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? toScheduleDay(data) : null;
}

/** Wszystkie wskazane konie muszą należeć do tej stadniny. */
async function assertHorsesBelongToStable(client: Client, stableId: number, horseIds: number[]): Promise<void> {
  if (horseIds.length === 0) {
    return;
  }

  const { data, error } = await client.from("horses").select("id").eq("stable_id", stableId).in("id", horseIds);

  if (error) {
    throw error;
  }

  if (data.length !== horseIds.length) {
    throw new ScheduleSaveError(HORSE_NOT_IN_STABLE);
  }
}

/** Żaden z odpinanych koni nie może mieć aktywnego zapisu w tym dniu. */
async function assertRemovedHorsesHaveNoBookings(
  client: Client,
  scheduleDayId: number,
  keepHorseIds: number[],
): Promise<void> {
  const query = client.from("bookings").select("horse_id").eq("schedule_day_id", scheduleDayId).eq("status", "active");

  const { data, error } =
    keepHorseIds.length === 0 ? await query : await query.not("horse_id", "in", `(${keepHorseIds.join(",")})`);

  if (error) {
    throw error;
  }

  if (data.length > 0) {
    throw new ScheduleSaveError(HORSE_HAS_BOOKINGS);
  }
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
  const horseIds = [...new Set(input.horseIds)];

  // Obie kontrole PRZED pierwszym zapisem. Baza wyłapałaby te przypadki sama, ale dopiero
  // w połowie operacji - a wtedy godziny są już zmienione, a część koni odpięta, mimo że
  // użytkownik zobaczy komunikat o niepowodzeniu.
  await assertHorsesBelongToStable(client, stableId, horseIds);

  const existing = await getScheduleDay(client, stableId, input.day);
  if (existing) {
    await assertRemovedHorsesHaveNoBookings(client, existing.id, horseIds);
  }

  // Konflikt godzin (SB002) i daty (SB001) nie wymagają kontroli z wyprzedzeniem:
  // podnosi je pierwsza operacja poniżej, więc gdy wybuchają, nic nie zostało zmienione.
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
    horseIds.length === 0 ? await removal : await removal.not("horse_id", "in", `(${horseIds.join(",")})`);

  if (removeError) {
    throw removeError;
  }

  if (horseIds.length === 0) {
    return;
  }

  const { error: insertError } = await client.from("schedule_day_horses").upsert(
    horseIds.map((horseId) => ({
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
