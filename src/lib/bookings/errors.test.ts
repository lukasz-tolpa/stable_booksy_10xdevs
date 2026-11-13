import { describe, expect, it } from "vitest";
import {
  ALREADY_BOOKED_THIS_HOUR,
  HOUR_OUTSIDE_WORKING_HOURS,
  NO_SEATS_LEFT,
  SCHEDULE_CHANGED,
  bookingErrorMessage,
} from "@/lib/bookings/errors";

const FALLBACK = "Nie udało się zapisać na jazdę. Spróbuj ponownie.";

/** Nazwy ograniczeń z migracji `20261114090000_bookings_on_instructor_seats.sql`. */
const RIDER_HOUR_KEY = "bookings_rider_hour_key";
const HORSE_HOUR_KEY = "bookings_horse_hour_key";

describe("bookingErrorMessage", () => {
  // Oracle: AC #41 — brak miejsc, drugi zapis na tę samą godzinę i zmiana grafiku w trakcie
  // zapisu mają rozróżnialne kody i polskie komunikaty.
  it("brak miejsc (SB009) mówi, że miejsca się skończyły, i podpowiada inny slot", () => {
    expect(bookingErrorMessage(NO_SEATS_LEFT)).toBe(
      "W tym slocie nie ma już wolnych miejsc. Wybierz inną godzinę albo innego instruktora.",
    );
  });

  it("drugi zapis na tę samą godzinę (23505, bookings_rider_hour_key) mówi o istniejącym zapisie", () => {
    expect(bookingErrorMessage(ALREADY_BOOKED_THIS_HOUR, RIDER_HOUR_KEY)).toContain("Masz już zapis o tej godzinie");
  });

  // 23505 jest wspólne dla dwóch indeksów — rozstrzyga nazwa ograniczenia.
  it("koń zajęty o tej godzinie (23505, bookings_horse_hour_key) ma własny komunikat, nie „masz już zapis”", () => {
    const horseTaken = bookingErrorMessage(ALREADY_BOOKED_THIS_HOUR, HORSE_HOUR_KEY);

    expect(horseTaken).toBe(
      "Koń przydzielony do tej jazdy jest już zajęty o tej godzinie. Odśwież stronę i wybierz inny slot.",
    );
    expect(horseTaken).not.toBe(bookingErrorMessage(ALREADY_BOOKED_THIS_HOUR, RIDER_HOUR_KEY));
  });

  it("23505 z nieznanego ograniczenia albo bez nazwy daje wariant domyślny", () => {
    expect(bookingErrorMessage(ALREADY_BOOKED_THIS_HOUR, "bookings_pkey")).toBe(FALLBACK);
    expect(bookingErrorMessage(ALREADY_BOOKED_THIS_HOUR)).toBe(FALLBACK);
  });

  it("zmiana grafiku w międzyczasie (23503 z wyzwalacza albo z FK dnia/instruktora) każe odświeżyć stronę", () => {
    for (const constraint of [undefined, "bookings_schedule_day_fkey", "bookings_instructor_fkey"]) {
      expect(bookingErrorMessage(SCHEDULE_CHANGED, constraint)).toContain("Odśwież");
    }
  });

  it("godzina poza zakresem pracy (23514 z wyzwalacza, bez nazwy ograniczenia) ma własny komunikat", () => {
    expect(bookingErrorMessage(HOUR_OUTSIDE_WORKING_HOURS)).toContain("poza zakresem pracy");
  });

  // 23514 jest wspólne z CHECK-ami spójności zapisu — te nie mówią nic o godzinach pracy.
  it("23514 z CHECK-a spójności zapisu nie udaje godziny poza zakresem", () => {
    expect(bookingErrorMessage(HOUR_OUTSIDE_WORKING_HOURS, "bookings_cancelled_by_consistency_check")).toBe(FALLBACK);
  });

  it("pięć odmów daje pięć różnych komunikatów", () => {
    const messages = [
      bookingErrorMessage(NO_SEATS_LEFT),
      bookingErrorMessage(ALREADY_BOOKED_THIS_HOUR, RIDER_HOUR_KEY),
      bookingErrorMessage(ALREADY_BOOKED_THIS_HOUR, HORSE_HOUR_KEY),
      bookingErrorMessage(SCHEDULE_CHANGED),
      bookingErrorMessage(HOUR_OUTSIDE_WORKING_HOURS),
    ];

    expect(new Set(messages).size).toBe(5);
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

  // Zbiór komunikatów jest zamknięty: cokolwiek wejdzie, wychodzi jedno z sześciu polskich
  // zdań. Regresja, którą łapie: przepuszczenie treści dostawcy (`fetch failed`,
  // `duplicate key`) albo angielskiego tekstu do parametru `?error=`.
  it("każdy kod trafia w zamknięty zbiór sześciu polskich zdań bez treści dostawcy", () => {
    const refusals: [string | undefined, string | undefined][] = [
      [NO_SEATS_LEFT, undefined],
      [ALREADY_BOOKED_THIS_HOUR, RIDER_HOUR_KEY],
      [ALREADY_BOOKED_THIS_HOUR, HORSE_HOUR_KEY],
      [SCHEDULE_CHANGED, undefined],
      [HOUR_OUTSIDE_WORKING_HOURS, undefined],
      [undefined, undefined],
    ];
    const closedSet = new Set(refusals.map(([code, constraint]) => bookingErrorMessage(code, constraint)));
    expect(closedSet.size).toBe(6);

    const probes: [string | undefined, string | undefined][] = [
      ...refusals,
      ["42501", undefined],
      ["", undefined],
      ["PGRST116", undefined],
      ["23505x", RIDER_HOUR_KEY],
      ["sb009", undefined],
      ["23505", "duplicate key value violates unique constraint"],
    ];
    for (const message of probes.map(([code, constraint]) => bookingErrorMessage(code, constraint))) {
      expect(closedSet.has(message)).toBe(true);
      expect(message).not.toMatch(/fetch|TypeError|duplicate key|violates|\{\}/);
    }
  });

  // Słownik (GLOSSARY „Slot”): termin to nie slot.
  it("komunikaty nie używają słowa „termin” w znaczeniu slotu", () => {
    for (const code of [NO_SEATS_LEFT, SCHEDULE_CHANGED, HOUR_OUTSIDE_WORKING_HOURS]) {
      expect(bookingErrorMessage(code)).not.toMatch(/termin/i);
    }
  });
});
