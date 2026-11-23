import type { APIRoute } from "astro";
import { errorCode } from "@/lib/db-errors";
import { logError } from "@/lib/log";
import { MONTH_PARAM, requestedSummaryMonth, type SummaryMonth } from "@/lib/month-summary/month";
import { todayIso } from "@/lib/schedule/dates";
import { composeSettlementDocument, isSettlementPdfAvailable } from "@/lib/settlements/document";
import { settlementPdfErrorMessage } from "@/lib/settlements/errors";
import { ownerRequest, type StableOwner } from "@/lib/stables/owner-request";
import { loadRiderSettlementInput } from "@/lib/settlements/queries";
import { backToRiderSettlement, NO_OUTCOME, type BackOutcome } from "@/lib/settlements/redirect";
import { composeRiderSettlement, parseRiderKey } from "@/lib/settlements/rider";
import { getStableById } from "@/lib/stables/queries";

export const prerender = false;

const SCOPE = "page:osrodek/rozliczenia/[jezdziec]/pdf";

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
 * PDF albo — gdy go nie ma — `null`: jeździec spoza ośrodka, zanonimizowany albo nieznany, albo PDF
 * niedostępny (`isSettlementPdfAvailable`: bez stawki ośrodka, bez jazd i kosztów, miesiąc przyszły).
 * Wyjątek odczytu albo generowania leci dalej, do `GET`.
 */
async function settlementPdf(owner: StableOwner, riderKey: string, month: SummaryMonth, now: Date) {
  const [input, stable] = await Promise.all([
    loadRiderSettlementInput(owner.supabase, owner.stableId, riderKey, month),
    getStableById(owner.supabase, owner.stableId),
  ]);
  if (input === null) {
    return null;
  }
  if (stable === null) {
    // Ośrodek z sesji właściciela, którego nie da się odczytać, to awaria, nie brak PDF.
    throw new Error("Brak ośrodka właściciela przy PDF rozliczenia");
  }

  const settlement = composeRiderSettlement({ ...input, dayHref: null }, now);
  if (!isSettlementPdfAvailable(settlement, now)) {
    return null;
  }

  const content = composeSettlementDocument({ settlement, stable }, now);
  const { renderSettlementPdf } = await import("@/lib/settlements/pdf/render");
  return pdfResponse(content.fileName, renderSettlementPdf(content));
}

/**
 * PDF rozliczenia jeźdźca za miesiąc (spec #100): `/osrodek/rozliczenia/<jeździec>/pdf?miesiac=RRRR-MM`.
 * Dostęp pilnuje middleware (przestrzeń ośrodka tylko dla właściciela); ośrodek z sesji
 * (`ownerRequest`), jeździec i dane z tego samego odczytu co strona jeźdźca (`loadRiderSettlementInput`)
 * i modelu widoku (`composeRiderSettlement`) — PDF mówi to samo co strona.
 * jsPDF i czcionki ładuje dynamiczny `import()` — tylko tutaj, osobny kawałek paczki workera.
 *
 * Brzegi (#102): gdy PDF nie ma (także niepoprawny klucz jeźdźca) — powrót na stronę jeźdźca bez
 * komunikatu, bo strona w tej sytuacji nie pokazuje „Pobierz PDF”. Miesiąc z adresu bierze
 * `requestedSummaryMonth`: przyszły zostaje przyszłym, więc odmawia mu `isSettlementPdfAvailable` (powrót na
 * stronę jeźdźca tego miesiąca), a niepoprawny daje bieżący jak na stronie. Awaria odczytu albo generowania —
 * log ze szczegółami i powrót na stronę jeźdźca z banerem `SETTLEMENT_PDF_FAILED`.
 */
export const GET: APIRoute = async (context) => {
  const now = new Date();
  const month = requestedSummaryMonth(context.url.searchParams.get(MONTH_PARAM), todayIso(now));
  const riderKey = parseRiderKey(context.params.jezdziec);
  if (riderKey === null) {
    return backToRiderSettlement(context, context.params.jezdziec ?? "", month.month, NO_OUTCOME);
  }
  const back = (outcome: BackOutcome) => backToRiderSettlement(context, riderKey, month.month, outcome);

  const owner = await ownerRequest(context, SCOPE, back);
  if (owner instanceof Response) {
    return owner;
  }

  try {
    return (await settlementPdf(owner, riderKey, month, now)) ?? back(NO_OUTCOME);
  } catch (error) {
    logError(SCOPE, error);
    return back(settlementPdfErrorMessage(errorCode(error)));
  }
};
