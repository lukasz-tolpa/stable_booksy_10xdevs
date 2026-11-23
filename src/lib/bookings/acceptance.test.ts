import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_FAILED,
  ACCEPT_NOT_ALLOWED,
  ACCEPT_NOT_PENDING,
  ACCEPT_SLOT_STARTED,
  acceptanceErrorMessage,
} from "@/lib/bookings/acceptance";

describe("acceptanceErrorMessage", () => {
  // Oracle: AC #124 — przyjęcie odmawia ponad limit, po starcie slotu, dla zapisu nieoczekującego i dla
  // wołającego bez uprawnień (kody od SB064, migracja 20261209090000_booking_acceptance.sql).
  it("kody odmów przyjęcia to SB064–SB066", () => {
    expect([ACCEPT_SLOT_STARTED, ACCEPT_NOT_PENDING, ACCEPT_NOT_ALLOWED]).toEqual(["SB064", "SB065", "SB066"]);
  });

  it("każda odmowa ma własne polskie zdanie", () => {
    expect(acceptanceErrorMessage("SB009")).toBe(
      "W tym slocie nie ma już wolnych miejsc — przyjęcie ponad limit miejsc nie jest możliwe.",
    );
    expect(acceptanceErrorMessage(ACCEPT_SLOT_STARTED)).toBe("Ten slot już się zaczął — zapisu nie można już przyjąć.");
    expect(acceptanceErrorMessage(ACCEPT_NOT_PENDING)).toBe(
      "Ten zapis nie czeka już na przyjęcie — jeździec mógł go odwołać albo zapis został przyjęty lub odrzucony.",
    );
    expect(acceptanceErrorMessage(ACCEPT_NOT_ALLOWED)).toBe(
      "Nie znaleziono tego zapisu wśród Twoich zapisów do przyjęcia.",
    );
    expect(acceptanceErrorMessage("23503")).toBe("Tego slotu nie ma już w grafiku — zapisu nie można przyjąć.");
  });

  // Zbiór zamknięty: treść dostawcy nigdy nie trafia do `?error=`.
  it("nieznany kod i awaria sieci dają wariant domyślny", () => {
    for (const code of ["42501", "", "PGRST116", "sb009", undefined]) {
      expect(acceptanceErrorMessage(code)).toBe(ACCEPTANCE_FAILED);
    }
    expect(ACCEPTANCE_FAILED).toBe("Nie udało się przyjąć zapisu. Spróbuj ponownie.");
  });

  // Słownik (GLOSSARY „Przyjęcie zapisu”): przyjęcie, nie akceptacja ani rezerwacja.
  it("komunikaty mówią słowami słownika", () => {
    for (const code of ["SB009", "SB064", "SB065", "SB066", "23503", undefined]) {
      expect(acceptanceErrorMessage(code)).not.toMatch(/akcept|rezerw|potwierdz/i);
    }
  });
});
