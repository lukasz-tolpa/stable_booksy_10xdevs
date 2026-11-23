import { describe, expect, it } from "vitest";
import { boardingFeeFor, boardingFeeSchedule, type BoardingFeeChange } from "@/lib/boarding/fees";

let nextId = 1;
function fee(horseId: number, fromMonth: string, amount: number): BoardingFeeChange {
  return { id: nextId++, horseId, fromMonth, amount };
}

// Oracle: GLOSSARY „Opłata za pensjonat”, AC #117 — kwota dla konia od wskazanego miesiąca, wzorem stawki:
// obowiązuje najpóźniejsza zmiana „od” ≤ miesiąc, a gdy żadnej — pierwsza zmiana konia (wstecz, jak
// pierwsza stawka ośrodka); zmiana nie przelicza minionych miesięcy; każdy koń ma własną opłatę.
describe("boardingFeeFor — opłata za pensjonat konia w miesiącu", () => {
  it("koń bez opłaty nie ma kwoty", () => {
    expect(boardingFeeFor([fee(2, "2026-10", 90000)], 1, "2026-11")).toBeNull();
  });

  it("pierwsza opłata konia obowiązuje też we wcześniejszych miesiącach", () => {
    const changes = [fee(1, "2026-11", 150000)];
    expect(boardingFeeFor(changes, 1, "2026-08")).toBe(150000);
    expect(boardingFeeFor(changes, 1, "2026-11")).toBe(150000);
  });

  it("zmiana od miesiąca obowiązuje od niego dalej, miniony miesiąc zostaje przy poprzedniej opłacie", () => {
    const changes = [fee(1, "2027-01", 170000), fee(1, "2026-10", 150000), fee(2, "2026-12", 1)];
    expect(boardingFeeFor(changes, 1, "2026-12")).toBe(150000);
    expect(boardingFeeFor(changes, 1, "2027-01")).toBe(170000);
    expect(boardingFeeFor(changes, 1, "2027-06")).toBe(170000);
  });

  it("opłata 0,00 zł to opłata, nie jej brak", () => {
    expect(boardingFeeFor([fee(1, "2026-11", 0)], 1, "2026-11")).toBe(0);
  });
});

describe("boardingFeeSchedule — opłata dziś i zaplanowana zmiana", () => {
  it("bez opłaty nie ma ani bieżącej, ani zaplanowanej", () => {
    expect(boardingFeeSchedule([fee(2, "2026-11", 1)], 1, "2026-11")).toEqual({ current: null, planned: null });
  });

  it("zaplanowana zmiana od następnego miesiąca nie działa w bieżącym", () => {
    const planned = fee(1, "2026-12", 170000);
    expect(boardingFeeSchedule([fee(1, "2026-09", 150000), planned], 1, "2026-11")).toEqual({
      current: 150000,
      planned: { id: planned.id, fromMonth: "2026-12", amount: 170000 },
    });
  });

  it("pierwsza opłata zaplanowana od następnego miesiąca obowiązuje wstecz także w bieżącym", () => {
    const planned = fee(1, "2026-12", 170000);
    expect(boardingFeeSchedule([planned], 1, "2026-11")).toEqual({
      current: 170000,
      planned: { id: planned.id, fromMonth: "2026-12", amount: 170000 },
    });
  });
});
