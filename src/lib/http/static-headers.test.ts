import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECURITY_HEADERS } from "./security-headers";

// public/_headers to plik Cloudflare Workers Static Assets: blok = linia ze wzorcem ścieżki,
// pod nią wcięte linie „Nazwa: wartość”. Workers stosuje go tylko do plików statycznych,
// więc pilnujemy, żeby zgadzał się z nagłówkami, które middleware daje stronom.
function parseHeadersFile(text: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    if (/^\s/.test(line)) {
      const at = line.indexOf(":");
      current?.set(line.slice(0, at).trim().toLowerCase(), line.slice(at + 1).trim());
    } else {
      current = new Map();
      rules.set(line.trim(), current);
    }
  }
  return rules;
}

const rules = parseHeadersFile(readFileSync(new URL("../../../public/_headers", import.meta.url), "utf8"));

function rule(pattern: string): Map<string, string> {
  const found = rules.get(pattern);
  if (!found) throw new Error(`brak reguły ${pattern} w public/_headers`);
  return found;
}

describe("nagłówki plików statycznych (public/_headers)", () => {
  it("każdy plik dostaje te same nagłówki bezpieczeństwa co strony", () => {
    const all = rule("/*");
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(all.get(name.toLowerCase())).toBe(value);
    }
  });

  it("bez CSP i HSTS", () => {
    for (const headers of rules.values()) {
      expect(headers.has("content-security-policy")).toBe(false);
      expect(headers.has("strict-transport-security")).toBe(false);
    }
  });

  it("zasoby budowane z hashem w nazwie są pamiętane rok i niezmienne", () => {
    expect(rule("/_astro/*").get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  it("zrzuty osi „Jeden dzień”, ikony i obraz podglądu — długo, ale bez immutable", () => {
    for (const pattern of [
      "/jeden-dzien/*",
      "/favicon.ico",
      "/favicon.png",
      "/apple-touch-icon.png",
      "/icon-512.png",
    ]) {
      const cache = rule(pattern).get("cache-control") ?? "";
      expect(cache, pattern).toBe("public, max-age=2592000");
    }
  });

  it("tylko jedna reguła ustawia Cache-Control dla danego pliku (Workers skleja nagłówki z wielu reguł)", () => {
    expect(rule("/*").has("cache-control")).toBe(false);
  });
});
