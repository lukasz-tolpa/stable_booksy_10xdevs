import { describe, expect, it } from "vitest";
import { effectiveRate, stableRateFor, rateSchedule, type RateChange, type RateKind } from "@/lib/settlements/rates";

let nextId = 1;
function change(
  fromMonth: string,
  amount: number | null,
  riderKey: string | null = null,
  kind: RateKind = "recreation",
): RateChange {
  return { id: nextId++, riderKey, kind, fromMonth, amount };
}
const training = (fromMonth: string, amount: number | null, riderKey: string | null = null) =>
  change(fromMonth, amount, riderKey, "training");

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

describe("rateSchedule — stawka ośrodka dziś i zaplanowana zmiana", () => {
  it("bez stawki ośrodka nie ma ani bieżącej, ani zaplanowanej", () => {
    expect(rateSchedule([change("2026-12", 9000, "anna")], null, "2026-11")).toEqual({
      current: null,
      planned: null,
    });
  });

  it("zaplanowana zmiana od następnego miesiąca nie działa w bieżącym", () => {
    const planned = change("2026-12", 14000);
    const schedule = rateSchedule([change("2026-09", 12000), planned], null, "2026-11");
    expect(schedule).toEqual({
      current: { amount: 12000, source: "stable" },
      planned: { id: planned.id, fromMonth: "2026-12", amount: 14000 },
    });
  });

  it("zmiana od bieżącego miesiąca jest bieżącą stawką, nie zaplanowaną", () => {
    expect(rateSchedule([change("2026-09", 12000), change("2026-11", 13000)], null, "2026-11")).toEqual({
      current: { amount: 13000, source: "stable" },
      planned: null,
    });
  });

  it("pierwsza stawka zaplanowana od następnego miesiąca obowiązuje wstecz także w bieżącym", () => {
    const planned = change("2026-12", 14000);
    expect(rateSchedule([planned], null, "2026-11")).toEqual({
      current: { amount: 14000, source: "stable" },
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

describe("rateSchedule — stawka jeźdźca dziś i zaplanowana zmiana", () => {
  const STABLE = change("2026-09", 12000);

  it("bez zmian jeźdźca: obowiązuje stawka ośrodka, nic nie jest zaplanowane", () => {
    expect(rateSchedule([STABLE, change("2026-12", 9000, "piotr")], "anna", "2026-11")).toEqual({
      current: { amount: 12000, source: "stable" },
      planned: null,
    });
  });

  it("zaplanowana stawka indywidualna od następnego miesiąca nie działa w bieżącym", () => {
    const planned = change("2026-12", 9000, "anna");
    expect(rateSchedule([STABLE, planned], "anna", "2026-11")).toEqual({
      current: { amount: 12000, source: "stable" },
      planned: { id: planned.id, fromMonth: "2026-12", amount: 9000 },
    });
  });

  it("zaplanowany powrót do stawki ośrodka to zmiana bez kwoty", () => {
    const planned = change("2026-12", null, "anna");
    expect(rateSchedule([STABLE, change("2026-10", 0, "anna"), planned], "anna", "2026-11")).toEqual({
      current: { amount: 0, source: "individual" },
      planned: { id: planned.id, fromMonth: "2026-12", amount: null },
    });
  });

  it("zaplanowana zmiana stawki ośrodka nie jest zmianą jeźdźca", () => {
    expect(rateSchedule([STABLE, change("2026-12", 14000)], "anna", "2026-11").planned).toBeNull();
  });
});

// Oracle: GLOSSARY „Stawka”, AC #117 — ośrodek ma dwie stawki ośrodka, rekreacyjną i treningową; reguły
// „od miesiąca” i „pierwsza stawka ośrodka obowiązuje wstecz” działają osobno dla każdego rodzaju, a
// stawka indywidualna zastępuje stawkę ośrodka tylko swojego rodzaju.
describe("rodzaje stawki — rekreacyjna i treningowa osobno", () => {
  it("stawka ośrodka jednego rodzaju nie jest stawką drugiego", () => {
    const changes = [change("2026-09", 12000)];
    expect(stableRateFor(changes, "2026-11", "recreation")?.amount).toBe(12000);
    expect(stableRateFor(changes, "2026-11", "training")).toBeNull();
    expect(stableRateFor([training("2026-09", 15000)], "2026-11", "recreation")).toBeNull();
  });

  it("pierwsza stawka treningowa obowiązuje wstecz niezależnie od dawniejszej rekreacyjnej", () => {
    const changes = [change("2026-01", 12000), change("2026-10", 13000), training("2026-11", 15000)];
    expect(stableRateFor(changes, "2026-03", "training")).toEqual({ amount: 15000, source: "stable" });
    expect(stableRateFor(changes, "2026-03", "recreation")?.amount).toBe(12000);
  });

  it("zmiana stawki treningowej od miesiąca nie przelicza minionych miesięcy ani stawki rekreacyjnej", () => {
    const changes = [training("2026-09", 15000), training("2027-01", 16000), change("2026-09", 12000)];
    expect(stableRateFor(changes, "2026-12", "training")?.amount).toBe(15000);
    expect(stableRateFor(changes, "2027-01", "training")?.amount).toBe(16000);
    expect(stableRateFor(changes, "2027-01", "recreation")?.amount).toBe(12000);
  });

  it("stawka indywidualna treningowa zastępuje tylko stawkę treningową", () => {
    const changes = [change("2026-09", 12000), training("2026-09", 15000), training("2026-11", 11000, "kasia")];
    expect(effectiveRate(changes, "2026-11", "kasia", "training")).toEqual({ amount: 11000, source: "individual" });
    expect(effectiveRate(changes, "2026-11", "kasia", "recreation")).toEqual({ amount: 12000, source: "stable" });
    expect(effectiveRate(changes, "2026-10", "kasia", "training")).toEqual({ amount: 15000, source: "stable" });
  });

  it("stawka indywidualna rekreacyjna nie działa w miesiącu treningowym", () => {
    const changes = [training("2026-09", 15000), change("2026-09", 9000, "kasia")];
    expect(effectiveRate(changes, "2026-11", "kasia", "training")).toEqual({ amount: 15000, source: "stable" });
  });

  it("stawka treningowa dziś i jej zaplanowana zmiana — bez zmian rekreacyjnych", () => {
    const planned = training("2026-12", 16000);
    const changes = [change("2026-09", 12000), change("2026-12", 13000), training("2026-10", 15000), planned];
    expect(rateSchedule(changes, null, "2026-11", "training")).toEqual({
      current: { amount: 15000, source: "stable" },
      planned: { id: planned.id, fromMonth: "2026-12", amount: 16000 },
    });
  });

  it("zaplanowana stawka indywidualna treningowa pensjonariusza", () => {
    const planned = training("2026-12", 11000, "kasia");
    const changes = [training("2026-10", 15000), change("2026-12", 9000, "kasia"), planned];
    expect(rateSchedule(changes, "kasia", "2026-11", "training")).toEqual({
      current: { amount: 15000, source: "stable" },
      planned: { id: planned.id, fromMonth: "2026-12", amount: 11000 },
    });
  });
});
