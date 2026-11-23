import { describe, expect, it } from "vitest";
import type { APIContext } from "astro";
import {
  backAfterPendingDecision,
  pendingBookingsSuccessMessage,
  stableBookingSuccessMessage,
} from "@/lib/bookings/stable-redirect";

describe("stableBookingSuccessMessage", () => {
  it("przydział konia i odwołanie mają własne potwierdzenia", () => {
    expect(stableBookingSuccessMessage("przydzial")).toBe("Przydział konia zapisany.");
    expect(stableBookingSuccessMessage("odwolanie")).toBe(
      "Zapis został odwołany. Miejsce w slocie wróciło do puli wolnych.",
    );
  });

  it("przyjęcie i odrzucenie z zapisów dnia (#128) mają te same potwierdzenia co na „Zapisach do przyjęcia”", () => {
    expect(stableBookingSuccessMessage("przyjecie")).toBe(pendingBookingsSuccessMessage("przyjecie"));
    expect(stableBookingSuccessMessage("odrzucenie")).toBe(pendingBookingsSuccessMessage("odrzucenie"));
  });

  // Parametr z adresu jest dowolnym tekstem — nieznana wartość nie wymyśla sukcesu.
  it.each([[null], [""], ["1"], ["PRZYDZIAL"]])("wartość %j nie daje potwierdzenia", (value) => {
    expect(stableBookingSuccessMessage(value)).toBeNull();
  });
});

describe("pendingBookingsSuccessMessage", () => {
  it("przyjęcie i odrzucenie mają własne potwierdzenia na „Zapisach do przyjęcia”", () => {
    expect(pendingBookingsSuccessMessage("przyjecie")).toBe("Zapis przyjęty. Jeździec ma miejsce w slocie.");
    expect(pendingBookingsSuccessMessage("odrzucenie")).toBe(
      "Zapis odrzucony. Jeździec zobaczy powód w swoich zapisach.",
    );
  });

  it("brak albo nieznana wartość — bez potwierdzenia", () => {
    for (const value of [null, "", "1", "odwolanie"]) {
      expect(pendingBookingsSuccessMessage(value)).toBeNull();
    }
  });
});

describe("backAfterPendingDecision", () => {
  const context = { redirect: (path: string) => path } as unknown as APIContext;

  it("decyzja z zapisów dnia wraca na ten dzień, z „Zapisów do przyjęcia” — na nie (#128)", () => {
    expect(backAfterPendingDecision(context, "2026-08-21", { success: "przyjecie" })).toBe(
      "/osrodek/zapisy?dzien=2026-08-21&sukces=przyjecie",
    );
    expect(backAfterPendingDecision(context, "2026-08-21", { error: "Brak miejsc" })).toBe(
      "/osrodek/zapisy?dzien=2026-08-21&error=Brak+miejsc",
    );
    expect(backAfterPendingDecision(context, null, { success: "odrzucenie" })).toBe(
      "/osrodek/zapisy-do-przyjecia?sukces=odrzucenie",
    );
  });
});
