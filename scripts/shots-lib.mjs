/**
 * Wspólna część skryptów zrzutów (`scripts/shots.mjs`, `scripts/shots-day.mjs`):
 * adres podglądu, konta demo, dzień seeda, logowanie i przygotowanie strony do zrzutu.
 *
 * Świadomie nie importuje nic z `e2e/` ani `e2e/` stąd - suita i skrypty zrzutów
 * zostają rozdzielone; te same wartości (`STABLE_NAME`, hasło, reguła dnia seeda)
 * ma osobno `e2e/helpers.ts`.
 */

import process from "node:process";

export const BASE_URL = process.env.SHOTS_BASE_URL ?? "http://localhost:4173";

/** Konta z seeda (`supabase/seed.sql`), hasło jak w e2e. */
export const PASSWORD = "sekret123";
export const RIDER_EMAIL = "anna.kowalska@example.com";
export const STABLE_EMAIL = "osrodek.debem@example.com";
/** Ośrodek z seeda - grafik ma tylko on. */
export const STABLE_NAME = "Stadnina Pod Dębem";

/**
 * Dzień, na który seed układa grafik: `current_date + 1` liczone w UTC (strefa
 * kontenera Postgresa). Ta sama reguła co `e2e/helpers.ts` - strona ośrodka
 * domyślnie pokazuje jutro w Europe/Warsaw, co po 22:00 UTC rozjeżdża się o dobę.
 * @returns {string} data ISO `YYYY-MM-DD`
 */
export function seedDay() {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/**
 * Strona gotowa do pracy i do zrzutu. Formularze auth i grafik to wyspy React
 * z kontrolowanymi polami - `fill` przed hydracją zostaje nadpisany, a Astro zdejmuje
 * `ssr` z `<astro-island>` po hydracji. Pasek narzędzi Astro istnieje tylko na serwerze
 * deweloperskim i zasłania treść.
 * @param {import("@playwright/test").Page} page
 */
export async function settle(page) {
  await page.waitForSelector("astro-island[ssr]", { state: "detached" });
  await page.addStyleTag({ content: "astro-dev-toolbar { display: none !important; }" });
  await page.evaluate("document.fonts.ready.then(() => true)");
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} email
 */
export async function signIn(page, email) {
  await page.goto(`${BASE_URL}/auth/signin`);
  await settle(page);
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL(/\/(jezdziec|osrodek)/);
}

/**
 * Adres strony ośrodka bierzemy z katalogu, a nie z zaszytego UUID - seed po
 * `db reset` generuje nowe identyfikatory. Strona musi być zalogowana jako jeździec.
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<string>} ścieżka `/jezdziec/osrodki/<id>`
 */
export async function findStablePath(page) {
  await page.goto(`${BASE_URL}/jezdziec`);
  await page.getByRole("link", { name: STABLE_NAME }).first().click();
  await page.getByRole("heading", { level: 1, name: STABLE_NAME }).waitFor();
  return new URL(page.url()).pathname;
}
