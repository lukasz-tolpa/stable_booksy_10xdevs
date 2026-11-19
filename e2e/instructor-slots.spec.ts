import { expect, test } from "@playwright/test";
import { INSTRUCTOR_EMAIL, STABLE_NAME, hourSection, signIn } from "./helpers";

/**
 * „Moje sloty” (#72): instruktorka z kontem z seeda, która nie jest właścicielką, loguje się
 * tym samym formularzem co wszyscy, trafia do swoich slotów i widzi zapisaną jeźdźczynię.
 * Wejście pod adres przestrzeni ośrodka przenosi ją z powrotem. Tylko odczyt — scenariusz
 * niczego nie zmienia (Anna u Joanny o 11 to zapis z seeda).
 */
test("instruktorka z kontem widzi swoje sloty z zapisanymi i nie wchodzi do przestrzeni ośrodka", async ({ page }) => {
  await test.step("logowanie tym samym formularzem prowadzi do „Moje sloty”", async () => {
    await signIn(page, INSTRUCTOR_EMAIL, "/instruktor");
    await expect(page.getByRole("heading", { level: 1, name: "Moje sloty" })).toBeVisible();
    await expect(
      page.getByText(
        `Twoje godziny w ośrodku ${STABLE_NAME}, od dziś. Odśwież stronę, żeby zobaczyć najnowsze zapisy i odwołania.`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByRole("banner").getByText("Instruktor", { exact: true })).toBeVisible();
  });

  await test.step("slot o 11:00 pokazuje zajęte miejsca i zapisaną jeźdźczynię bez konia", async () => {
    const slot = hourSection(page, 11);
    await expect(slot).toHaveCount(1);
    await expect(slot.getByText("zajęte 1 z 1", { exact: true })).toBeVisible();
    const rider = slot.getByRole("listitem").filter({ hasText: "Anna Kowalska" });
    // `.first()`: pigułka przy jeźdźcu; ten sam tekst ma opcja przydziału konia (#81).
    await expect(rider.getByText("bez konia", { exact: true }).first()).toBeVisible();
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
