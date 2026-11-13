/**
 * Nazwa produktu — jedyne miejsce, w którym jest zapisana (ADR-0003, GLOSSARY.md).
 * Zawsze małymi literami i z kropką; nazwa jest adresem i czyta się jako zdanie
 * „get on a horse”. Biorą ją stąd logo, domyślny tytuł strony i nagłówek sekcji
 * „Jeden dzień”.
 */
export const PRODUCT_NAME = "getona.horse";

/**
 * Części, z których logo składa nazwę (`src/components/Logo.astro`): układ zwarty
 * to `stem` + `tld` w jednej linii, układ pełny to `sentence` nad `tld`.
 */
export const LOGO_PARTS = {
  stem: "getona",
  sentence: "get on a",
  tld: ".horse",
} as const;
