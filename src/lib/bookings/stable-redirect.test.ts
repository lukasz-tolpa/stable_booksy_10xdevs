import { describe, expect, it } from "vitest";
import { pendingBookingsSuccessMessage, stableBookingSuccessMessage } from "@/lib/bookings/stable-redirect";

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
