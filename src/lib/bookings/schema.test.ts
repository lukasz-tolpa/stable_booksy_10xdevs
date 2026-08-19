import { describe, expect, it } from "vitest";
import { bookingSchema } from "@/lib/bookings/schema";

const VALID = { stableId: "1", day: "2026-08-20", horseId: "2", hour: "12" };

describe("bookingSchema", () => {
  it("przyjmuje poprawne pola formularza i koercjuje liczby ze stringów", () => {
    const parsed = bookingSchema.parse(VALID);

    expect(parsed).toEqual({ stableId: 1, day: "2026-08-20", horseId: 2, hour: 12 });
  });

  it("odrzuca niepoprawną datę kalendarzową", () => {
    expect(bookingSchema.safeParse({ ...VALID, day: "2026-02-30" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...VALID, day: "jutro" }).success).toBe(false);
  });

  it("odrzuca godzinę spoza zakresu 0-23 i wartości niecałkowite", () => {
    expect(bookingSchema.safeParse({ ...VALID, hour: "24" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...VALID, hour: "-1" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...VALID, hour: "12.5" }).success).toBe(false);
  });

  it("odrzuca niedodatnie identyfikatory", () => {
    expect(bookingSchema.safeParse({ ...VALID, stableId: "0" }).success).toBe(false);
    expect(bookingSchema.safeParse({ ...VALID, horseId: "abc" }).success).toBe(false);
  });

  it("komunikaty błędów są po polsku", () => {
    const result = bookingSchema.safeParse({ ...VALID, day: "zle" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Nieprawidłowa data");
    }
  });
});
