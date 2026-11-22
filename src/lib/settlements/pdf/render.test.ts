import { describe, expect, it } from "vitest";
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
    ...overrides,
  };
}

function header(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.subarray(0, 5));
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
