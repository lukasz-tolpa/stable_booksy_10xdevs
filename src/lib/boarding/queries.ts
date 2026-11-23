import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { BoardingFeeChange } from "@/lib/boarding/fees";
import type { BoardingHorse, BoardingStay } from "@/lib/boarding/month";
import type { StableBoardingRow } from "@/lib/boarding/view";

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

/** Pobyt ze wspólnego odczytu: z identyfikatorem i tym, kto ostatnio ustawił dzień wyjazdu. */
export interface BoardingStayRecord extends BoardingStay {
  id: number;
  departureSetBy: string | null;
}

/** Wiersz `listBoardingHorses`: koń z ośrodkiem, pensjonariuszem, pobytami i zmianami opłaty za pensjonat. */
export interface BoardingHorseRecord extends BoardingHorse {
  stays: BoardingStayRecord[];
  fees: BoardingFeeChange[];
}

/** Czyje konie: jednego pensjonariusza (wszędzie albo w jednym ośrodku) albo całego ośrodka. */
export type BoardingHorsesFilter = { riderId: string; stableId?: number } | { riderId?: undefined; stableId: number };

const BOARDING_HORSE_COLUMNS =
  "horse_id, stable_id, rider_id, horses(name), stables(name), profiles(full_name), horse_stays(id, arrival_day, departure_day, departure_set_by), boarding_fees(id, from_month, amount)";

/**
 * Wspólny odczyt koni pensjonatowych z właścicielami i pobytami (#112) — jedyne źródło reguły „pensjonariusz
 * w miesiącu” i „koń w ośrodku w dniu” po stronie aplikacji: „Moje konie”, dzień ośrodka u jeźdźca, zajętość
 * placów, zapisy dnia, rozliczenia, podsumowanie miesiąca. Każdy moduł bierze z wiersza swoje pola
 * (`@/lib/boarding/month`). Wszystkie pobyty i opłaty — pobyt sprzed miesiąca też decyduje, a pierwsza opłata
 * działa wstecz. RLS: `horse_owners`, `horse_stays` i `boarding_fees` czyta właściciel ośrodka i sam pensjonariusz;
 * profil pensjonariusza właściciel czyta od dnia przyjazdu konia (wcześniej `riderName` NULL). Filtry konta
 * i ośrodka jawnie obok RLS. Lista „Pensjonariusze” ma własny odczyt (`listStableBoardingHorses`: e-mail
 * i nazwisko także przed przyjazdem). Rzuca przy błędzie odczytu.
 */
export async function listBoardingHorses(client: Client, filter: BoardingHorsesFilter): Promise<BoardingHorseRecord[]> {
  let query = client.from("horse_owners").select(BOARDING_HORSE_COLUMNS);
  if (filter.riderId !== undefined) {
    query = query.eq("rider_id", filter.riderId);
  }
  if (filter.stableId !== undefined) {
    query = query.eq("stable_id", filter.stableId);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data.map((row) => ({
    horseId: row.horse_id,
    horseName: row.horses.name,
    stableId: row.stable_id,
    stableName: row.stables.name,
    riderKey: row.rider_id,
    riderName: row.profiles?.full_name ?? null,
    stays: row.horse_stays.map((stay) => ({
      id: stay.id,
      arrivalDay: stay.arrival_day,
      departureDay: stay.departure_day,
      departureSetBy: stay.departure_set_by,
    })),
    fees: row.boarding_fees.map((fee) => toBoardingFeeChange(row.horse_id, fee)),
  }));
}

/** Wiersz `public.boarding_fees` w kształcie modułu opłat (#117). */
function toBoardingFeeChange(
  horseId: number,
  row: { id: number; from_month: string; amount: number },
): BoardingFeeChange {
  return { id: row.id, horseId, fromMonth: row.from_month.slice(0, 7), amount: row.amount };
}

/**
 * Wszystkie zmiany opłat za pensjonat koni ośrodka (#117) — strona „Pensjonariusze”. Jawny filtr ośrodka
 * obok RLS. Rzuca przy błędzie odczytu.
 */
export async function listStableBoardingFees(client: Client, stableId: number): Promise<BoardingFeeChange[]> {
  const { data, error } = await client
    .from("boarding_fees")
    .select("id, horse_id, from_month, amount")
    .eq("stable_id", stableId)
    .order("from_month");
  if (error) {
    throw error;
  }
  return data.map((row) => toBoardingFeeChange(row.horse_id, row));
}

export interface BoardingFeeWrite {
  stableId: number;
  horseId: number;
  /** Miesiąc „od” `RRRR-MM` — bieżący albo następny (pilnuje baza, SB060). */
  fromMonth: string;
  /** Grosze. */
  amount: number;
}

/**
 * Zapis zmiany opłaty za pensjonat (#117): zajęty miesiąc nadpisuje kwotę (klucz
 * `boarding_fees_one_change_per_month_key`). Odczyt wiersza po zapisie — sukces dopiero, gdy wiersz wrócił.
 * Koń spoza koni pensjonatowych ośrodka — 23503 (klucz obcy do `horse_owners`).
 */
export function saveBoardingFee(client: Client, fee: BoardingFeeWrite) {
  return client
    .from("boarding_fees")
    .upsert(
      {
        stable_id: fee.stableId,
        horse_id: fee.horseId,
        from_month: `${fee.fromMonth}-01`,
        amount: fee.amount,
      },
      { onConflict: "horse_id,from_month" },
    )
    .select("id, horse_id")
    .maybeSingle();
}

/**
 * Usunięcie zaplanowanej zmiany opłaty (#117). Obowiązującej baza nie usunie (SB061). Zwraca usunięte
 * wiersze — pusta lista: zmiany nie ma albo nie należy do ośrodka.
 */
export function deleteBoardingFee(client: Client, stableId: number, feeId: number) {
  return client.from("boarding_fees").delete().eq("id", feeId).eq("stable_id", stableId).select("id, horse_id");
}
