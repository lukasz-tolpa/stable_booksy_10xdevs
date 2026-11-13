/**
 * Zrzuty wszystkich ekranów w dwóch szerokościach - narzędzie do porównania z
 * prototypami z `context/changes/ui-redesign/design/`.
 *
 * Świadomie stoi POZA `e2e/`: suita Playwrighta zbiera `e2e/**` i to jest jej
 * cały testDir, więc skrypt nie zostanie wciągnięty do `npm run test:e2e` ani
 * do CI. Nic nie asertuje - robi obrazki.
 *
 * Wymaga działającego podglądu i lokalnego stacka Supabase z aktualnym seedem:
 *
 *   npx supabase start && npx supabase db reset
 *   npm run build && npm run preview -- --port 4173
 *   node scripts/shots.mjs                  # albo SHOTS_BASE_URL=... node scripts/shots.mjs
 *
 * Wynik trafia do `shots/<viewport>/<ekran>.png` (katalog jest w .gitignore).
 * Konta, dzień seeda i logowanie dzieli z `scripts/shots-day.mjs` przez `shots-lib.mjs`.
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";
import { BASE_URL, RIDER_EMAIL, STABLE_EMAIL, findStablePath, seedDay, settle, signIn } from "./shots-lib.mjs";

const OUT_DIR = path.resolve(import.meta.dirname, "..", "shots");

/** Prototypy są rysowane w tych dwóch szerokościach - DESIGN.md §4. */
const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
];

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} viewport
 * @param {string} name
 * @param {string} url
 */
async function shoot(page, viewport, name, url) {
  await page.goto(url);
  await settle(page);
  const file = path.join(OUT_DIR, viewport, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  process.stdout.write(`${path.relative(process.cwd(), file)}\n`);
}

const browser = await chromium.launch();

try {
  for (const viewport of VIEWPORTS) {
    mkdirSync(path.join(OUT_DIR, viewport.name), { recursive: true });

    // Trzy konteksty zamiast jednego: wylogowanie między rolami gubiłoby ciasteczka
    // wolniej, niż trwa postawienie nowego kontekstu, a rozdział ról jest czytelniejszy.
    const size = { width: viewport.width, height: viewport.height };

    const guest = await browser.newContext({ viewport: size, locale: "pl-PL" });
    const guestPage = await guest.newPage();
    await shoot(guestPage, viewport.name, "landing", `${BASE_URL}/`);
    await shoot(guestPage, viewport.name, "signin", `${BASE_URL}/auth/signin`);
    await shoot(guestPage, viewport.name, "signup", `${BASE_URL}/auth/signup`);
    await guest.close();

    const rider = await browser.newContext({ viewport: size, locale: "pl-PL" });
    const riderPage = await rider.newPage();
    await signIn(riderPage, RIDER_EMAIL);
    const stablePath = await findStablePath(riderPage);
    await shoot(riderPage, viewport.name, "rider-catalogue", `${BASE_URL}/jezdziec`);
    await shoot(riderPage, viewport.name, "rider-slots", `${BASE_URL}${stablePath}?dzien=${seedDay()}`);
    await shoot(riderPage, viewport.name, "rider-bookings", `${BASE_URL}/jezdziec/zapisy`);
    await rider.close();

    const stable = await browser.newContext({ viewport: size, locale: "pl-PL" });
    const stablePage = await stable.newPage();
    await signIn(stablePage, STABLE_EMAIL);
    await shoot(stablePage, viewport.name, "stable-panel", `${BASE_URL}/osrodek`);
    await shoot(stablePage, viewport.name, "stable-schedule", `${BASE_URL}/osrodek/grafik`);
    await shoot(stablePage, viewport.name, "stable-horses", `${BASE_URL}/osrodek/konie`);
    await shoot(stablePage, viewport.name, "stable-instructors", `${BASE_URL}/osrodek/instruktorzy`);
    await shoot(stablePage, viewport.name, "stable-bookings", `${BASE_URL}/osrodek/zapisy`);
    await shoot(stablePage, viewport.name, "stable-stats", `${BASE_URL}/osrodek/statystyki`);
    await stable.close();
  }
} finally {
  await browser.close();
}
