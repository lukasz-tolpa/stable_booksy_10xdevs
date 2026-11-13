import { describe, expect, it } from "vitest";
import { newInstructorSchema, toggleInstructorSchema } from "@/lib/instructors/schemas";

describe("newInstructorSchema", () => {
  it("przepuszcza nazwę i przycina spacje na brzegach", () => {
    const result = newInstructorSchema.safeParse({ name: "  Ania Nowicka  " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Ania Nowicka");
    }
  });

  it.each(["", "   ", "\t\n"])("odrzuca pustą nazwę %j z czytelnym komunikatem", (name) => {
    const result = newInstructorSchema.safeParse({ name });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Podaj nazwę instruktora");
    }
  });
});

describe("toggleInstructorSchema", () => {
  it("zamienia tekstowy stan na wartość logiczną", () => {
    expect(toggleInstructorSchema.safeParse({ instructorId: "4", active: "false" }).data).toEqual({
      instructorId: 4,
      active: false,
    });
    expect(toggleInstructorSchema.safeParse({ instructorId: "4", active: "true" }).data).toEqual({
      instructorId: 4,
      active: true,
    });
  });

  it.each(["0", "-3", "1.5", "abc", "", "   ", "1e3", "0x10"])(
    "odrzuca identyfikator %j polskim komunikatem pola",
    (instructorId) => {
      const result = toggleInstructorSchema.safeParse({ instructorId, active: "true" });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Nieprawidłowy instruktor");
    },
  );

  it("odrzuca stan spoza dozwolonego zbioru", () => {
    expect(toggleInstructorSchema.safeParse({ instructorId: "4", active: "maybe" }).success).toBe(false);
  });
});
