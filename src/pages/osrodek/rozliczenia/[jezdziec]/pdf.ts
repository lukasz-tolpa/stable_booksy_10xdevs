import type { APIContext, APIRoute } from "astro";
import { errorCode } from "@/lib/db-errors";
import { logError } from "@/lib/log";
import { MONTH_PARAM, requestedSummaryMonth, type SummaryMonth } from "@/lib/month-summary/month";
import { todayIso } from "@/lib/schedule/dates";
import { composeSettlementDocument, isSettlementPdfAvailable } from "@/lib/settlements/document";
import { settlementPdfErrorMessage } from "@/lib/settlements/errors";
import { settlementOwner, type SettlementOwner } from "@/lib/settlements/owner-request";
import { getSettlementRider, loadRiderSettlementInput } from "@/lib/settlements/queries";
import { backToRiderSettlement, riderSettlementHref } from "@/lib/settlements/redirect";
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
 * niedostępny (`isSettlementPdfAvailable`: bez stawki ośrodka, bez jazd i kosztów). Wyjątek odczytu
 * albo generowania leci dalej, do `GET`.
 */
async function settlementPdf(owner: SettlementOwner, riderKey: string, month: SummaryMonth, now: Date) {
  const [rider, stable] = await Promise.all([
    getSettlementRider(owner.supabase, riderKey),
    getStableById(owner.supabase, owner.stableId),
  ]);
  if (rider === null) {
    return null;
  }
  if (stable === null) {
    // Ośrodek z sesji właściciela, którego nie da się odczytać, to awaria, nie brak PDF.
    throw new Error("Brak ośrodka właściciela przy PDF rozliczenia");
  }

  const input = await loadRiderSettlementInput(owner.supabase, owner.stableId, month, rider);
  const settlement = composeRiderSettlement({ ...input, dayHref: null }, now);
  if (!isSettlementPdfAvailable(settlement, now)) {
    return null;
  }

  const document = composeSettlementDocument({ settlement, stable }, now);
  const { renderSettlementPdf } = await import("@/lib/settlements/pdf/render");
  return pdfResponse(document.fileName, renderSettlementPdf(document));
}

/** Bez PDF — strona rozliczenia jeźdźca tego miesiąca; ona sama mówi, czego brakuje (albo „Nie ma takiego jeźdźca.”). */
function toRiderPage(context: APIContext, riderKey: string, month: SummaryMonth): Response {
  return context.redirect(riderSettlementHref(riderKey, month.month));
}

/**
 * PDF rozliczenia jeźdźca za miesiąc (spec #100): `/osrodek/rozliczenia/<jeździec>/pdf?miesiac=RRRR-MM`.
 * Dostęp pilnuje middleware (przestrzeń ośrodka tylko dla właściciela); ośrodek z sesji
 * (`settlementOwner`), jeździec i miesiąc jak na stronie jeźdźca, dane z tego samego odczytu
 * (`loadRiderSettlementInput`) i modelu widoku (`composeRiderSettlement`) — PDF mówi to samo co strona.
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
    return toRiderPage(context, context.params.jezdziec ?? "", month);
  }

  const owner = await settlementOwner(context, SCOPE, (error) =>
    backToRiderSettlement(context, riderKey, month.month, error),
  );
  if (owner instanceof Response) {
    return owner;
  }

  try {
    return (await settlementPdf(owner, riderKey, month, now)) ?? toRiderPage(context, riderKey, month);
  } catch (error) {
    logError(SCOPE, error);
    return backToRiderSettlement(context, riderKey, month.month, settlementPdfErrorMessage(errorCode(error)));
  }
};
