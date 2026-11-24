import { describe, expect, it } from "vitest";
import {
  DECISION_FAILED,
  REJECTION_REASON_MAX,
  decisionErrorMessage,
  decisionRefusal,
  isDecisionConfirmed,
} from "@/lib/bookings/decisions";
import { rejectSchema } from "@/lib/bookings/schema";

// Oracle: AC #124, #125, #126 — przyjęcie odmawia ponad limit (SB009), po starcie slotu (SB064), dla zapisu
// nieoczekującego (SB065), dla wołającego bez uprawnień (SB066) i bez slotu w grafiku (23503); odrzucenie — bez
// powodu (SB070), z za długim powodem (SB071) i z SB064–SB066 jak przyjęcie (migracje 20261209090000,
// 20261210090000, 20261211090000).
describe("decisionErrorMessage — przyjęcie", () => {
  it("każda odmowa przyjęcia ma własne polskie zdanie", () => {
    expect(decisionErrorMessage("accept", "SB009")).toBe(
      "W tym slocie nie ma już wolnych miejsc — przyjęcie ponad limit miejsc nie jest możliwe.",
    );
    expect(decisionErrorMessage("accept", "SB064")).toBe("Ten slot już się zaczął — zapisu nie można już przyjąć.");
    expect(decisionErrorMessage("accept", "SB065")).toBe(
      "Ten zapis nie czeka już na przyjęcie — jeździec mógł go odwołać albo zapis został przyjęty lub odrzucony.",
    );
    expect(decisionErrorMessage("accept", "SB066")).toBe(
      "Nie znaleziono tego zapisu wśród Twoich zapisów do przyjęcia.",
    );
    expect(decisionErrorMessage("accept", "23503")).toBe("Tego slotu nie ma już w grafiku — zapisu nie można przyjąć.");
  });

  // Zbiór zamknięty: treść dostawcy nigdy nie trafia do `?error=`.
  it("nieznany kod, kod odrzucenia i awaria sieci dają wariant domyślny", () => {
    for (const code of ["42501", "", "PGRST116", "sb009", "SB070", undefined]) {
      expect(decisionErrorMessage("accept", code)).toBe("Nie udało się przyjąć zapisu. Spróbuj ponownie.");
    }
  });
});

describe("decisionErrorMessage — odrzucenie", () => {
  it("każda odmowa odrzucenia ma własne polskie zdanie", () => {
    expect(decisionErrorMessage("reject", "SB070")).toBe("Podaj powód odrzucenia — jeździec go zobaczy.");
    expect(decisionErrorMessage("reject", "SB071")).toBe("Powód odrzucenia może mieć najwyżej 300 znaków.");
    expect(decisionErrorMessage("reject", "SB064")).toBe("Ten slot już się zaczął — zapisu nie można już odrzucić.");
    expect(decisionErrorMessage("reject", "SB065")).toBe(
      "Ten zapis nie czeka już na przyjęcie — jeździec mógł go odwołać albo zapis został przyjęty lub odrzucony.",
    );
    expect(decisionErrorMessage("reject", "SB066")).toBe(
      "Nie znaleziono tego zapisu wśród Twoich zapisów do przyjęcia.",
    );
  });

  it("nieznany kod, kod samego przyjęcia i awaria sieci dają wariant domyślny", () => {
    for (const code of ["42501", "SB009", "23503", "", "sb070", undefined]) {
      expect(decisionErrorMessage("reject", code)).toBe("Nie udało się odrzucić zapisu. Spróbuj ponownie.");
    }
  });
});

describe("decisionRefusal", () => {
  it("znana odmowa reguły to projektowany UX, nieznany kod i brak kodu — awaria", () => {
    expect(decisionRefusal("accept", "SB065")).toEqual({
      message: decisionErrorMessage("accept", "SB065"),
      unexpected: false,
    });
    expect(decisionRefusal("reject", "SB070").unexpected).toBe(false);
    expect(decisionRefusal("accept", "42501")).toEqual({ message: DECISION_FAILED.accept, unexpected: true });
    expect(decisionRefusal("reject", undefined)).toEqual({ message: DECISION_FAILED.reject, unexpected: true });
  });

  // Słownik (GLOSSARY „Przyjęcie zapisu”, „Odrzucenie zapisu”): bez akceptacji, rezerwacji, odmowy.
  it("komunikaty mówią słowami słownika", () => {
    for (const code of ["SB009", "SB064", "SB065", "SB066", "SB070", "SB071", "23503", undefined]) {
      for (const decision of ["accept", "reject"] as const) {
        expect(decisionErrorMessage(decision, code)).not.toMatch(/akcept|rezerw|potwierdz|odmow|nieprzyj/i);
      }
    }
  });
});

describe("isDecisionConfirmed", () => {
  // Odczyt zwrotny (CODING_STANDARDS): sukces dopiero, gdy baza oddała stan zapisu zgodny z decyzją.
  it("przyjęcie potwierdza tylko zapis aktywny, odrzucenie — tylko odrzucony", () => {
    expect(isDecisionConfirmed("accept", "active")).toBe(true);
    expect(isDecisionConfirmed("reject", "rejected")).toBe(true);
    for (const status of ["pending", "rejected", "cancelled"] as const) {
      expect(isDecisionConfirmed("accept", status)).toBe(false);
    }
    for (const status of ["pending", "active", "cancelled"] as const) {
      expect(isDecisionConfirmed("reject", status)).toBe(false);
    }
  });
});

describe("rejectSchema", () => {
  it("przyjmuje zapis i powód przycięty z obu stron", () => {
    expect(rejectSchema.parse({ bookingId: "12", reason: "  Brak koni tego dnia.\n" })).toEqual({
      bookingId: 12,
      reason: "Brak koni tego dnia.",
    });
  });

  it("powód na granicy 300 znaków przechodzi, dłuższy i pusty — z komunikatem tym samym co z bazy", () => {
    expect(REJECTION_REASON_MAX).toBe(300);
    expect(rejectSchema.safeParse({ bookingId: "1", reason: "x".repeat(300) }).success).toBe(true);

    const tooLong = rejectSchema.safeParse({ bookingId: "1", reason: "x".repeat(301) });
    expect(tooLong.error?.issues[0]?.message).toBe(decisionErrorMessage("reject", "SB071"));

    for (const reason of ["", "   ", undefined]) {
      const empty = rejectSchema.safeParse({ bookingId: "1", reason });
      expect(empty.error?.issues[0]?.message).toBe(decisionErrorMessage("reject", "SB070"));
    }
  });

  it("odrzuca nieprawidłowy identyfikator zapisu", () => {
    expect(rejectSchema.safeParse({ bookingId: "abc", reason: "Brak koni" }).success).toBe(false);
  });
});
