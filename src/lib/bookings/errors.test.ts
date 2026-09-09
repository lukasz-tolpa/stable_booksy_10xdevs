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

  // Oracle (decyzja z planowania Fazy 2): odmowa trwała (42501 — konto ośrodka albo
  // podrobiony rider_id) i awaria sieci (PostgREST oddaje `code: ""`) dostają ten sam
  // wariant domyślny. PRD wymaga czytelnego komunikatu, nie osobnego zdania — te ścieżki
  // nie są osiągalne z interfejsu.
  it.each([["42501"], [""], ["PGRST116"], [undefined]])("kod %j daje dokładnie wariant domyślny", (code) => {
    expect(bookingErrorMessage(code)).toBe("Nie udało się zapisać na jazdę. Spróbuj ponownie.");
  });

  // Zbiór komunikatów jest zamknięty: cokolwiek wejdzie, wychodzi jedno z czterech
  // polskich zdań. Regresja, którą łapie: przepuszczenie treści dostawcy (`fetch failed`,
  // `duplicate key`) albo angielskiego tekstu do parametru `?error=`.
  it("każdy kod trafia w zamknięty zbiór czterech polskich zdań bez treści dostawcy", () => {
    const closedSet = new Set(
      [SLOT_TAKEN, HOUR_OUTSIDE_WORKING_HOURS, SCHEDULE_CHANGED, undefined].map(bookingErrorMessage),
    );
    expect(closedSet.size).toBe(4);

    const probes = [
      SLOT_TAKEN,
      HOUR_OUTSIDE_WORKING_HOURS,
      SCHEDULE_CHANGED,
      "42501",
      "",
      "PGRST116",
      "23505x",
      undefined,
    ];
    for (const message of probes.map(bookingErrorMessage)) {
      expect(closedSet.has(message)).toBe(true);
      expect(message).not.toMatch(/fetch|TypeError|duplicate key|violates|\{\}/);
    }
  });
});
