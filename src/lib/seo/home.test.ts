import { describe, expect, it } from "vitest";
import { HOME_DESCRIPTION, HOME_TITLE, homeStructuredData, jsonLd } from "@/lib/seo/home";

const SITE = new URL("https://getona.horse");

type Node = Record<string, unknown>;
const graph = (site: URL): Node[] => homeStructuredData(site)["@graph"];
const node = (site: URL, type: string): Node => {
  const found = graph(site).find((entry) => entry["@type"] === type);
  if (!found) throw new Error(`brak węzła ${type}`);
  return found;
};

describe("teksty strony głównej dla wyszukiwarek", () => {
  it("tytuł i opis są co do słowa takie, jak zatwierdził właściciel", () => {
    expect(HOME_TITLE).toBe("getona.horse – zapisy na jazdy konne i grafik stajni");
    expect(HOME_DESCRIPTION).toBe(
      "Jeździec widzi wolne miejsca u instruktorów i zapisuje się jednym kliknięciem. Ośrodek układa grafik dnia, limity miejsc i przydziela konie.",
    );
  });
});

describe("homeStructuredData", () => {
  it("to jeden graf schema.org z organizacją, witryną i aplikacją", () => {
    expect(homeStructuredData(SITE)["@context"]).toBe("https://schema.org");
    expect(graph(SITE).map((entry) => entry["@type"])).toEqual(["Organization", "WebSite", "WebApplication"]);
  });

  it("niesie nazwę produktu i adres strony głównej z adresu strony", () => {
    for (const entry of graph(SITE)) {
      expect(entry.name).toBe("getona.horse");
      expect(entry.url).toBe("https://getona.horse/");
    }
  });

  it("buduje identyfikatory i logo z adresu strony, więc przełączy się razem z nim", () => {
    const site = new URL("https://stable-booksy.example.workers.dev/");
    expect(node(site, "Organization")["@id"]).toBe("https://stable-booksy.example.workers.dev/#organization");
    expect(node(site, "Organization").logo).toBe("https://stable-booksy.example.workers.dev/icon-512.png");
    expect(node(site, "WebSite").publisher).toEqual({
      "@id": "https://stable-booksy.example.workers.dev/#organization",
    });
    expect(node(site, "WebApplication").publisher).toEqual({
      "@id": "https://stable-booksy.example.workers.dev/#organization",
    });
  });

  it("opisuje aplikację internetową po polsku", () => {
    const app = node(SITE, "WebApplication");
    expect(app.applicationCategory).toBe("BusinessApplication");
    expect(app.operatingSystem).toBe("Web");
    expect(app.inLanguage).toBe("pl-PL");
    expect(node(SITE, "WebSite").inLanguage).toBe("pl-PL");
  });

  it("nie zawiera ceny, ocen ani opinii", () => {
    const text = JSON.stringify(homeStructuredData(SITE));
    for (const key of ["offers", "price", "aggregateRating", "review"]) {
      expect(text).not.toContain(`"${key}`);
    }
  });
});

describe("jsonLd", () => {
  it("daje JSON, który przeglądarka odczyta z powrotem bez zmian", () => {
    expect(JSON.parse(jsonLd(homeStructuredData(SITE)))).toEqual(homeStructuredData(SITE));
  });

  it("nie pozwala tekstowi zamknąć bloku `<script>`", () => {
    const text = jsonLd({ name: "</script><script>alert(1)</script>" });
    expect(text).not.toContain("<");
    expect(JSON.parse(text)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
