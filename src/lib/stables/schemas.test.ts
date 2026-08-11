import { describe, expect, it } from "vitest";
import { newHorseSchema, toggleHorseSchema } from "@/lib/stables/schemas";

describe("newHorseSchema", () => {
  it("przepuszcza poprawne dane i przycina białe znaki", () => {
    const result = newHorseSchema.safeParse({ name: "  Bella  ", notes: "  spokojna  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Bella");
      expect(result.data.notes).toBe("spokojna");
    }
  });

  it("przepuszcza konia bez notatki", () => {
    expect(newHorseSchema.safeParse({ name: "Kasztan" }).success).toBe(true);
  });

  it("odrzuca imię z samych białych znaków", () => {
    expect(newHorseSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("odrzuca puste imię", () => {
    expect(newHorseSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

describe("toggleHorseSchema", () => {
  it("zamienia tekstowy stan na wartość logiczną", () => {
    const wycofanie = toggleHorseSchema.safeParse({ horseId: "7", active: "false" });
    expect(wycofanie.success).toBe(true);
    if (wycofanie.success) {
      expect(wycofanie.data).toEqual({ horseId: 7, active: false });
    }

    const przywrocenie = toggleHorseSchema.safeParse({ horseId: "7", active: "true" });
    expect(przywrocenie.success).toBe(true);
    if (przywrocenie.success) {
      expect(przywrocenie.data.active).toBe(true);
    }
  });

  it("odrzuca identyfikator, który nie jest dodatnią liczbą całkowitą", () => {
    expect(toggleHorseSchema.safeParse({ horseId: "0", active: "true" }).success).toBe(false);
    expect(toggleHorseSchema.safeParse({ horseId: "-3", active: "true" }).success).toBe(false);
    expect(toggleHorseSchema.safeParse({ horseId: "1.5", active: "true" }).success).toBe(false);
    expect(toggleHorseSchema.safeParse({ horseId: "abc", active: "true" }).success).toBe(false);
  });

  it("odrzuca stan spoza dozwolonego zbioru", () => {
    expect(toggleHorseSchema.safeParse({ horseId: "7", active: "maybe" }).success).toBe(false);
  });
});
