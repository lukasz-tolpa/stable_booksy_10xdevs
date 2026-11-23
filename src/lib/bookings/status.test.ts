import { describe, expect, it } from "vitest";
import {
  bookingStateAt,
  cancelledByLabel,
  isActiveBooking,
  isCancellationOfAccepted,
  isPendingOrActive,
  toBookingStatus,
  toCancelledBy,
} from "@/lib/bookings/status";

// 2026-06-15 12:30 w Warszawie (CEST, UTC+2).
const NOW = new Date("2026-06-15T10:30:00Z");

describe("toBookingStatus", () => {
  it.each(["pending", "active", "rejected", "cancelled"] as const)("przepuszcza status %s", (status) => {
    expect(toBookingStatus(status)).toBe(status);
  });

  // Nowy status w schemacie, o którym aplikacja nie wie, to stan awarii, nie cichy „aktywny".
  // „Wygasły” nie jest wartością kolumny — wyprowadza go `bookingStateAt`.
  it("nieznany status rzuca wyjątkiem", () => {
    expect(() => toBookingStatus("expired")).toThrow("Nieznany status zapisu: expired");
  });
});

describe("bookingStateAt", () => {
  it("zapis oczekujący, którego slot jeszcze się nie zaczął, jest oczekujący", () => {
    expect(bookingStateAt({ status: "pending", day: "2026-06-15", hour: 13 }, NOW)).toBe("pending");
  });

  it("zapis oczekujący, którego slot już się zaczął, jest wygasły", () => {
    expect(bookingStateAt({ status: "pending", day: "2026-06-15", hour: 12 }, NOW)).toBe("expired");
    expect(bookingStateAt({ status: "pending", day: "2026-06-14", hour: 15 }, NOW)).toBe("expired");
  });

  it.each(["active", "rejected", "cancelled"] as const)("zapis %s nie wygasa po starcie slotu", (status) => {
    expect(bookingStateAt({ status, day: "2026-06-14", hour: 15 }, NOW)).toBe(status);
  });
});

describe("isActiveBooking", () => {
  it("miejsce zajmuje tylko zapis aktywny", () => {
    expect(isActiveBooking({ status: "active" })).toBe(true);
    for (const status of ["pending", "rejected", "cancelled"] as const) {
      expect(isActiveBooking({ status })).toBe(false);
    }
  });
});

describe("isPendingOrActive", () => {
  it("godzinę trzyma i odwołać można zapis oczekujący albo aktywny — odrzucony, odwołany i wygasły nie", () => {
    expect(isPendingOrActive({ status: "pending" })).toBe(true);
    expect(isPendingOrActive({ status: "active" })).toBe(true);
    for (const status of ["rejected", "cancelled", "expired"]) {
      expect(isPendingOrActive({ status })).toBe(false);
    }
  });
});

describe("isCancellationOfAccepted", () => {
  it("liczy się odwołanie zapisu, który był przyjęty", () => {
    expect(isCancellationOfAccepted({ status: "cancelled", wasAccepted: true })).toBe(true);
  });

  it("odwołanie zapisu oczekującego nie jest odwołaniem jazdy", () => {
    expect(isCancellationOfAccepted({ status: "cancelled", wasAccepted: false })).toBe(false);
  });

  it.each(["pending", "active", "rejected"] as const)("zapis %s nie jest odwołaniem", (status) => {
    expect(isCancellationOfAccepted({ status, wasAccepted: status === "active" })).toBe(false);
  });
});

describe("toCancelledBy", () => {
  it.each(["rider", "stable", null] as const)("przepuszcza %j", (value) => {
    expect(toCancelledBy(value)).toBe(value);
  });

  it("nieznana strona odwołania rzuca wyjątkiem", () => {
    expect(() => toCancelledBy("admin")).toThrow("Nieznana strona odwołania zapisu: admin");
  });
});

describe("cancelledByLabel", () => {
  it("właściciel ośrodka widzi, czy odwołał jeździec, czy ośrodek", () => {
    expect(cancelledByLabel("rider", "instructor")).toBe("przez jeźdźca");
    expect(cancelledByLabel("stable", "instructor")).toBe("przez ośrodek");
  });

  it("jeździec widzi własne odwołanie jako „przez Ciebie”", () => {
    expect(cancelledByLabel("rider", "rider")).toBe("przez Ciebie");
    expect(cancelledByLabel("stable", "rider")).toBe("przez ośrodek");
  });
});
