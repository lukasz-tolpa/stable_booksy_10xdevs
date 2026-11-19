import { describe, expect, it } from "vitest";
import {
  instructorIdSchema,
  inviteInstructorSchema,
  newInstructorSchema,
  schedulePermissionSchema,
  toggleInstructorSchema,
} from "@/lib/instructors/schemas";

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

describe("inviteInstructorSchema", () => {
  it("przepuszcza instruktora i adres, zapisując adres małymi literami bez spacji na brzegach", () => {
    expect(inviteInstructorSchema.safeParse({ instructorId: "7", email: "  Joanna.Wrona@Example.COM " }).data).toEqual({
      instructorId: 7,
      email: "joanna.wrona@example.com",
    });
  });

  it.each(["", "   ", "joanna", "joanna@", "@example.com", "jo anna@example.com"])(
    "odrzuca adres %j polskim komunikatem pola",
    (email) => {
      const result = inviteInstructorSchema.safeParse({ instructorId: "7", email });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe("Podaj poprawny adres e-mail instruktora");
    },
  );

  it.each(["0", "abc", ""])("odrzuca identyfikator instruktora %j", (instructorId) => {
    const result = inviteInstructorSchema.safeParse({ instructorId, email: "joanna@example.com" });
    expect(result.error?.issues[0]?.message).toBe("Nieprawidłowy instruktor");
  });
});

describe("instructorIdSchema", () => {
  it("przepuszcza identyfikator instruktora", () => {
    expect(instructorIdSchema.safeParse({ instructorId: " 12 " }).data).toEqual({ instructorId: 12 });
  });

  it.each(["0", "-1", "x", ""])("odrzuca identyfikator %j", (instructorId) => {
    expect(instructorIdSchema.safeParse({ instructorId }).error?.issues[0]?.message).toBe("Nieprawidłowy instruktor");
  });
});

describe("schedulePermissionSchema", () => {
  it("zamienia tekstowy stan uprawnienia na wartość logiczną", () => {
    expect(schedulePermissionSchema.safeParse({ instructorId: "3", granted: "true" }).data).toEqual({
      instructorId: 3,
      granted: true,
    });
    expect(schedulePermissionSchema.safeParse({ instructorId: "3", granted: "false" }).data).toEqual({
      instructorId: 3,
      granted: false,
    });
  });

  it.each([
    { instructorId: "3", granted: "tak" },
    { instructorId: "3", granted: undefined },
    { instructorId: "0", granted: "true" },
  ])("odrzuca nieczytelny formularz %j", (input) => {
    expect(schedulePermissionSchema.safeParse(input).success).toBe(false);
  });
});
