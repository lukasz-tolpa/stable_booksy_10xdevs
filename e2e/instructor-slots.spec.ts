import { expect, test } from "@playwright/test";
import { INSTRUCTOR_EMAIL, PASSWORD, STABLE_NAME, hourSection, waitForIslands } from "./helpers";

/**
 * „Moje sloty” (#72): instruktorka z kontem z seeda, która nie jest właścicielką, loguje się
 * tym samym formularzem co wszyscy, trafia do swoich slotów i widzi zapisaną jeźdźczynię.
 * Wejście pod adres przestrzeni ośrodka przenosi ją z powrotem. Tylko odczyt — scenariusz
 * niczego nie zmienia (Anna u Joanny o 11 to zapis z seeda).
 */
test("instruktorka z kontem widzi swoje sloty z zapisanymi i nie wchodzi do przestrzeni ośrodka", async ({ page }) => {
  await test.step("logowanie tym samym formularzem prowadzi do „Moje sloty”", async () => {
    await page.goto("/auth/signin");
    await waitForIslands(page);
    await page.getByLabel("Adres e-mail").fill(INSTRUCTOR_EMAIL);
    await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL("**/instruktor");
    await expect(page.getByRole("heading", { level: 1, name: "Moje sloty" })).toBeVisible();
    await expect(page.getByText(`Twoje godziny w ośrodku ${STABLE_NAME}, od dziś.`, { exact: false })).toBeVisible();
    await expect(page.getByRole("banner").getByText("Instruktor", { exact: true })).toBeVisible();
  });

  await test.step("slot o 11:00 pokazuje zajęte miejsca i zapisaną jeźdźczynię bez konia", async () => {
    const slot = hourSection(page, 11);
    await expect(slot).toHaveCount(1);
    await expect(slot.getByText("zajęte 1 z 1", { exact: true })).toBeVisible();
    const rider = slot.getByRole("listitem").filter({ hasText: "Anna Kowalska" });
    await expect(rider.getByText("bez konia", { exact: true })).toBeVisible();
  });

  await test.step("wolny slot jest na liście bez zapisanych", async () => {
    const slot = hourSection(page, 10);
    await expect(slot.getByText("zajęte 0 z 1", { exact: true })).toBeVisible();
    await expect(slot.getByText("Nikt jeszcze się nie zapisał.", { exact: true })).toBeVisible();
  });

  await test.step("wejście do przestrzeni ośrodka przenosi do „Moje sloty”", async () => {
    await page.goto("/osrodek/zapisy");
    await page.waitForURL("**/instruktor");
    await expect(page.getByRole("heading", { level: 1, name: "Moje sloty" })).toBeVisible();

    await page.goto("/osrodek/nowa-stadnina");
    await page.waitForURL("**/instruktor");
  });
});
