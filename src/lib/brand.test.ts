import { describe, expect, it } from "vitest";
import { LOGO_PARTS, PRODUCT_NAME } from "./brand";

describe("nazwa produktu", () => {
  it("brzmi „getona.horse” — małymi literami, z kropką", () => {
    expect(PRODUCT_NAME).toBe("getona.horse");
  });

  it("logo zwarte pokazuje dokładnie nazwę produktu", () => {
    expect(`${LOGO_PARTS.stem}${LOGO_PARTS.tld}`).toBe("getona.horse");
  });

  it("logo pełne czyta się jako zdanie „get on a .horse”", () => {
    expect(`${LOGO_PARTS.sentence} ${LOGO_PARTS.tld}`).toBe("get on a .horse");
  });
});
