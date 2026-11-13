import { describe, expect, it } from "vitest";
import { pageTitle } from "@/lib/seo/title";

describe("pageTitle", () => {
  it("dopisuje nazwę produktu po nazwie strony", () => {
    expect(pageTitle("Logowanie")).toBe("Logowanie – getona.horse");
    expect(pageTitle("Rejestracja")).toBe("Rejestracja – getona.horse");
  });

  it("bez nazwy strony to sama nazwa produktu", () => {
    expect(pageTitle()).toBe("getona.horse");
  });
});
