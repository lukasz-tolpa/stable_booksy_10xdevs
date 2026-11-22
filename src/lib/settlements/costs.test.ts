import { describe, expect, it } from "vitest";
import { composeAddCost } from "@/lib/settlements/costs";

// Oracle: AC #96 — jeźdźcy ośrodka do wyboru przy „Dopisz koszt”, z nazwą; kolejność i „(bez nazwiska)”
// jak na liście rozliczeń.
describe("composeAddCost — „Dopisz koszt” na stronie „Rozliczenia”", () => {
  it("jeźdźcy alfabetycznie po polsku, konto bez nazwy jako „(bez nazwiska)”", () => {
    expect(
      composeAddCost(
        [
          { key: "z", name: "Zenon Żak" },
          { key: "l", name: "Łukasz Lis" },
          { key: "b", name: null },
          { key: "a", name: "Adam Ąk" },
        ],
        "2026-10",
      ).riders,
    ).toEqual([
      { key: "b", name: "(bez nazwiska)" },
      { key: "a", name: "Adam Ąk" },
      { key: "l", name: "Łukasz Lis" },
      { key: "z", name: "Zenon Żak" },
    ]);
  });

  it("koszt trafia do oglądanego miesiąca", () => {
    expect(composeAddCost([], "2026-10")).toEqual({
      riders: [],
      month: "2026-10",
      hint: "Koszt trafi do rozliczenia jeźdźca w październiku 2026.",
    });
  });
});
