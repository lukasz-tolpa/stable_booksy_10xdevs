import { describe, expect, it } from "vitest";
import { stableBookingSuccessMessage } from "@/lib/bookings/stable-redirect";

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
