/**
 * Treść PDF rozliczenia jeźdźca (spec #100, KAN-91) — struktura dokumentu niezależna od biblioteki PDF.
 * Wszystkie kwoty i teksty pochodzą z rozliczenia jeźdźca (`composeRiderSettlement`, `dayHref: null`),
 * więc PDF mówi dokładnie to samo co strona; tu nic się nie liczy. Bajty PDF robi `pdf/render.ts`.
 *
 * Klocki:
 * - `isSettlementPdfAvailable` — jedyna decyzja, czy PDF jest dostępny (strona: przycisk; punkt końcowy:
 *   generować czy nie);
 * - `composeSettlementDocument` — treść dokumentu;
 * - `settlementFileName` — `rozliczenie-RRRR-MM-<jeździec>.pdf`.
 */

import { formatDateTime, formatDayMonthYear } from "@/lib/format";
import { emptyMonthText } from "@/lib/month-summary/summary";
import { currentMonth } from "@/lib/schedule/dates";
import type { RiderSettlement } from "@/lib/settlements/rider";
import { SETTLEMENT_TEXTS } from "@/lib/settlements/texts";

/** Rozliczenie, które pokazuje „Do zapłaty” — tylko z takiego powstaje PDF. */
export type PricedRiderSettlement = RiderSettlement & { dueText: string; rateSourceText: string };

/**
 * Czy PDF rozliczenia jest dostępny: rozliczenie pokazuje „Do zapłaty” (ośrodek ma stawkę), w miesiącu
 * jest co najmniej jedna jazda albo koszt dodatkowy, a miesiąc nie jest przyszły (Europe/Warsaw).
 * Jedyne miejsce tej decyzji — strona pokazuje według niej „Pobierz PDF”, punkt końcowy generuje plik.
 */
export function isSettlementPdfAvailable(
  settlement: RiderSettlement,
  now: Date = new Date(),
): settlement is PricedRiderSettlement {
  return (
    settlement.dueText !== null &&
    settlement.rateSourceText !== null &&
    (settlement.rides > 0 || settlement.costs.length > 0) &&
    settlement.month <= currentMonth(now)
  );
}

/** Ośrodek w nagłówku dokumentu. */
export interface SettlementStable {
  name: string;
  city: string;
}

export interface SettlementDocumentInput {
  settlement: PricedRiderSettlement;
  stable: SettlementStable;
}

export interface SettlementDocument {
  /** Np. `rozliczenie-2026-11-anna-kowalska.pdf` (`settlementFileName`). */
  fileName: string;
  /** Np. `Rozliczenie za listopad 2026`. */
  title: string;
  /** Tylko w bieżącym miesiącu: `stan na 21 listopada 2026`; zakończony miesiąc — `null`. */
  asOf: string | null;
  /** Linie nagłówka: ośrodek z miastem, jeździec (nazwa jak na stronie, także „(bez nazwiska)”). */
  header: DocumentLine[];
  rides: DocumentTable & {
    /** Miesiąc bez jazd jeźdźca (same koszty dodatkowe) — tekst zamiast tabeli. */
    emptyText: string | null;
  };
  /** Np. `Jazdy: 8 × 120,00 zł = 960,00 zł`. */
  ridesLine: string;
  /** `stawka ośrodka` / `stawka indywidualna`. */
  rateSourceText: string;
  /** Koszty dodatkowe jeźdźca w miesiącu: nazwa, kwota. */
  costs: DocumentTable & {
    heading: string;
    /** Bez kosztów — tekst jak na stronie zamiast tabeli. */
    emptyText: string | null;
  };
  /** „Do zapłaty” i kwota. */
  due: DocumentLine;
  /** Np. `Wygenerowano 21.11.2026, 14:05` (Europe/Warsaw). */
  footer: string;
}

/** Linia „etykieta: wartość”. */
export interface DocumentLine {
  label: string;
  value: string;
}

/** Tabela dokumentu: nagłówki kolumn i wiersze komórek tekstu. */
export interface DocumentTable {
  columns: string[];
  rows: string[][];
}

/** Treść PDF rozliczenia jeźdźca w chwili `now` (dopisek „stan na” i stopka w strefie ośrodka). */
export function composeSettlementDocument(input: SettlementDocumentInput, now: Date = new Date()): SettlementDocument {
  const { settlement } = input;
  const texts = SETTLEMENT_TEXTS;
  const { columns } = texts.pdf;
  return {
    fileName: settlementFileName(settlement.month, settlement.unnamed ? null : settlement.name),
    title: `${texts.rider.forMonth} ${settlement.monthLabel}`,
    asOf: settlement.month === currentMonth(now) ? `${texts.pdf.asOf} ${formatDayMonthYear(now)}` : null,
    header: [
      { label: texts.pdf.stable, value: `${input.stable.name}, ${input.stable.city}` },
      { label: texts.pdf.rider, value: settlement.name },
    ],
    rides: {
      columns: [columns.date, columns.hour, columns.instructor, columns.horse],
      rows: settlement.rideRows.map((row) => [
        row.date,
        row.hour,
        row.instructorName ?? "",
        row.withoutHorse ? texts.pdf.noHorse : row.horseName,
      ]),
      emptyText: settlement.rides === 0 ? emptyMonthText(settlement, "owner") : null,
    },
    ridesLine: settlement.ridesLine,
    rateSourceText: settlement.rateSourceText,
    costs: {
      heading: texts.costs.heading,
      columns: [texts.pdf.costName, texts.pdf.costAmount],
      rows: settlement.costs.map((cost) => [cost.name, cost.amountText]),
      emptyText: settlement.costs.length === 0 ? texts.costs.none : null,
    },
    due: { label: texts.rider.due, value: settlement.dueText },
    footer: `${texts.pdf.generated} ${formatDateTime(now)}`,
  };
}

/**
 * Litery łacińskie, których normalizacja Unicode nie rozkłada na literę ASCII i znak diakrytyczny
 * (ł nie jest „l z kreską” w sensie NFKD).
 */
const UNDECOMPOSABLE: Readonly<Record<string, string>> = {
  ł: "l",
  đ: "d",
  ð: "d",
  ħ: "h",
  ı: "i",
  ŀ: "l",
  ø: "o",
  ŧ: "t",
  ĸ: "k",
  ŋ: "n",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  þ: "th",
};

/** Nazwa jeźdźca jako fragment nazwy pliku: małe litery ASCII i cyfry rozdzielone pojedynczym „-”. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[łđðħıŀøŧĸŋßæœþ]/gu, (letter) => UNDECOMPOSABLE[letter] ?? letter)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Nazwa pliku PDF: `rozliczenie-RRRR-MM-<jeździec>.pdf`, np. `rozliczenie-2026-11-lukasz-zolc.pdf`.
 * Bez imienia i nazwiska (`null`) albo z pustym fragmentem — `jezdziec`, więc nazwa nigdy nie jest pusta.
 */
export function settlementFileName(month: string, riderName: string | null): string {
  const texts = SETTLEMENT_TEXTS.pdf;
  const rider = (riderName === null ? "" : slug(riderName)) || texts.unnamedSlug;
  return `${texts.fileStem}-${month}-${rider}.pdf`;
}
