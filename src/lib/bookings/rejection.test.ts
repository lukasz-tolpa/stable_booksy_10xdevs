import { describe, expect, it } from "vitest";
import {
  REJECTION_FAILED,
  REJECTION_REASON_MAX,
  REJECT_NO_REASON,
  REJECT_REASON_TOO_LONG,
  rejectionErrorMessage,
} from "@/lib/bookings/rejection";
import { rejectSchema } from "@/lib/bookings/schema";

describe("rejectionErrorMessage", () => {
  // Oracle: AC #125 — odrzucenie odmawia bez powodu, z za długim powodem (SB070, SB071), po starcie slotu,
  // dla zapisu nieoczekującego i dla wołającego bez uprawnień (SB064–SB066 jak przy przyjęciu); migracja
  // 20261210090000_booking_rejection.sql.
  it("kody odmów powodu to SB070 i SB071", () => {
    expect([REJECT_NO_REASON, REJECT_REASON_TOO_LONG]).toEqual(["SB070", "SB071"]);
  });

  it("każda odmowa ma własne polskie zdanie", () => {
    expect(rejectionErrorMessage("SB070")).toBe("Podaj powód odrzucenia — jeździec go zobaczy.");
    expect(rejectionErrorMessage("SB071")).toBe("Powód odrzucenia może mieć najwyżej 300 znaków.");
    expect(rejectionErrorMessage("SB064")).toBe("Ten slot już się zaczął — zapisu nie można już odrzucić.");
    expect(rejectionErrorMessage("SB065")).toBe(
      "Ten zapis nie czeka już na przyjęcie — jeździec mógł go odwołać albo zapis został przyjęty lub odrzucony.",
    );
    expect(rejectionErrorMessage("SB066")).toBe("Nie znaleziono tego zapisu wśród Twoich zapisów do przyjęcia.");
  });

  // Zbiór zamknięty: treść dostawcy nigdy nie trafia do `?error=`.
  it("nieznany kod i awaria sieci dają wariant domyślny", () => {
    for (const code of ["42501", "SB009", "", "sb070", undefined]) {
      expect(rejectionErrorMessage(code)).toBe(REJECTION_FAILED);
    }
    expect(REJECTION_FAILED).toBe("Nie udało się odrzucić zapisu. Spróbuj ponownie.");
  });

  // Słownik (GLOSSARY „Odrzucenie zapisu”): odrzucenie, nie odmowa.
  it("komunikaty mówią słowami słownika", () => {
    for (const code of ["SB064", "SB065", "SB066", "SB070", "SB071", undefined]) {
      expect(rejectionErrorMessage(code)).not.toMatch(/odmow|akcept|rezerw|nieprzyj/i);
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
    expect(tooLong.error?.issues[0]?.message).toBe(rejectionErrorMessage("SB071"));

    for (const reason of ["", "   ", undefined]) {
      const empty = rejectSchema.safeParse({ bookingId: "1", reason });
      expect(empty.error?.issues[0]?.message).toBe(rejectionErrorMessage("SB070"));
    }
  });

  it("odrzuca nieprawidłowy identyfikator zapisu", () => {
    expect(rejectSchema.safeParse({ bookingId: "abc", reason: "Brak koni" }).success).toBe(false);
  });
});
