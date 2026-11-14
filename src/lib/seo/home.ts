import { PRODUCT_NAME } from "@/lib/brand";

/**
 * Jak strona główna wygląda w wynikach wyszukiwania i w podglądzie linku (#66).
 * Teksty zatwierdzone co do słowa (decyzja Q11); mogą użyć słów, które ludzie wpisują
 * w wyszukiwarkę („stajnia”) — nota w GLOSSARY.md.
 */
export const HOME_TITLE = `${PRODUCT_NAME} – zapisy na jazdy konne i grafik stajni`;
export const HOME_DESCRIPTION =
  "Jeździec widzi wolne miejsca u instruktorów i zapisuje się jednym kliknięciem. Ośrodek układa grafik dnia, limity miejsc i przydziela konie.";

/**
 * Obraz podglądu linku: pełne logo na ciemnej zieleni, plik w `public/`.
 * Generuje go `scripts/og-image.mjs` (README, sekcja SEO) — wymiary muszą się zgadzać z plikiem.
 */
export const OG_IMAGE = { path: "/og-image.png", width: 1200, height: 630, alt: PRODUCT_NAME } as const;

/** Ikona 512 px z `public/` — logo organizacji w danych strukturalnych. */
const LOGO_PATH = "/icon-512.png";

/**
 * Dane strukturalne strony głównej: jeden graf Organization + WebSite + WebApplication
 * (wzór: załącznik audytu `docs/seo/audyt-2026-11-13.md`). Adresy z `site` w astro.config.mjs.
 * Bez `offers`, ocen i opinii, dopóki właściciel nie ustali ceny i nie ma prawdziwych opinii (Q5).
 */
export function homeStructuredData(site: URL) {
  const home = new URL("/", site).href;
  const organization = { "@id": `${home}#organization` };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        ...organization,
        name: PRODUCT_NAME,
        url: home,
        logo: new URL(LOGO_PATH, site).href,
      },
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        name: PRODUCT_NAME,
        url: home,
        inLanguage: "pl-PL",
        publisher: organization,
      },
      {
        "@type": "WebApplication",
        "@id": `${home}#app`,
        name: PRODUCT_NAME,
        url: home,
        description: HOME_DESCRIPTION,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        browserRequirements: "Requires JavaScript",
        inLanguage: "pl-PL",
        publisher: organization,
      },
    ],
  };
}

/**
 * Treść bloku `<script type="application/ld+json">`. `<` zapisany jako `<` — ten sam
 * JSON po odczycie, ale żaden tekst nie zamknie bloku `</script>` przedwcześnie.
 */
export function jsonLd(data: object): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}
