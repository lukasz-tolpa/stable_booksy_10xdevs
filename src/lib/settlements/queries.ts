import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import type { SummaryMonth } from "@/lib/month-summary/month";
import type { RateChange } from "@/lib/settlements/rates";
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
 * miesiąca — ten sam odczyt co Podsumowanie miesiąca właściciela — i zmiany stawki. Panel ośrodka bierze
 * stąd sumę bieżącego miesiąca; nowe składniki rozliczenia (koszty dodatkowe) dochodzą tutaj, więc panel
 * ich nie zna. Rzuca przy błędzie zapytania.
 */
export async function loadSettlementsInput(
  client: Client,
  stableId: number,
  month: SummaryMonth,
): Promise<SettlementsInput> {
  const [rows, rates] = await Promise.all([getStatsRows(client, stableId, month), listRates(client, stableId)]);
  return { month, bookings: settlementBookings(rows), rates };
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
 * Usunięcie zaplanowanej zmiany stawki ośrodka. Obowiązującej baza nie usunie (SB027). Zwraca usunięte
 * wiersze — pusta lista: zmiany nie ma albo nie należy do ośrodka.
 */
export function deleteRate(client: Client, stableId: number, rateId: number) {
  return client.from("rates").delete().eq("id", rateId).eq("stable_id", stableId).select("id");
}
