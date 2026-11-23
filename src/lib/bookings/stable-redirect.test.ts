import { describe, expect, it } from "vitest";
import {
  pendingBookingsRouteFor,
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

describe("pendingBookingsRouteFor", () => {
  it("instruktor z kontem wraca na swoje „Zapisy do przyjęcia” — z uprawnieniem do układania grafiku i bez", () => {
    expect(pendingBookingsRouteFor("instructor")).toBe("/instruktor/zapisy-do-przyjecia");
    expect(pendingBookingsRouteFor("arranging-instructor")).toBe("/instruktor/zapisy-do-przyjecia");
  });

  it("właściciel i pozostałe konta — „Zapisy do przyjęcia” ośrodka", () => {
    expect(pendingBookingsRouteFor("owner")).toBe("/osrodek/zapisy-do-przyjecia");
    expect(pendingBookingsRouteFor("inactive")).toBe("/osrodek/zapisy-do-przyjecia");
    expect(pendingBookingsRouteFor("none")).toBe("/osrodek/zapisy-do-przyjecia");
    expect(pendingBookingsRouteFor(null)).toBe("/osrodek/zapisy-do-przyjecia");
  });
});
