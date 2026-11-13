import { describe, expect, it } from "vitest";
import { LOGO_PARTS, PRODUCT_NAME } from "./brand";

describe("nazwa produktu", () => {
  it("brzmi „getona.horse” — małymi literami, z kropką", () => {
    expect(PRODUCT_NAME).toBe("getona.horse");
  });

  it("logo czyta się jako zdanie „get on a .horse”", () => {
    expect(`${LOGO_PARTS.sentence} ${LOGO_PARTS.tld}`).toBe("get on a .horse");
  });

  it("logo bez spacji to dokładnie nazwa produktu", () => {
    expect(`${LOGO_PARTS.sentence}${LOGO_PARTS.tld}`.replaceAll(" ", "")).toBe(PRODUCT_NAME);
  });
});
