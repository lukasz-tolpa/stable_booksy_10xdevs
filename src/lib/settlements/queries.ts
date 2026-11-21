import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { SummaryMonth } from "@/lib/month-summary/month";
import type { ExtraCost } from "@/lib/settlements/costs";
import type { RateChange } from "@/lib/settlements/rates";
import type { SettlementRider } from "@/lib/settlements/rider";
import { settlementBookings, type SettlementsInput } from "@/lib/settlements/settlements";
import { getStatsRows } from "@/lib/stats/queries";
import type { Rate } from "@/types";

type Client = SupabaseClient<Database>;

/** Miesiąc `RRRR-MM` jako kolumna `from_month` (pierwszy dzień miesiąca). */
export function monthStartDate(month: string): string {
  return `${month}-01`;
}

/** Wiersz `public.rates` w kształcie modułu rozliczeń. */
export function toRateChange(row: Pick<Rate, "id" | "rider_id" | "from_month" | "amount">): RateChange {
  return { id: row.id, riderKey: row.rider_id, fromMonth: row.from_month.slice(0, 7), amount: row.amount };
}

/**
 * Wszystkie zmiany stawki ośrodka — stawki ośrodka i indywidualne. Jawny filtr ośrodka obok RLS
 * (właściciel i tak widzi tylko swoje). Rzuca przy błędzie zapytania; strona pokazuje stan awarii.
 */
export async function listRates(client: Client, stableId: number): Promise<RateChange[]> {
  const { data, error } = await client
    .from("rates")
    .select("id, rider_id, from_month, amount")
    .eq("stable_id", stableId)
    .order("from_month");

  if (error) {
    throw error;
  }
  return data.map(toRateChange);
}

/**
 * Wszystko, czego lista rozliczeń miesiąca potrzebuje (`composeSettlementList`): zapisy ośrodka z dni
 * miesiąca — ten sam odczyt co Podsumowanie miesiąca właściciela —, zmiany stawki i koszty dodatkowe
 * miesiąca. Panel ośrodka bierze stąd sumę bieżącego miesiąca, strona „Rozliczenia” — listę; nowe
 * składniki rozliczenia dochodzą tutaj, więc panel ich nie zna. Rzuca przy błędzie zapytania.
 */
export async function loadSettlementsInput(
  client: Client,
  stableId: number,
  month: SummaryMonth,
): Promise<SettlementsInput> {
  const [rows, rates, costs] = await Promise.all([
    getStatsRows(client, stableId, month),
    listRates(client, stableId),
    listMonthCosts(client, stableId, month.month),
  ]);
  return { month, bookings: settlementBookings(rows), rates, costs };
}

export interface RateWrite {
  stableId: number;
  /** `null` — stawka ośrodka. */
  riderId: string | null;
  /** Miesiąc „od” `RRRR-MM` — bieżący albo następny (pilnuje baza, SB026). */
  fromMonth: string;
  /** Grosze; `null` tylko przy stawce indywidualnej (powrót do stawki ośrodka, #97). */
  amount: number | null;
}

/**
 * Zapis zmiany stawki: zajęty miesiąc nadpisuje kwotę („wygrywa ostatnia”, klucz
 * `rates_one_change_per_month_key`). Odczyt wiersza po zapisie — sukces dopiero, gdy wiersz wrócił.
 */
export function saveRate(client: Client, rate: RateWrite) {
  return client
    .from("rates")
    .upsert(
      {
        stable_id: rate.stableId,
        rider_id: rate.riderId,
        from_month: monthStartDate(rate.fromMonth),
        amount: rate.amount,
      },
      { onConflict: "stable_id,rider_id,from_month" },
    )
    .select("id, rider_id, from_month, amount")
    .maybeSingle();
}

/**
 * Usunięcie zaplanowanej zmiany stawki ośrodka — tylko zmiany stawki ośrodka (`rider_id` pusty), więc
 * spreparowany formularz „Rozliczeń” nie usunie zmiany stawki jeźdźca. Obowiązującej baza nie usunie
 * (SB027). Zwraca usunięte wiersze — pusta lista: zmiany nie ma, nie należy do ośrodka albo jest zmianą jeźdźca.
 */
export function deleteRate(client: Client, stableId: number, rateId: number) {
  return client.from("rates").delete().eq("id", rateId).eq("stable_id", stableId).is("rider_id", null).select("id");
}

/**
 * Usunięcie zaplanowanej zmiany stawki jeźdźca (#97) — tylko zmiany tego jeźdźca, więc spreparowany
 * formularz rozliczenia jeźdźca nie usunie stawki ośrodka. Obowiązującej baza nie usunie (SB027).
 * Zwraca usunięte wiersze — pusta lista: zmiany nie ma albo nie należy do jeźdźca lub ośrodka.
 */
export function deleteRiderRate(client: Client, stableId: number, riderId: string, rateId: number) {
  return client.from("rates").delete().eq("id", rateId).eq("stable_id", stableId).eq("rider_id", riderId).select("id");
}

/**
 * Jeździec rozliczenia z adresu strony: profil konta `rider`, który właściciel widzi — RLS na
 * `profiles` (`is_rider_of_my_stable`) pokazuje tylko jeźdźców z zapisem w jego ośrodku. `null` —
 * jeździec spoza ośrodka, zanonimizowany (profil usunięty) albo nieznany. Rzuca przy błędzie zapytania.
 */
export async function getSettlementRider(client: Client, riderKey: string): Promise<SettlementRider | null> {
  const { data, error } = await client
    .from("profiles")
    .select("id, full_name")
    .eq("id", riderKey)
    .eq("role", "rider")
    .maybeSingle();

  if (error) {
    throw error;
  }
  return data === null ? null : { key: data.id, name: data.full_name };
}

// ---------------------------------------------------------------------------
// Koszty dodatkowe (#96, `public.extra_costs`)
// ---------------------------------------------------------------------------

const COST_COLUMNS = "id, rider_id, name, amount, profiles(full_name)";

/**
 * Koszty dodatkowe ośrodka w miesiącu `RRRR-MM`, od najwcześniej dopisanego, z nazwą jeźdźca z profilu.
 * Jawny filtr ośrodka obok RLS. Rzuca przy błędzie zapytania; strona pokazuje stan awarii.
 */
export async function listMonthCosts(client: Client, stableId: number, month: string): Promise<ExtraCost[]> {
  const { data, error } = await client
    .from("extra_costs")
    .select(COST_COLUMNS)
    .eq("stable_id", stableId)
    .eq("month", monthStartDate(month))
    .order("created_at")
    .order("id");

  if (error) {
    throw error;
  }
  return data.map((row) => {
    // Profil jeźdźca kosztu jest zawsze widoczny (zapis wymaga jeźdźca ośrodka), ale osadzenie pod RLS
    // daje `null`, gdyby profil był ukryty — wtedy „(bez nazwiska)”, nie błąd.
    const profile = row.profiles as { full_name: string | null } | null;
    return {
      id: row.id,
      riderKey: row.rider_id,
      riderName: profile?.full_name ?? null,
      name: row.name,
      amount: row.amount,
    };
  });
}

/**
 * Jeźdźcy ośrodka do wyboru przy „Dopisz koszt”: profile kont `rider`, które właściciel widzi — RLS na
 * `profiles` (`is_rider_of_my_stable`) pokazuje konta z jakimkolwiek zapisem w jego ośrodku, także
 * odwołanym. Bez nowych uprawnień; kolejność ustala `costRiderOptions`. Rzuca przy błędzie zapytania.
 */
export async function listStableRiders(client: Client): Promise<SettlementRider[]> {
  const { data, error } = await client.from("profiles").select("id, full_name").eq("role", "rider");

  if (error) {
    throw error;
  }
  return data.map((row) => ({ key: row.id, name: row.full_name }));
}

export interface ExtraCostWrite {
  stableId: number;
  riderId: string;
  /** Miesiąc `RRRR-MM` — bieżący albo miniony (pilnuje baza, SB029). */
  month: string;
  name: string;
  /** Grosze. */
  amount: number;
}

/** Dopisanie kosztu dodatkowego z odczytem wiersza po zapisie — sukces dopiero, gdy wiersz wrócił. */
export function addCost(client: Client, cost: ExtraCostWrite) {
  return client
    .from("extra_costs")
    .insert({
      stable_id: cost.stableId,
      rider_id: cost.riderId,
      month: monthStartDate(cost.month),
      name: cost.name,
      amount: cost.amount,
    })
    .select("id, rider_id, month")
    .maybeSingle();
}

/**
 * Poprawka nazwy i kwoty kosztu ośrodka. Zwraca poprawiony wiersz (jeździec i miesiąc — powrót na jego
 * rozliczenie); `null` — kosztu nie ma albo nie należy do ośrodka.
 */
export function updateCost(client: Client, stableId: number, costId: number, change: { name: string; amount: number }) {
  return client
    .from("extra_costs")
    .update({ name: change.name, amount: change.amount })
    .eq("id", costId)
    .eq("stable_id", stableId)
    .select("id, rider_id, month")
    .maybeSingle();
}

/** Usunięcie kosztu ośrodka. Zwraca usunięte wiersze — pusta lista: kosztu nie ma albo jest cudzy. */
export function deleteCost(client: Client, stableId: number, costId: number) {
  return client.from("extra_costs").delete().eq("id", costId).eq("stable_id", stableId).select("id, rider_id, month");
}
