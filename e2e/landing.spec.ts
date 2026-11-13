import { expect, test } from "@playwright/test";
import { waitForIslands } from "./helpers";

/**
 * Strona główna jako dwa wejścia (#49, #51): gość wybiera połowę, a rejestracja otwiera
 * się z zaznaczonym rodzajem konta. Bez stanu sesji — to scenariusz gościa.
 *
 * Górny pasek też ma linki „Zaloguj się” i „Załóż konto”, więc przyciski połów
 * szukane są po pełnej nazwie, a link logowania pod połowami wewnątrz `<main>`.
 */
test("gość wchodzi ze strony głównej do rejestracji swojej roli albo do logowania", async ({ page }) => {
  await test.step("strona główna pokazuje dwie połowy", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Jeżdżę konno.", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Prowadzę ośrodek.", exact: true })).toBeVisible();
  });

  await test.step("„Załóż konto ośrodka” otwiera rejestrację z zaznaczonym kontem ośrodka", async () => {
    await page.getByRole("link", { name: "Załóż konto ośrodka", exact: true }).click();
    await page.waitForURL("**/auth/signup?rola=osrodek");
    await waitForIslands(page);
    await expect(page.getByRole("radio", { name: "Ośrodek" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Jeździec" })).not.toBeChecked();
  });

  await test.step("„Załóż konto jeźdźca” otwiera rejestrację z zaznaczonym kontem jeźdźca", async () => {
    await page.goto("/");
    await page.getByRole("link", { name: "Załóż konto jeźdźca", exact: true }).click();
    await page.waitForURL("**/auth/signup?rola=jezdziec");
    await waitForIslands(page);
    await expect(page.getByRole("radio", { name: "Jeździec" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Ośrodek" })).not.toBeChecked();
  });

  await test.step("„Zaloguj się” pod połowami prowadzi do logowania", async () => {
    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: "Zaloguj się", exact: true }).click();
    await page.waitForURL("**/auth/signin");
    await expect(page.getByRole("heading", { level: 1, name: "Zaloguj się", exact: true })).toBeVisible();
  });
});
