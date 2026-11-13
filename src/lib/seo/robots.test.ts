import { describe, expect, it } from "vitest";
import { isInSitemap, robotsTxt } from "@/lib/seo/robots";

const SITE = "https://getona.horse";

describe("isInSitemap", () => {
  it("wpuszcza stronę główną", () => {
    expect(isInSitemap(`${SITE}/`)).toBe(true);
  });

  it("nie wpuszcza logowania, rejestracji ani potwierdzenia e-maila", () => {
    expect(isInSitemap(`${SITE}/auth/signin/`)).toBe(false);
    expect(isInSitemap(`${SITE}/auth/signup/`)).toBe(false);
    expect(isInSitemap(`${SITE}/auth/confirm-email/`)).toBe(false);
  });

  it("nie wpuszcza żadnej ścieżki ośrodka", () => {
    for (const path of ["/osrodek/", "/osrodek/grafik/", "/osrodek/statystyki/", "/osrodek/nowa-stadnina/"]) {
      expect(isInSitemap(`${SITE}${path}`)).toBe(false);
    }
  });

  it("nie wpuszcza żadnej ścieżki jeźdźca", () => {
    for (const path of ["/jezdziec/", "/jezdziec/zapisy/", "/jezdziec/osrodki/abc/"]) {
      expect(isInSitemap(`${SITE}${path}`)).toBe(false);
    }
  });
});

describe("robotsTxt", () => {
  const lines = (site: string) => robotsTxt(new URL(site)).split("\n");

  it("dotyczy wszystkich robotów i blokuje przestrzeń ośrodka, jeźdźca i API", () => {
    const robots = lines(SITE);
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Disallow: /osrodek/");
    expect(robots).toContain("Disallow: /jezdziec/");
    expect(robots).toContain("Disallow: /api/");
  });

  it("nie blokuje logowania ani rejestracji, żeby robot zobaczył zakaz indeksowania", () => {
    const disallowed = lines(SITE).filter((line) => line.startsWith("Disallow:"));
    expect(disallowed.some((line) => line.includes("/auth"))).toBe(false);
  });

  it("deklaruje zgodę na wyszukiwanie i odpowiedzi AI, bez trenowania", () => {
    expect(lines(SITE)).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=no");
  });

  it("wskazuje indeks mapy strony pod adresem strony z konfiguracji", () => {
    expect(lines("https://getona.horse")).toContain("Sitemap: https://getona.horse/sitemap-index.xml");
    expect(lines("https://stable-booksy.example.workers.dev/")).toContain(
      "Sitemap: https://stable-booksy.example.workers.dev/sitemap-index.xml",
    );
  });
});
