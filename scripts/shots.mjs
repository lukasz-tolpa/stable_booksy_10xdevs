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
 */

import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.SHOTS_BASE_URL ?? "http://localhost:4173";
const OUT_DIR = path.resolve(import.meta.dirname, "..", "shots");

/** Konta z seeda (`supabase/seed.sql`), hasło jak w e2e. */
const PASSWORD = "sekret123";
const RIDER_EMAIL = "anna.kowalska@example.com";
const STABLE_EMAIL = "osrodek.debem@example.com";
/** Ośrodek z seeda - grafik ma tylko on. */
const STABLE_NAME = "Stadnina Pod Debem";

/** Prototypy są rysowane w tych dwóch szerokościach - DESIGN.md §4. */
const VIEWPORTS = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
];

/**
 * Dzień, na który seed układa grafik: `current_date + 1` liczone w UTC (strefa
 * kontenera Postgresa). Ta sama reguła co `e2e/helpers.ts` - strona ośrodka
 * domyślnie pokazuje jutro w Europe/Warsaw, co po 22:00 UTC rozjeżdża się o dobę.
 * @returns {string} data ISO `YYYY-MM-DD`
 */
function seedDay() {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/**
 * Formularze auth to wyspy React z kontrolowanymi polami - `fill` przed hydracją
 * zostaje nadpisany. Astro zdejmuje `ssr` z `<astro-island>` po hydracji.
 * @param {import("@playwright/test").Page} page
 */
async function waitForIslands(page) {
  await page.waitForSelector("astro-island[ssr]", { state: "detached" });
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} email
 */
async function signIn(page, email) {
  await page.goto(`${BASE_URL}/auth/signin`);
  await waitForIslands(page);
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL(/\/(jezdziec|osrodek)/);
}

/**
 * Adres strony ośrodka bierzemy z katalogu, a nie z zaszytego UUID - seed po
 * `db reset` generuje nowe identyfikatory.
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string>} ścieżka `/jezdziec/osrodki/<id>`
 */
async function findStablePath(page) {
  await page.goto(`${BASE_URL}/jezdziec`);
  await page.getByRole("link", { name: STABLE_NAME }).first().click();
  await page.getByRole("heading", { level: 1, name: STABLE_NAME }).waitFor();
  return new URL(page.url()).pathname;
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} viewport
 * @param {string} name
 * @param {string} url
 */
async function shoot(page, viewport, name, url) {
  await page.goto(url);
  await waitForIslands(page);
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
    await shoot(stablePage, viewport.name, "stable-bookings", `${BASE_URL}/osrodek/zapisy`);
    await stable.close();
  }
} finally {
  await browser.close();
}
