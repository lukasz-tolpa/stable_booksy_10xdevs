import { describe, expect, it, vi } from "vitest";
import type { SettlementDocument } from "@/lib/settlements/document";
import { renderSettlementPdf } from "@/lib/settlements/pdf/render";

const zl = (text: string) => text.replaceAll(" ", " ");

function document(overrides: Partial<SettlementDocument> = {}): SettlementDocument {
  return {
    fileName: "rozliczenie-2026-10-lukasz-zolc.pdf",
    title: "Rozliczenie za październik 2026",
    asOf: "stan na 21 listopada 2026",
    header: [
      { label: "Ośrodek", value: "Stadnina Pod Dębem, Łódź" },
      { label: "Jeździec", value: "Łukasz Żółć-Müller" },
    ],
    rides: {
      columns: ["Data", "Godzina", "Instruktor", "Koń"],
      rows: [
        ["pt., 2 paź", "9:00", "Małgorzata Wiśniewska", "Źrebię"],
        ["pt., 16 paź", "10:00", "Jérôme Ångström", "—"],
      ],
      emptyText: null,
    },
    ridesLine: zl("Jazdy: 2 × 120,00 zł = 240,00 zł"),
    rateSourceText: "stawka ośrodka",
    costs: {
      heading: "Koszty dodatkowe",
      columns: ["Nazwa", "Kwota"],
      rows: [["Pensjonat konia „Gałązka”", zl("1 150,00 zł")]],
      emptyText: null,
    },
    due: { label: "Do zapłaty", value: zl("1 390,00 zł") },
    footer: "Wygenerowano 21.11.2026, 14:05",
    pageLabel: (page, pages) => `strona ${String(page)} z ${String(pages)}`,
    ...overrides,
  };
}

function header(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.subarray(0, 5));
}

/** Liczba stron pliku: obiekty `/Type /Page` (słowniki obiektów nie są kompresowane, strumienie treści tak). */
function pageCount(bytes: Uint8Array): number {
  return new TextDecoder("latin1").decode(bytes).match(/\/Type \/Page\b/g)?.length ?? 0;
}

/** `count` jazd z długimi nazwami instruktorów i koni co trzeci wiersz. */
function rides(count: number): string[][] {
  return Array.from({ length: count }, (_, index) => [
    `pt., ${String((index % 28) + 1)} paź`,
    "10:00",
    index % 3 === 0 ? "Małgorzata Wiśniewska-Grzęszczykiewicz-Brzęczyszczykiewicz" : "Marek Dębowski",
    index % 3 === 0 ? "Źrebię z bardzo długą nazwą stajenną po matce i ojcu" : "Iskra",
  ]);
}

// Oracle: AC #101 — renderer zwraca bajty PDF (zaczynają się od `%PDF`); polskie litery, ü/é/ö,
// „ ” — × i twarde spacje kwot nie wywracają generowania. Bez porównywania bajtów.
describe("renderSettlementPdf — bajty PDF", () => {
  it("dokument z polskimi literami i znakami kwot daje plik PDF", () => {
    const bytes = renderSettlementPdf(document());

    expect(header(bytes)).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("miesiąc bez jazd i bez kosztów w tabelach — teksty zamiast tabel, nadal PDF", () => {
    const base = document();
    const bytes = renderSettlementPdf(
      document({
        asOf: null,
        rides: { ...base.rides, rows: [], emptyText: "W październiku 2026 nie było jazd." },
        costs: { ...base.costs, rows: [], emptyText: "W tym miesiącu nie ma kosztów dodatkowych." },
      }),
    );

    expect(header(bytes)).toBe("%PDF-");
  });
});

// Oracle: AC #102 — długa lista jazd (80) rozkłada się na kolejne strony A4, a każda strona dostaje
// w stopce „strona X z Y” z prawdziwą liczbą stron. Treści stron nie czytamy (strumienie są skompresowane).
describe("renderSettlementPdf — wiele stron", () => {
  it("jedna strona przy kilku jazdach: „strona 1 z 1”", () => {
    const pageLabel = vi.fn((page: number, pages: number) => `strona ${String(page)} z ${String(pages)}`);
    const bytes = renderSettlementPdf(document({ pageLabel }));

    expect(pageCount(bytes)).toBe(1);
    expect(pageLabel.mock.calls).toEqual([[1, 1]]);
  });

  it("80 jazd daje więcej niż jedną stronę, a każda strona ma numer z liczbą wszystkich stron", () => {
    const base = document();
    const pageLabel = vi.fn((page: number, pages: number) => `strona ${String(page)} z ${String(pages)}`);
    const bytes = renderSettlementPdf(document({ rides: { ...base.rides, rows: rides(80) }, pageLabel }));

    const pages = pageCount(bytes);
    expect(header(bytes)).toBe("%PDF-");
    expect(pages).toBeGreaterThan(1);
    expect(pageLabel.mock.calls).toEqual(Array.from({ length: pages }, (_, index) => [index + 1, pages]));
  });
});
