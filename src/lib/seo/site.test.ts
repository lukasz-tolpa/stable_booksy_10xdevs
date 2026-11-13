import { describe, expect, it } from "vitest";
import { requireSite } from "@/lib/seo/site";

describe("requireSite", () => {
  it("oddaje adres strony z konfiguracji", () => {
    const site = new URL("https://getona.horse");
    expect(requireSite(site, "robots.txt nie zbuduje adresu mapy strony")).toBe(site);
  });

  it("bez `site` przerywa z komunikatem, czego nie da się zbudować", () => {
    expect(() => requireSite(undefined, "robots.txt nie zbuduje adresu mapy strony")).toThrow(
      "Brak `site` w astro.config.mjs — robots.txt nie zbuduje adresu mapy strony.",
    );
  });
});
