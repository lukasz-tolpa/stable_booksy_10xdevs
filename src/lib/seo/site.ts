/**
 * Adres strony z `site` w astro.config.mjs. Adresy kanoniczne, podgląd linku, dane
 * strukturalne i `robots.txt` budują się z niego, więc bez niego nie ma czego serwować.
 * `purpose` mówi, czego nie da się zbudować.
 */
export function requireSite(site: URL | undefined, purpose: string): URL {
  if (!site) throw new Error(`Brak \`site\` w astro.config.mjs — ${purpose}.`);
  return site;
}
