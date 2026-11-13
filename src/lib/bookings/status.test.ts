import { describe, expect, it } from "vitest";
import { cancelledByLabel, toBookingStatus, toCancelledBy } from "@/lib/bookings/status";

describe("toBookingStatus", () => {
  it.each(["active", "cancelled"] as const)("przepuszcza status %s", (status) => {
    expect(toBookingStatus(status)).toBe(status);
  });

  // Nowy status w schemacie, o którym aplikacja nie wie, to stan awarii, nie cichy „aktywny".
  it("nieznany status rzuca wyjątkiem", () => {
    expect(() => toBookingStatus("pending")).toThrow("Nieznany status zapisu: pending");
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
  it("ośrodek widzi, czy odwołał jeździec, czy on sam", () => {
    expect(cancelledByLabel("rider", "stable")).toBe("przez jeźdźca");
    expect(cancelledByLabel("stable", "stable")).toBe("przez ośrodek");
  });

  it("jeździec widzi własne odwołanie jako „przez Ciebie”", () => {
    expect(cancelledByLabel("rider", "rider")).toBe("przez Ciebie");
    expect(cancelledByLabel("stable", "rider")).toBe("przez ośrodek");
  });
});
