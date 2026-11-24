import type { AstroGlobal } from "astro";
import { countPendingBookings } from "@/lib/bookings/queries";
import { logError } from "@/lib/log";
import { createClient } from "@/lib/supabase";

/**
 * Licznik zapisów do przyjęcia konta (#128) dla nawigacji i panelu — jeden odczyt na żądanie: dolny pasek
 * sekcji, zakładki instruktora i panel biorą tę samą obietnicę (pamięć podręczna po `Astro.locals`, które żyje
 * tyle, co żądanie). `null` — liczby nie udało się wczytać (awaria trafia do logu, nawigacja zostaje bez licznika).
 */
const counts = new WeakMap<App.Locals, Promise<number | null>>();

export function loadPendingCount(astro: Pick<AstroGlobal, "locals" | "request" | "cookies">): Promise<number | null> {
  const cached = counts.get(astro.locals);
  if (cached) {
    return cached;
  }

  const supabase = createClient(astro.request.headers, astro.cookies);
  const count = supabase
    ? countPendingBookings(supabase).catch((error: unknown) => {
        logError("pending-count", error);
        return null;
      })
    : Promise.resolve(null);
  counts.set(astro.locals, count);
  return count;
}
