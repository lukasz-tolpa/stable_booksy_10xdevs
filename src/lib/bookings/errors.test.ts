import { describe, expect, it } from "vitest";
import { HOUR_OUTSIDE_WORKING_HOURS, SCHEDULE_CHANGED, SLOT_TAKEN, bookingErrorMessage } from "@/lib/bookings/errors";

describe("bookingErrorMessage", () => {
  it("odmowa współbieżna (23505) mówi o zajętym slocie i podpowiada wybór innego", () => {
    const message = bookingErrorMessage(SLOT_TAKEN);

    expect(message).toContain("zajęty");
    expect(message).toContain("Wybierz inny");
  });

  it("trzy kody bazy dają trzy różne komunikaty", () => {
    const messages = [SLOT_TAKEN, HOUR_OUTSIDE_WORKING_HOURS, SCHEDULE_CHANGED].map((code) =>
      bookingErrorMessage(code),
    );

    expect(new Set(messages).size).toBe(3);
  });

  it("godzina poza zakresem pracy ma własny komunikat", () => {
    expect(bookingErrorMessage(HOUR_OUTSIDE_WORKING_HOURS)).toContain("poza zakresem pracy");
  });

  it("zmiana grafiku w międzyczasie każe odświeżyć stronę", () => {
    expect(bookingErrorMessage(SCHEDULE_CHANGED)).toContain("Odśwież");
  });

  it("nierozpoznany kod daje wariant domyślny", () => {
    expect(bookingErrorMessage("42P01")).toBe("Nie udało się zapisać na jazdę. Spróbuj ponownie.");
    expect(bookingErrorMessage(undefined)).toBe("Nie udało się zapisać na jazdę. Spróbuj ponownie.");
  });
});
