import type { APIRoute } from "astro";
import { MONTH_PARAM, resolveSummaryMonth } from "@/lib/month-summary/month";
import { todayIso } from "@/lib/schedule/dates";
import { composeSettlementDocument, isSettlementPdfAvailable } from "@/lib/settlements/document";
import { settlementOwner } from "@/lib/settlements/owner-request";
import { getSettlementRider, loadRiderSettlementInput } from "@/lib/settlements/queries";
import { backToRiderSettlement } from "@/lib/settlements/redirect";
import { composeRiderSettlement, parseRiderKey } from "@/lib/settlements/rider";
import { getStableById } from "@/lib/stables/queries";

export const prerender = false;

const SCOPE = "page:osrodek/rozliczenia/[jezdziec]/pdf";

/**
 * Brak PDF: jeździec spoza ośrodka, zanonimizowany albo nieznany, ośrodek nie do odczytania, albo PDF
 * niedostępny (`isSettlementPdfAvailable`). Strona w tej sytuacji nie pokazuje „Pobierz PDF”.
 * #102: zamiast 404 — powrót na stronę rozliczenia jeźdźca tego miesiąca.
 */
function noPdf(): Response {
  return new Response(null, { status: 404 });
}

/** Plik do zapisania, nie podgląd; nazwa ASCII, `filename*` dla pewności. Bez cache'owania po drodze. */
function pdfResponse(fileName: string, bytes: Uint8Array<ArrayBuffer>): Response {
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * PDF rozliczenia jeźdźca za miesiąc (spec #100): `/osrodek/rozliczenia/<jeździec>/pdf?miesiac=RRRR-MM`.
 * Dostęp pilnuje middleware (przestrzeń ośrodka tylko dla właściciela); ośrodek z sesji
 * (`settlementOwner`), jeździec i miesiąc jak na stronie jeźdźca, dane z tego samego odczytu
 * (`loadRiderSettlementInput`) i modelu widoku (`composeRiderSettlement`) — PDF mówi to samo co strona.
 * jsPDF i czcionki ładuje dynamiczny `import()` — tylko tutaj, osobny kawałek paczki workera.
 */
export const GET: APIRoute = async (context) => {
  const now = new Date();
  const month = resolveSummaryMonth(context.url.searchParams.get(MONTH_PARAM), todayIso(now));
  const riderKey = parseRiderKey(context.params.jezdziec);
  if (riderKey === null) {
    return noPdf();
  }

  const owner = await settlementOwner(context, SCOPE, (error) =>
    backToRiderSettlement(context, riderKey, month.month, error),
  );
  if (owner instanceof Response) {
    return owner;
  }

  const [rider, stable] = await Promise.all([
    getSettlementRider(owner.supabase, riderKey),
    getStableById(owner.supabase, owner.stableId),
  ]);
  if (rider === null || stable === null) {
    return noPdf();
  }

  const input = await loadRiderSettlementInput(owner.supabase, owner.stableId, month, rider);
  const settlement = composeRiderSettlement({ ...input, dayHref: null }, now);
  if (!isSettlementPdfAvailable(settlement, now)) {
    return noPdf();
  }

  const document = composeSettlementDocument({ settlement, stable }, now);
  const { renderSettlementPdf } = await import("@/lib/settlements/pdf/render");
  return pdfResponse(document.fileName, renderSettlementPdf(document));
};
