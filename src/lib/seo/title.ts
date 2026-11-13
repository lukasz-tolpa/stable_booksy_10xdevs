import { PRODUCT_NAME } from "@/lib/brand";

/**
 * Tytuł karty przeglądarki i wyniku wyszukiwania: nazwa strony, potem nazwa produktu.
 * Składa go `Layout.astro` — strony podają tylko swoją nazwę.
 */
export function pageTitle(name?: string): string {
  return name ? `${name} – ${PRODUCT_NAME}` : PRODUCT_NAME;
}
