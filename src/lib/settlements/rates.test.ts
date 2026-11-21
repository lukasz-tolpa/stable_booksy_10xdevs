import { describe, expect, it } from "vitest";
import {
  effectiveRate,
  riderRateSchedule,
  stableRateFor,
  stableRateSchedule,
  type RateChange,
} from "@/lib/settlements/rates";

let nextId = 1;
function change(fromMonth: string, amount: number | null, riderKey: string | null = null): RateChange {
  return { id: nextId++, riderKey, fromMonth, amount };
}

// Oracle: GLOSSARY „Stawka”, AC #94 — obowiązuje najpóźniejsza zmiana „od” ≤ miesiąc, a gdy żadnej —
// pierwsza stawka ośrodka (wstecz); kolejne zmiany nie przeliczają minionych miesięcy.
describe("stableRateFor — obowiązująca stawka ośrodka w miesiącu", () => {
  it("bez żadnej stawki ośrodka nie ma stawki", () => {
    expect(stableRateFor([], "2026-11")).toBeNull();
  });

  it("pierwsza stawka ośrodka obowiązuje też we wszystkich wcześniejszych miesiącach", () => {
    const changes = [change("2026-11", 12000)];
    expect(stableRateFor(changes, "2025-03")).toEqual({ amount: 12000, source: "stable" });
    expect(stableRateFor(changes, "2026-10")).toEqual({ amount: 12000, source: "stable" });
    expect(stableRateFor(changes, "2026-11")).toEqual({ amount: 12000, source: "stable" });
  });

  it("zmiana od miesiąca obowiązuje od niego dalej, a miniony miesiąc zostaje przy poprzedniej stawce", () => {
    const changes = [change("2027-01", 14000), change("2026-10", 12000)];
    expect(stableRateFor(changes, "2026-09")?.amount).toBe(12000);
    expect(stableRateFor(changes, "2026-12")?.amount).toBe(12000);
    expect(stableRateFor(changes, "2027-01")?.amount).toBe(14000);
    expect(stableRateFor(changes, "2027-05")?.amount).toBe(14000);
  });

  it("najpóźniejsza zmiana nie późniejsza niż miesiąc wygrywa", () => {
    const changes = [change("2026-08", 10000), change("2026-11", 13000), change("2026-10", 12000)];
    expect(stableRateFor(changes, "2026-10")?.amount).toBe(12000);
    expect(stableRateFor(changes, "2026-11")?.amount).toBe(13000);
  });

  it("stawka 0,00 zł to stawka, nie jej brak", () => {
    expect(stableRateFor([change("2026-11", 0)], "2026-11")).toEqual({ amount: 0, source: "stable" });
  });

  it("stawki indywidualne jeźdźców nie są stawką ośrodka", () => {
    const changes = [change("2026-10", 9000, "anna"), change("2026-11", 12000)];
    expect(stableRateFor(changes, "2026-10")?.amount).toBe(12000);
    expect(stableRateFor([change("2026-10", 9000, "anna")], "2026-10")).toBeNull();
  });
});

describe("stableRateSchedule — stawka ośrodka dziś i zaplanowana zmiana", () => {
  it("bez stawki ośrodka nie ma ani bieżącej, ani zaplanowanej", () => {
    expect(stableRateSchedule([change("2026-12", 9000, "anna")], "2026-11")).toEqual({
      current: null,
      planned: null,
    });
  });

  it("zaplanowana zmiana od następnego miesiąca nie działa w bieżącym", () => {
    const planned = change("2026-12", 14000);
    const schedule = stableRateSchedule([change("2026-09", 12000), planned], "2026-11");
    expect(schedule).toEqual({
      current: 12000,
      planned: { id: planned.id, fromMonth: "2026-12", amount: 14000 },
    });
  });

  it("zmiana od bieżącego miesiąca jest bieżącą stawką, nie zaplanowaną", () => {
    expect(stableRateSchedule([change("2026-09", 12000), change("2026-11", 13000)], "2026-11")).toEqual({
      current: 13000,
      planned: null,
    });
  });

  it("pierwsza stawka zaplanowana od następnego miesiąca obowiązuje wstecz także w bieżącym", () => {
    const planned = change("2026-12", 14000);
    expect(stableRateSchedule([planned], "2026-11")).toEqual({
      current: 14000,
      planned: { id: planned.id, fromMonth: "2026-12", amount: 14000 },
    });
  });
});

// Oracle: AC #97 — obowiązuje najpóźniejsza zmiana jeźdźca „od” ≤ miesiąc: z kwotą zastępuje stawkę
// ośrodka, pusta wraca do niej od swojego miesiąca; bez zmian jeźdźca liczy się stawka ośrodka.
describe("effectiveRate — stawka jazd jeźdźca w miesiącu", () => {
  const STABLE = change("2026-09", 12000);

  it("bez zmian jeźdźca liczy się stawka ośrodka", () => {
    expect(effectiveRate([STABLE, change("2026-10", 9000, "piotr")], "2026-11", "anna")).toEqual({
      amount: 12000,
      source: "stable",
    });
  });

  it("stawka indywidualna zastępuje stawkę ośrodka od swojego miesiąca, wcześniejsze miesiące bez zmian", () => {
    const changes = [STABLE, change("2026-11", 9000, "anna")];
    expect(effectiveRate(changes, "2026-10", "anna")).toEqual({ amount: 12000, source: "stable" });
    expect(effectiveRate(changes, "2026-11", "anna")).toEqual({ amount: 9000, source: "individual" });
    expect(effectiveRate(changes, "2027-03", "anna")).toEqual({ amount: 9000, source: "individual" });
  });

  it("usunięcie stawki indywidualnej wraca do stawki ośrodka od swojego miesiąca", () => {
    const changes = [
      STABLE,
      change("2026-08", 9000, "anna"),
      change("2026-11", null, "anna"),
      change("2027-01", 14000),
    ];
    expect(effectiveRate(changes, "2026-10", "anna")).toEqual({ amount: 9000, source: "individual" });
    expect(effectiveRate(changes, "2026-11", "anna")).toEqual({ amount: 12000, source: "stable" });
    expect(effectiveRate(changes, "2027-01", "anna")).toEqual({ amount: 14000, source: "stable" });
  });

  it("zaplanowana stawka indywidualna nie działa w bieżącym miesiącu", () => {
    const changes = [STABLE, change("2026-12", 9000, "anna")];
    expect(effectiveRate(changes, "2026-11", "anna")).toEqual({ amount: 12000, source: "stable" });
    expect(effectiveRate(changes, "2026-12", "anna")).toEqual({ amount: 9000, source: "individual" });
  });

  it("stawka indywidualna 0,00 zł to stawka, nie powrót do stawki ośrodka", () => {
    expect(effectiveRate([STABLE, change("2026-11", 0, "anna")], "2026-11", "anna")).toEqual({
      amount: 0,
      source: "individual",
    });
  });

  it("stawka indywidualna nie działa wstecz jak pierwsza stawka ośrodka", () => {
    const changes = [STABLE, change("2026-11", 9000, "anna")];
    expect(effectiveRate(changes, "2025-01", "anna")).toEqual({ amount: 12000, source: "stable" });
    expect(effectiveRate([change("2026-11", 9000, "anna")], "2026-10", "anna")).toBeNull();
  });

  it("jeździec zanonimizowany (bez klucza) płaci stawkę ośrodka", () => {
    expect(effectiveRate([STABLE], "2026-11", null)).toEqual({ amount: 12000, source: "stable" });
  });
});

describe("riderRateSchedule — stawka jeźdźca dziś i zaplanowana zmiana", () => {
  const STABLE = change("2026-09", 12000);

  it("bez zmian jeźdźca: obowiązuje stawka ośrodka, nic nie jest zaplanowane", () => {
    expect(riderRateSchedule([STABLE, change("2026-12", 9000, "piotr")], "anna", "2026-11")).toEqual({
      current: { amount: 12000, source: "stable" },
      planned: null,
    });
  });

  it("zaplanowana stawka indywidualna od następnego miesiąca nie działa w bieżącym", () => {
    const planned = change("2026-12", 9000, "anna");
    expect(riderRateSchedule([STABLE, planned], "anna", "2026-11")).toEqual({
      current: { amount: 12000, source: "stable" },
      planned: { id: planned.id, fromMonth: "2026-12", amount: 9000 },
    });
  });

  it("zaplanowany powrót do stawki ośrodka to zmiana bez kwoty", () => {
    const planned = change("2026-12", null, "anna");
    expect(riderRateSchedule([STABLE, change("2026-10", 0, "anna"), planned], "anna", "2026-11")).toEqual({
      current: { amount: 0, source: "individual" },
      planned: { id: planned.id, fromMonth: "2026-12", amount: null },
    });
  });

  it("zaplanowana zmiana stawki ośrodka nie jest zmianą jeźdźca", () => {
    expect(riderRateSchedule([STABLE, change("2026-12", 14000)], "anna", "2026-11").planned).toBeNull();
  });
});
