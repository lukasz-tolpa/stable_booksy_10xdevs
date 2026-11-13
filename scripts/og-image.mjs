/**
 * Obraz podglądu linku (Open Graph, #66): pełne logo „get on a / .horse” na ciemnej
 * zieleni, jak w stopce strony głównej. Generowany raz, wynik commitowany do
 * `public/og-image.png`; skrypt zostaje do ponownego wygenerowania po zmianie logo.
 *
 * Nie rysuje logo od nowa: otwiera stronę główną, bierze logo ze stopki (komponent
 * `src/components/Logo.astro` z jego stylami) i tło stopki, kładzie je na planszy
 * 1200×630 i robi zrzut. Baza nie jest potrzebna — strona główna gościa jej nie czyta.
 *
 *   npx astro dev --port 4400
 *   SHOTS_BASE_URL=http://localhost:4400 npm run og-image
 *
 * Adres i wymiary pliku czyta strona z `OG_IMAGE` w `src/lib/seo/home.ts` — przy zmianie
 * wymiarów zmień oba miejsca. Stoi POZA `e2e/`, więc suita go nie zbiera.
 */

import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { BASE_URL, settle } from "./shots-lib.mjs";

const OUT_FILE = path.resolve(import.meta.dirname, "..", "public", "og-image.png");
const SIZE = { width: 1200, height: 630 };
/** Wysokość „.horse” na planszy, w pikselach — logo zajmuje mniej więcej połowę szerokości. */
const LOGO_FONT_SIZE = 150;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  await page.goto(`${BASE_URL}/`);
  await settle(page);
  const footerLogo = page.getByRole("contentinfo").getByRole("img", { name: "getona.horse", exact: true });
  await footerLogo.waitFor();
  await footerLogo.evaluate((logo, fontSize) => {
    const footer = logo.closest("footer");
    const window = logo.ownerDocument.defaultView;
    if (!footer || !window) throw new Error("Logo nie stoi w stopce.");
    const board = logo.ownerDocument.createElement("div");
    board.style.cssText = [
      "position: fixed",
      "inset: 0",
      "z-index: 2147483647",
      "display: grid",
      "place-items: center",
      `background: ${window.getComputedStyle(footer).backgroundColor}`,
      `font-size: ${String(fontSize)}px`,
    ].join(";");
    // Klon niesie atrybuty zakresu stylów komponentu, więc wygląda jak w stopce.
    board.append(logo.cloneNode(true));
    logo.ownerDocument.body.append(board);
  }, LOGO_FONT_SIZE);
  await page.evaluate("document.fonts.ready.then(() => true)");
  await page.screenshot({ path: OUT_FILE, clip: { x: 0, y: 0, ...SIZE } });
  process.stdout.write(
    `Zapisano ${path.relative(process.cwd(), OUT_FILE)} (${String(SIZE.width)}×${String(SIZE.height)}).
`,
  );
} finally {
  await browser.close();
}
