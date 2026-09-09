import { describe, expect, it } from "vitest";
import { bookingSchema, cancelSchema } from "@/lib/bookings/schema";

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

  // Oracle (decyzja z planowania Fazy 2): brakujące pole liczbowe to błąd walidacji
  // z komunikatem TEGO pola, a nie `0` przepuszczone do bazy. Regresja, którą łapie:
  // powrót do `z.coerce.number()`, gdzie `""` staje się `0`, a brak `hour` odbija się
  // od triggera godzin pracy z mylącym komunikatem.
  it.each([
    ["stableId", "", "Nieprawidłowy ośrodek"],
    ["stableId", "   ", "Nieprawidłowy ośrodek"],
    ["horseId", "", "Nieprawidłowy koń"],
    ["horseId", "   ", "Nieprawidłowy koń"],
    ["hour", "", "Nieprawidłowa godzina"],
    ["hour", "   ", "Nieprawidłowa godzina"],
  ])("puste pole %s (%j) daje komunikat tego pola", (field, blank, message) => {
    const result = bookingSchema.safeParse({ ...VALID, [field]: blank });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual([field]);
      expect(result.error.issues[0].message).toBe(message);
    }
  });

  it("brak pola hour nigdy nie przechodzi jako godzina 0", () => {
    const { hour: _hour, ...withoutHour } = VALID;

    expect(bookingSchema.safeParse(withoutHour).success).toBe(false);
    expect(bookingSchema.safeParse({ ...VALID, hour: "0" }).success).toBe(true);
  });

  it("przycina białe znaki wokół cyfr, ale nie przyjmuje zapisu wykładniczego", () => {
    expect(bookingSchema.parse({ ...VALID, hour: " 12 " }).hour).toBe(12);
    expect(bookingSchema.safeParse({ ...VALID, hour: "1e1" }).success).toBe(false);
  });
});

describe("cancelSchema", () => {
  it("koercjuje identyfikator ze stringa formularza", () => {
    expect(cancelSchema.parse({ bookingId: "7" })).toEqual({ bookingId: 7 });
  });

  it("odrzuca niedodatnie i nieliczbowe identyfikatory z polskim komunikatem", () => {
    expect(cancelSchema.safeParse({ bookingId: "0" }).success).toBe(false);
    expect(cancelSchema.safeParse({ bookingId: "abc" }).success).toBe(false);

    const result = cancelSchema.safeParse({ bookingId: "-1" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Nieprawidłowy zapis");
    }
  });

  // Ten sam oracle co dla formularza zapisu: brak / puste pole to błąd walidacji
  // z komunikatem tego pola, nigdy `0` przepuszczone do bazy.
  it.each([[""], ["   "]])("puste pole bookingId (%j) daje komunikat tego pola", (blank) => {
    const result = cancelSchema.safeParse({ bookingId: blank });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["bookingId"]);
      expect(result.error.issues[0].message).toBe("Nieprawidłowy zapis");
    }
  });
});
