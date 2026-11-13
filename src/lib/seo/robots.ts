/**
 * Co widzą roboty (#65, decyzje SEO z audytu `docs/seo/audyt-2026-11-13.md`).
 * Publiczna jest tylko strona główna; reszta to logowanie, rejestracja i przestrzenie
 * ról, które bez sesji przekierowują do logowania.
 *
 * Plik nie importuje aliasu `@/`, bo czyta go także `astro.config.mjs`.
 */

/** Ścieżki wpuszczane do mapy strony. */
const SITEMAP_PATHS: readonly string[] = ["/"];

/**
 * Przestrzenie zamknięte dla robotów: ośrodek, jeździec (`ROLE_HOME` w `@/lib/auth/roles`)
 * i API. `/auth/` celowo nie — robot musi wejść na logowanie, żeby zobaczyć `noindex`.
 */
const DISALLOWED_PREFIXES: readonly string[] = ["/osrodek/", "/jezdziec/", "/api/"];

/** Na co zgadzamy się wobec robotów AI (contentsignals.org): wyszukiwanie i odpowiedzi tak, trening nie. */
const CONTENT_SIGNAL = "search=yes, ai-input=yes, ai-train=no";

/** Treść `/robots.txt`; adres mapy strony budowany z `site` z konfiguracji Astro. */
export function robotsTxt(site: URL): string {
  return [
    "User-agent: *",
    `Content-Signal: ${CONTENT_SIGNAL}`,
    ...DISALLOWED_PREFIXES.map((prefix) => `Disallow: ${prefix}`),
    "",
    `Sitemap: ${new URL("sitemap-index.xml", site).href}`,
    "",
  ].join("\n");
}

/** Reguła mapy strony — `filter` integracji `@astrojs/sitemap` dostaje pełny adres strony. */
export function isInSitemap(pageUrl: string): boolean {
  return SITEMAP_PATHS.includes(new URL(pageUrl).pathname);
}
