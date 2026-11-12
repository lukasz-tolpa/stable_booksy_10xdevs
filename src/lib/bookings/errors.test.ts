import { describe, expect, it } from "vitest";
import {
  ALREADY_BOOKED_THIS_HOUR,
  HOUR_OUTSIDE_WORKING_HOURS,
  NO_SEATS_LEFT,
  SCHEDULE_CHANGED,
  bookingErrorMessage,
} from "@/lib/bookings/errors";

const FALLBACK = "Nie udało się zapisać na jazdę. Spróbuj ponownie.";

describe("bookingErrorMessage", () => {
  // Oracle: AC #41 — brak miejsc, drugi zapis na tę samą godzinę i zmiana grafiku w trakcie
  // zapisu mają rozróżnialne kody i polskie komunikaty.
  it("brak miejsc (SB009) mówi, że miejsca się skończyły, i podpowiada inny termin", () => {
    const message = bookingErrorMessage(NO_SEATS_LEFT);

    expect(message).toContain("wolnych miejsc");
    expect(message).toContain("Wybierz inny");
  });

  it("drugi zapis na tę samą godzinę (23505) mówi o istniejącym zapisie o tej godzinie", () => {
    expect(bookingErrorMessage(ALREADY_BOOKED_THIS_HOUR)).toContain("Masz już zapis o tej godzinie");
  });

  it("zmiana grafiku w międzyczasie (23503) każe odświeżyć stronę", () => {
    expect(bookingErrorMessage(SCHEDULE_CHANGED)).toContain("Odśwież");
  });

  it("godzina poza zakresem pracy (23514) ma własny komunikat", () => {
    expect(bookingErrorMessage(HOUR_OUTSIDE_WORKING_HOURS)).toContain("poza zakresem pracy");
  });

  it("cztery kody bazy dają cztery różne komunikaty", () => {
    const messages = [NO_SEATS_LEFT, ALREADY_BOOKED_THIS_HOUR, SCHEDULE_CHANGED, HOUR_OUTSIDE_WORKING_HOURS].map(
      (code) => bookingErrorMessage(code),
    );

    expect(new Set(messages).size).toBe(4);
  });

  // Oracle (decyzja z planowania Fazy 2): odmowa trwała (42501 — konto ośrodka albo
  // podrobiony rider_id) i awaria sieci (PostgREST oddaje `code: ""`) dostają ten sam
  // wariant domyślny. Te ścieżki nie są osiągalne z interfejsu.
  it.each([["42501"], [""], ["PGRST116"], ["SB0099"], [undefined]])(
    "kod %j daje dokładnie wariant domyślny",
    (code) => {
      expect(bookingErrorMessage(code)).toBe(FALLBACK);
    },
  );

  // Zbiór komunikatów jest zamknięty: cokolwiek wejdzie, wychodzi jedno z pięciu polskich
  // zdań. Regresja, którą łapie: przepuszczenie treści dostawcy (`fetch failed`,
  // `duplicate key`) albo angielskiego tekstu do parametru `?error=`.
  it("każdy kod trafia w zamknięty zbiór pięciu polskich zdań bez treści dostawcy", () => {
    const codes = [NO_SEATS_LEFT, ALREADY_BOOKED_THIS_HOUR, SCHEDULE_CHANGED, HOUR_OUTSIDE_WORKING_HOURS, undefined];
    const closedSet = new Set(codes.map(bookingErrorMessage));
    expect(closedSet.size).toBe(5);

    const probes = [...codes, "42501", "", "PGRST116", "23505x", "sb009"];
    for (const message of probes.map(bookingErrorMessage)) {
      expect(closedSet.has(message)).toBe(true);
      expect(message).not.toMatch(/fetch|TypeError|duplicate key|violates|\{\}/);
    }
  });
});
