import { describe, expect, it } from "vitest";
import type { RateChange } from "@/lib/settlements/rates";
import { composeRiderRate } from "@/lib/settlements/rider-rate";

/** 20 listopada 2026, 14:30 w Warszawie — bieżący miesiąc to listopad 2026. */
const NOW = new Date("2026-11-20T13:30:00Z");
/** Kwoty mają twarde spacje — w oczekiwaniach piszemy zwykłe. */
const zl = (text: string) => text.replaceAll(" ", " ");

const STABLE_120: RateChange = { id: 1, riderKey: null, fromMonth: "2026-09", amount: 12000 };

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
      choices: [
        { value: "biezacy", label: "Od tego miesiąca (listopad 2026)", checked: true },
        { value: "nastepny", label: "Od następnego miesiąca (grudzień 2026)", checked: false },
      ],
    });
  });

  it("obowiązująca stawka indywidualna: dopisek „stawka indywidualna” i możliwość powrotu do stawki ośrodka", () => {
    const view = composeRiderRate(
      [STABLE_120, { id: 2, riderKey: "anna", fromMonth: "2026-10", amount: 0 }],
      "anna",
      NOW,
    );
    expect(view).toMatchObject({ currentText: zl("0,00 zł"), sourceText: "stawka indywidualna", canEnd: true });
  });

  it("zaplanowana stawka indywidualna: kwota od następnego miesiąca, dziś dalej stawka ośrodka", () => {
    const view = composeRiderRate(
      [STABLE_120, { id: 5, riderKey: "anna", fromMonth: "2026-12", amount: 9000 }],
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
        { id: 2, riderKey: "anna", fromMonth: "2026-10", amount: 9000 },
        { id: 6, riderKey: "anna", fromMonth: "2026-12", amount: null },
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
