import { mkdirSync } from "node:fs";
import { expect, test as setup, type Page } from "@playwright/test";
import {
  AUTH_DIR,
  PASSWORD,
  RIDER_A_NAME,
  RIDER_A_STATE,
  RIDER_B_NAME,
  RIDER_B_STATE,
  STABLE_EMAIL,
  STABLE_STATE,
  waitForIslands,
} from "./helpers";

/**
 * Sesje dla scenariuszy: dwóch świeżych jeźdźców zakładanych przez prawdziwy
 * formularz rejestracji (potwierdzanie e-maila jest lokalnie wyłączone) i konto
 * ośrodka z seeda, używane wyłącznie do odczytu. Świeży jeździec per uruchomienie
 * to izolacja danych: żaden scenariusz nie dzieli stanu z Anną ani Piotrem
 * z seeda, a zapisy z poprzedniego uruchomienia nie zabarwiają następnego.
 */

async function signUpRider(page: Page, tag: string, fullName: string): Promise<void> {
  const email = `e2e-rider-${tag}-${String(Date.now())}@example.com`;

  await page.goto("/auth/signup");
  await waitForIslands(page);
  await page.getByRole("radio", { name: "Jeździec" }).check();
  await page.getByLabel("Imię i nazwisko").fill(fullName);
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Powtórz hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await page.waitForURL("**/jezdziec");
  await expect(page.getByRole("heading", { level: 1, name: "Ośrodki" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
}

setup.beforeAll(() => {
  mkdirSync(AUTH_DIR, { recursive: true });
});

setup("jeździec A — świeże konto", async ({ page }) => {
  await signUpRider(page, "a", RIDER_A_NAME);
  await page.context().storageState({ path: RIDER_A_STATE });
});

setup("jeździec B — świeże konto", async ({ page }) => {
  await signUpRider(page, "b", RIDER_B_NAME);
  await page.context().storageState({ path: RIDER_B_STATE });
});

setup("ośrodek z seeda — logowanie", async ({ page }) => {
  await page.goto("/auth/signin");
  await waitForIslands(page);
  await page.getByLabel("Adres e-mail").fill(STABLE_EMAIL);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL("**/osrodek");
  await expect(page.getByRole("heading", { level: 1, name: "Panel ośrodka" })).toBeVisible();
  await page.context().storageState({ path: STABLE_STATE });
});
