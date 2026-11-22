import { describe, expect, it } from "vitest";
import { placeErrorMessage, isExpectedPlaceRefusal } from "@/lib/places/errors";
import { composePlaceList } from "@/lib/places/list";
import { newPlaceSchema, renamePlaceSchema, togglePlaceSchema } from "@/lib/places/schemas";

describe("composePlaceList", () => {
  it("dzieli place na aktywne i nieaktywne, każdą grupę alfabetycznie", () => {
    const list = composePlaceList([
      { id: 1, name: "Hala", active: true },
      { id: 2, name: "Lonżownik", active: false },
      { id: 3, name: "Duży plac", active: true },
      { id: 4, name: "Arena letnia", active: false },
    ]);

    expect(list.active.map((place) => place.name)).toEqual(["Duży plac", "Hala"]);
    expect(list.inactive.map((place) => place.name)).toEqual(["Arena letnia", "Lonżownik"]);
  });

  it("dezaktywować można plac tylko wtedy, gdy ośrodek ma inny aktywny plac", () => {
    const one = composePlaceList([{ id: 1, name: "Plac", active: true }]);
    const two = composePlaceList([
      { id: 1, name: "Hala", active: true },
      { id: 2, name: "Duży plac", active: true },
    ]);

    expect(one.canDeactivate).toBe(false);
    expect(two.canDeactivate).toBe(true);
  });
});

describe("schematy placów", () => {
  it("nazwa placu jest przycinana i nie może być pusta ani dłuższa niż 60 znaków", () => {
    expect(newPlaceSchema.parse({ name: "  Duży plac " })).toEqual({ name: "Duży plac" });
    expect(newPlaceSchema.safeParse({ name: "   " }).error?.issues[0]?.message).toBe("Podaj nazwę placu");
    expect(newPlaceSchema.safeParse({ name: "x".repeat(61) }).error?.issues[0]?.message).toBe(
      "Nazwa placu może mieć najwyżej 60 znaków",
    );
  });

  it("zmiana nazwy wymaga placu i nowej nazwy", () => {
    expect(renamePlaceSchema.parse({ placeId: "7", name: " Hala " })).toEqual({ placeId: 7, name: "Hala" });
    expect(renamePlaceSchema.safeParse({ placeId: "", name: "Hala" }).success).toBe(false);
  });

  it("przełączenie aktywności czyta plac i docelowy stan", () => {
    expect(togglePlaceSchema.parse({ placeId: "7", active: "false" })).toEqual({ placeId: 7, active: false });
    expect(togglePlaceSchema.safeParse({ placeId: "7", active: "tak" }).success).toBe(false);
  });
});

describe("placeErrorMessage", () => {
  it("powtórzona nazwa w ośrodku ma polską odmowę", () => {
    expect(placeErrorMessage("23505", "create")).toBe(
      "Masz już plac o tej nazwie (wielkość liter nie ma znaczenia), być może wśród nieaktywnych. Nadaj inną nazwę albo aktywuj go ponownie.",
    );
    expect(placeErrorMessage("23505", "rename")).toBe(placeErrorMessage("23505", "create"));
  });

  it("ostatni aktywny plac zostaje aktywny", () => {
    expect(placeErrorMessage("SB033", "toggle")).toBe(
      "Ośrodek musi mieć co najmniej jeden aktywny plac. Najpierw dodaj albo aktywuj inny plac.",
    );
  });

  it.each([[undefined], [""], ["42501"], ["PGRST301"], ["fetch failed"]])(
    "kod %s daje wariant domyślny czynności, bez tekstu dostawcy",
    (code) => {
      expect(placeErrorMessage(code, "create")).toBe("Nie udało się dodać placu. Spróbuj ponownie.");
      expect(placeErrorMessage(code, "rename")).toBe("Nie udało się zmienić nazwy placu. Spróbuj ponownie.");
      expect(placeErrorMessage(code, "toggle")).toBe("Nie udało się zmienić stanu placu. Spróbuj ponownie.");
    },
  );

  it("odmowy reguł nie są awarią wartą logu", () => {
    expect(isExpectedPlaceRefusal("23505")).toBe(true);
    expect(isExpectedPlaceRefusal("SB033")).toBe(true);
    expect(isExpectedPlaceRefusal("42501")).toBe(false);
    expect(isExpectedPlaceRefusal(undefined)).toBe(false);
  });
});
