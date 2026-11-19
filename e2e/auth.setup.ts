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
import { loadDemoHistory } from "../scripts/db-demo.mjs";

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

/**
 * Miniona historia dla strony statystyk (`stable-stats.spec.ts`). Seed układa grafik
 * wyłącznie na jutro, a przeszłości nie da się wyklikać w przeglądarce. Ładowanie jest
 * idempotentne, więc powtórka i kolejne uruchomienie niczego nie dublują.
 */
setup("miniona historia demo ośrodka", () => {
  loadDemoHistory();
});

setup("jeździec A — świeże konto", async ({ page }) => {
  await signUpRider(page, "a", RIDER_A_NAME);
  await page.context().storageState({ path: RIDER_A_STATE });
});

setup("jeździec B — świeże konto", async ({ page }) => {
  await signUpRider(page, "b", RIDER_B_NAME);
  await page.context().storageState({ path: RIDER_B_STATE });
});

/**
 * Właściciel zakładany przez prawdziwy formularz: rejestracja z wyborem „Ośrodek” zakłada
 * konto instruktora, które trafia na zakładanie ośrodka; nazwa instruktora właściciela ma
 * domyślnie imię i nazwisko z konta. Na stronie Instruktorzy właściciel jest oznaczony i nie
 * ma przełącznika dezaktywacji. Sesja nie jest zapisywana - scenariusze pracują na ośrodku
 * z seeda.
 */
setup("właściciel — rejestracja i założenie ośrodka przez formularz", async ({ page }) => {
  const stamp = String(Date.now());
  const fullName = `Właściciel E2E ${stamp}`;

  await page.goto("/auth/signup");
  await waitForIslands(page);
  await page.getByRole("radio", { name: "Ośrodek" }).check();
  await page.getByLabel("Imię i nazwisko").fill(fullName);
  await page.getByLabel("Adres e-mail").fill(`e2e-owner-${stamp}@example.com`);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Powtórz hasło").fill(PASSWORD);
  await page.getByRole("button", { name: "Załóż konto" }).click();
  await page.waitForURL("**/osrodek/nowa-stadnina");

  await waitForIslands(page);
  await expect(page.getByLabel("Twoja nazwa instruktora")).toHaveValue(fullName);
  await page.getByLabel("Nazwa stadniny").fill(`Ośrodek E2E ${stamp}`);
  await page.getByLabel("Miejscowość").fill("Testowo");
  await page.getByRole("button", { name: "Załóż stadninę" }).click();
  await page.waitForURL("**/osrodek");
  await expect(page.getByRole("heading", { level: 1, name: "Panel ośrodka" })).toBeVisible();

  await page.goto("/osrodek/instruktorzy");
  const ownerCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: fullName }) });
  await expect(ownerCard.getByText("Właściciel", { exact: true })).toBeVisible();
  await expect(ownerCard.getByRole("button", { name: "Dezaktywuj" })).toHaveCount(0);
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
