/**
 * Renderer PDF rozliczenia jeźdźca (spec #100) — cienka warstwa: gotową treść (`SettlementDocument`
 * z `@/lib/settlements/document`) zamienia na bajty PDF przez jsPDF + jspdf-autotable. Niczego nie
 * liczy ani nie formatuje — rysuje teksty w kolejności dokumentu. A4 pionowo, czarno-biały, Inter
 * 400/600 wbudowany w worker (`fonts.ts`, `npm run pdf:font`).
 *
 * Ładuje go WYŁĄCZNIE punkt końcowy PDF, dynamicznym `import()` — jsPDF i czcionki trafiają do osobnego
 * kawałka paczki workera, którego reszta aplikacji nie wczytuje (limit CPU, spec #100).
 *
 * Wiele stron (#102): tabele przechodzą na kolejne strony z powtórzonym nagłówkiem (`showHead: "everyPage"`),
 * wiersz nie dzieli się między strony, długie nazwy zawijają się w komórce; teksty pod tabelami pilnuje
 * `ensureSpace`. Stopkę z „strona X z Y” rysuje na końcu `drawFooters`.
 */

import { jsPDF } from "jspdf";
import { autoTable, type Styles } from "jspdf-autotable";
import type { DocumentTable, SettlementDocument } from "@/lib/settlements/document";
import { INTER_REGULAR, INTER_SEMIBOLD } from "@/lib/settlements/pdf/fonts";

const FONT = "Inter";
/** Punkty typograficzne (1/72 cala); A4 to 595 × 842 pt. */
const MARGIN = 48;
const FOOTER_SPACE = 36;
const BLACK = 0;
const RULE_GRAY = 160;

const SIZE = { title: 17, body: 10.5, small: 9, heading: 12, due: 13 } as const;
/** Odstęp między wierszami tekstu jako krotność rozmiaru czcionki. */
const LEADING = 1.4;

/** Pozycja kursora po narysowanej tabeli (`jspdf-autotable` zapisuje ją na dokumencie). */
interface WithLastTable {
  lastAutoTable?: { finalY?: number };
}

function createDocument(title: string): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait", compress: true });
  doc.addFileToVFS("Inter-Regular.ttf", INTER_REGULAR);
  doc.addFont("Inter-Regular.ttf", FONT, "normal");
  doc.addFileToVFS("Inter-SemiBold.ttf", INTER_SEMIBOLD);
  doc.addFont("Inter-SemiBold.ttf", FONT, "bold");
  // jspdf-autotable przy każdej komórce woła `getFontList()`, a jsPDF za każdym razem buduje listę od nowa
  // (14 czcionek standardowych × style + Inter). Czcionki dokumentu już się nie zmienią, więc lista
  // liczona raz — ~10% czasu generowania przy 25+ jazdach, ten sam plik (#102, limit CPU Workers Free).
  const fonts = doc.getFontList();
  doc.getFontList = () => fonts;
  doc.setProperties({ title });
  doc.setTextColor(BLACK);
  doc.setDrawColor(RULE_GRAY);
  return doc;
}

function pageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

function contentWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth() - 2 * MARGIN;
}

/** Nowa strona, gdy następny blok (`needed` pt) nie zmieści się nad stopką. Zwraca kursor. */
function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed <= pageHeight(doc) - MARGIN - FOOTER_SPACE) {
    return y;
  }
  doc.addPage();
  return MARGIN;
}

/** Akapit z zawijaniem do szerokości treści; zwraca kursor pod nim. */
function paragraph(doc: jsPDF, text: string, y: number, size: number, style: "normal" | "bold" = "normal"): number {
  doc.setFont(FONT, style);
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, contentWidth(doc)) as string[];
  const lineHeight = size * LEADING;
  const top = ensureSpace(doc, y, lines.length * lineHeight);
  doc.text(lines, MARGIN, top + size, { lineHeightFactor: LEADING });
  return top + lines.length * lineHeight;
}

/**
 * Tabela z nagłówkiem powtarzanym na każdej stronie; wiersz nie dzieli się między strony, długi tekst
 * zawija się w komórce. `columns` — style kolumn (szerokość, wyrównanie) dla nagłówka i wierszy.
 */
function table(doc: jsPDF, data: DocumentTable, y: number, columns: Partial<Styles>[]): number {
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN, top: MARGIN, bottom: MARGIN + FOOTER_SPACE },
    head: [data.columns],
    body: data.rows,
    theme: "plain",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: {
      font: FONT,
      fontStyle: "normal",
      fontSize: SIZE.body,
      textColor: BLACK,
      lineColor: RULE_GRAY,
      overflow: "linebreak",
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
    },
    headStyles: { fontStyle: "bold", lineWidth: { bottom: 0.75 } },
    bodyStyles: { lineWidth: { bottom: 0.25 } },
    didParseCell: (data) => {
      Object.assign(data.cell.styles, columns[data.column.index]);
    },
  });
  return (doc as unknown as WithLastTable).lastAutoTable?.finalY ?? y;
}

/** Kolumny tabeli jazd: data, godzina — stała szerokość; instruktor i koń dzielą resztę. */
const RIDE_COLUMNS: Partial<Styles>[] = [{ cellWidth: 78 }, { cellWidth: 56 }, {}, { cellWidth: 130 }];
/** Kolumny tabeli kosztów: nazwa, kwota do prawej. */
const COST_COLUMNS: Partial<Styles>[] = [{}, { cellWidth: 110, halign: "right" }];

/**
 * Stopka na każdej stronie: data wygenerowania z lewej, „strona X z Y” z prawej. Rysowana na końcu,
 * gdy liczba stron jest już znana.
 */
function drawFooters(doc: jsPDF, content: Pick<SettlementDocument, "footer" | "pageLabel">): void {
  const pages = doc.getNumberOfPages();
  const baseline = pageHeight(doc) - MARGIN;
  const right = MARGIN + contentWidth(doc);
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont(FONT, "normal");
    doc.setFontSize(SIZE.small);
    doc.text(content.footer, MARGIN, baseline);
    doc.text(content.pageLabel(page, pages), right, baseline, { align: "right" });
  }
}

/** Bajty PDF rozliczenia jeźdźca. */
export function renderSettlementPdf(content: SettlementDocument): Uint8Array<ArrayBuffer> {
  const doc = createDocument(content.title);
  let y = MARGIN;

  y = paragraph(doc, content.title, y, SIZE.title, "bold");
  if (content.asOf) {
    y = paragraph(doc, content.asOf, y, SIZE.body);
  }
  y += 10;
  for (const line of content.header) {
    y = paragraph(doc, `${line.label}: ${line.value}`, y, SIZE.body);
  }

  y = paragraph(doc, `${content.ridesLine} (${content.rateSourceText})`, y + 14, SIZE.heading, "bold");
  y += 4;
  y =
    content.rides.emptyText === null
      ? table(doc, content.rides, y, RIDE_COLUMNS)
      : paragraph(doc, content.rides.emptyText, y, SIZE.body);

  y = paragraph(doc, content.costs.heading, y + 16, SIZE.heading, "bold");
  y += 2;
  y =
    content.costs.emptyText === null
      ? table(doc, content.costs, y, COST_COLUMNS)
      : paragraph(doc, content.costs.emptyText, y, SIZE.body);

  y = ensureSpace(doc, y + 18, SIZE.due * 2);
  doc.setDrawColor(BLACK);
  doc.setLineWidth(1);
  doc.line(MARGIN, y, MARGIN + contentWidth(doc), y);
  doc.setFont(FONT, "bold");
  doc.setFontSize(SIZE.due);
  const baseline = y + SIZE.due * 1.6;
  doc.text(content.due.label, MARGIN, baseline);
  doc.text(content.due.value, MARGIN + contentWidth(doc), baseline, { align: "right" });

  drawFooters(doc, content);
  return new Uint8Array(doc.output("arraybuffer"));
}
