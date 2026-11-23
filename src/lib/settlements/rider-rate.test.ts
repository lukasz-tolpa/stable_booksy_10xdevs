import { describe, expect, it } from "vitest";
import type { RateChange } from "@/lib/settlements/rates";
import { composeRiderRate, riderRateStart } from "@/lib/settlements/rider-rate";
import type { SettlementBoardingHorse } from "@/lib/settlements/settlements";

/** 20 listopada 2026, 14:30 w Warszawie — bieżący miesiąc to listopad 2026. */
const NOW = new Date("2026-11-20T13:30:00Z");
/** Kwoty mają twarde spacje — w oczekiwaniach piszemy zwykłe. */
const zl = (text: string) => text.replaceAll(" ", " ");

const STABLE_120: RateChange = { id: 1, riderKey: null, kind: "recreation", fromMonth: "2026-09", amount: 12000 };

// Oracle: AC #97 — stawka jeźdźca dziś z dopiskiem źródła, zaplanowana zmiana („od grudnia 2026: …”)
// do usunięcia, wybór „od tego / od następnego miesiąca” jak przy stawce ośrodka; powrót do stawki
// ośrodka tylko, gdy obowiązuje stawka indywidualna.
describe("composeRiderRate — stawka jeźdźca w rozliczeniu jeźdźca", () => {
  it("bez stawki indywidualnej obowiązuje stawka ośrodka i nie ma czego usuwać", () => {
    expect(composeRiderRate([STABLE_120], "anna", NOW)).toEqual({
      currentText: zl("120,00 zł"),
      sourceText: "stawka ośrodka",
      planned: null,
      canEnd: false,
      hint: "Stawka indywidualna zastępuje stawkę ośrodka, np. karnet albo 0,00 zł dla jeźdźca, który pomaga w ośrodku. Zmiana nie przelicza minionych miesięcy.",
      choices: [
        { value: "biezacy", label: "Od tego miesiąca (listopad 2026)", checked: true },
        { value: "nastepny", label: "Od następnego miesiąca (grudzień 2026)", checked: false },
      ],
    });
  });

  it("obowiązująca stawka indywidualna: dopisek „stawka indywidualna” i możliwość powrotu do stawki ośrodka", () => {
    const view = composeRiderRate(
      [STABLE_120, { id: 2, riderKey: "anna", kind: "recreation", fromMonth: "2026-10", amount: 0 }],
      "anna",
      NOW,
    );
    expect(view).toMatchObject({ currentText: zl("0,00 zł"), sourceText: "stawka indywidualna", canEnd: true });
  });

  it("zaplanowana stawka indywidualna: kwota od następnego miesiąca, dziś dalej stawka ośrodka", () => {
    const view = composeRiderRate(
      [STABLE_120, { id: 5, riderKey: "anna", kind: "recreation", fromMonth: "2026-12", amount: 9000 }],
      "anna",
      NOW,
    );
    expect(view).toMatchObject({
      currentText: zl("120,00 zł"),
      sourceText: "stawka ośrodka",
      planned: { id: 5, text: `od grudnia 2026: ${zl("90,00 zł")}` },
      canEnd: false,
    });
  });

  it("zaplanowany powrót do stawki ośrodka", () => {
    const view = composeRiderRate(
      [
        STABLE_120,
        { id: 2, riderKey: "anna", kind: "recreation", fromMonth: "2026-10", amount: 9000 },
        { id: 6, riderKey: "anna", kind: "recreation", fromMonth: "2026-12", amount: null },
      ],
      "anna",
      NOW,
    );
    expect(view.planned).toEqual({ id: 6, text: "od grudnia 2026: stawka ośrodka" });
    expect(view.sourceText).toBe("stawka indywidualna");
  });

  it("ośrodek bez stawki i jeździec bez stawki indywidualnej — nic nie obowiązuje", () => {
    expect(composeRiderRate([], "anna", NOW)).toMatchObject({ currentText: null, sourceText: null, canEnd: false });
  });
});

// Oracle: AC #117 — formularz stawki indywidualnej pensjonariusza jest treningowy: obowiązuje stawka
// treningowa (ośrodka albo indywidualna) i jej zaplanowana zmiana; zmiany rekreacyjne się nie liczą.
describe("composeRiderRate — pensjonariusz", () => {
  const TRAINING_150: RateChange = { id: 3, riderKey: null, kind: "training", fromMonth: "2026-09", amount: 15000 };

  it("stawka treningowa ośrodka z dopiskiem, zaplanowana treningowa stawka indywidualna", () => {
    const view = composeRiderRate(
      [
        STABLE_120,
        TRAINING_150,
        { id: 4, riderKey: "kasia", kind: "recreation", fromMonth: "2026-12", amount: 1 },
        { id: 5, riderKey: "kasia", kind: "training", fromMonth: "2026-12", amount: 11000 },
      ],
      "kasia",
      NOW,
      "training",
    );
    expect(view).toMatchObject({
      currentText: zl("150,00 zł"),
      sourceText: "stawka treningowa ośrodka",
      planned: { id: 5, text: `od grudnia 2026: ${zl("110,00 zł")}` },
      canEnd: false,
    });
    expect(view.hint).toContain("stawkę treningową ośrodka");
  });

  it("jeździec rekreacyjny dostaje dotychczasową podpowiedź", () => {
    expect(composeRiderRate([STABLE_120], "anna", NOW).hint).toBe(
      "Stawka indywidualna zastępuje stawkę ośrodka, np. karnet albo 0,00 zł dla jeźdźca, który pomaga w ośrodku. Zmiana nie przelicza minionych miesięcy.",
    );
  });
});

// Oracle: spec #112 — rodzaj stawki indywidualnej to rodzaj jeźdźca w miesiącu, od którego stawka obowiązuje
// (reguła „pensjonariusz w miesiącu”), nie w bieżącym.
describe("riderRateStart — od kiedy i jakiego rodzaju jest zapisywana stawka indywidualna", () => {
  const horse = (arrivalDay: string, departureDay: string | null): SettlementBoardingHorse => ({
    horseId: 7,
    horseName: "Hrabia",
    riderKey: "kasia",
    riderName: "Katarzyna Zając",
    stays: [{ arrivalDay, departureDay }],
  });

  it("koń przyjeżdża w grudniu: stawka od listopada rekreacyjna, od grudnia treningowa", () => {
    const horses = [horse("2026-12-05", null)];
    expect(riderRateStart(horses, "kasia", "biezacy", NOW)).toEqual({ kind: "recreation", fromMonth: "2026-11" });
    expect(riderRateStart(horses, "kasia", "nastepny", NOW)).toEqual({ kind: "training", fromMonth: "2026-12" });
  });

  it("koń wyjechał w listopadzie: stawka od listopada treningowa, od grudnia rekreacyjna", () => {
    const horses = [horse("2026-08-10", "2026-11-10")];
    expect(riderRateStart(horses, "kasia", "biezacy", NOW)).toEqual({ kind: "training", fromMonth: "2026-11" });
    expect(riderRateStart(horses, "kasia", "nastepny", NOW)).toEqual({ kind: "recreation", fromMonth: "2026-12" });
  });

  it("jeździec bez koni — zawsze rekreacyjna", () => {
    expect(riderRateStart([horse("2026-08-10", null)], "anna", "nastepny", NOW)).toEqual({
      kind: "recreation",
      fromMonth: "2026-12",
    });
  });
});
