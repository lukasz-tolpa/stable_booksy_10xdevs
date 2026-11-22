// PROTOTYPE — wspólne propsy wariantów strony „Rozliczenia” (?variant=). Throwaway, gałąź prototype/rozliczenia-ux.
import type { AddCostView } from "@/lib/settlements/costs";
import type { SettlementsView } from "@/lib/settlements/settlements";

export interface VariantProps {
  view: SettlementsView;
  addCost: AddCostView | null;
  /** Oglądany miesiąc `RRRR-MM`. */
  month: string;
  saved: boolean;
  error: string | null;
}
