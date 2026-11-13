/**
 * Nazwa produktu — jedyne miejsce, w którym jest zapisana (ADR-0003, GLOSSARY.md).
 * Zawsze małymi literami i z kropką; nazwa jest adresem i czyta się jako zdanie
 * „get on a horse”. Zapis jest jeden: zdanie i końcówka poniżej. Z nich powstają
 * i części logo, i `PRODUCT_NAME`, więc to, co logo pokazuje, i to, co czyta
 * czytnik ekranu (`aria-label`), nie mogą się rozjechać.
 */
const SENTENCE = "get on a";
const TLD = ".horse";
const STEM = SENTENCE.replaceAll(" ", "");

/**
 * Części, z których logo składa nazwę (`src/components/Logo.astro`): układ zwarty
 * to `stem` + `tld` w jednej linii, układ pełny to `sentence` nad `tld`.
 */
export const LOGO_PARTS = {
  stem: STEM,
  sentence: SENTENCE,
  tld: TLD,
} as const;

/** Biorą ją stąd logo, domyślny tytuł strony i nagłówek sekcji „Jeden dzień”. */
export const PRODUCT_NAME = `${STEM}${TLD}`;
