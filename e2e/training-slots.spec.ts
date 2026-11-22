import { expect, test, type Page } from "@playwright/test";
import {
  RIDER_A_STATE,
  STABLE_NAME,
  STABLE_STATE,
  bookButton,
  dayBookingRow,
  runSql,
  seedDay,
  signIn,
  slotItem,
  waitForIslands,
} from "./helpers";

/**
 * Slot treningowy (#115, spec #112): właściciel układa dzień z jednym slotem treningowym (rodzaj dla całego
 * instruktora w nagłówku kolumny); pensjonariuszka z seeda (Katarzyna Zając, koń pensjonatowy Hrabia) widzi
 * go i zapisuje się na swoim koniu; jeździec rekreacyjny dnia z samymi slotami treningowymi nie widzi; zapisy
 * dnia ośrodka pokazują rodzaj slotu i konia pensjonariuszki.
 *
 * Dzień scenariusza leży trzy tygodnie po dniu seeda — żaden inny scenariusz go nie układa. Superuser usuwa
 * jego zapisy i grafik przed i po scenariuszu, więc seed zostaje jak był — także po przerwanym biegu.
 */
test.use({ storageState: STABLE_STATE });

const OWNER = "Marek Dębowski";
const BOARDER_EMAIL = "katarzyna.zajac@example.com";
const OTHER_INSTRUCTORS = ["Joanna Wrona", "Karol Jasny"];
const DAY = seedDay(new Date(Date.now() + 21 * 24 * 60 * 60 * 1000));

function removeScenarioDay(): void {
  runSql(
    `delete from public.bookings b using public.schedule_days sd, public.stables s
     where sd.id = b.schedule_day_id and s.id = sd.stable_id and s.name = '${STABLE_NAME}' and sd.day = '${DAY}';
     delete from public.schedule_days sd using public.stables s
     where s.id = sd.stable_id and s.name = '${STABLE_NAME}' and sd.day = '${DAY}';`,
    "usunąć dnia scenariusza slotu treningowego",
  );
}

/** Strona ośrodka z seeda w dniu scenariusza — z katalogu przez filtr, potem jawnie na dzień. */
async function openScenarioDay(page: Page): Promise<void> {
  await page.goto("/jezdziec");
  await page.getByLabel("Szukaj ośrodka").fill(STABLE_NAME);
  await page.getByRole("button", { name: "Szukaj" }).click();
  await page.getByRole("link", { name: STABLE_NAME }).click();
  await expect(page.getByRole("heading", { level: 1, name: STABLE_NAME })).toBeVisible();
  await page.goto(`${new URL(page.url()).pathname}?dzien=${DAY}`);
  await expect(page.getByLabel("Wybierz dzień")).toHaveValue(DAY);
}

test.beforeAll(removeScenarioDay);
test.afterAll(removeScenarioDay);

test("właściciel układa slot treningowy, pensjonariuszka zapisuje się na swoim koniu, jeździec rekreacyjny go nie widzi", async ({
  page,
  browser,
}) => {
  await test.step("grafik dnia: slot treningowy właściciela o 10:00", async () => {
    await page.goto(`/osrodek/grafik?dzien=${DAY}`);
    await waitForIslands(page);
    await page.getByLabel("Od", { exact: true }).selectOption("10");
    await page.getByLabel("Do", { exact: true }).selectOption("11");
    for (const instructor of OTHER_INSTRUCTORS) {
      await page.getByRole("checkbox", { name: instructor }).uncheck();
    }
    await page.getByRole("checkbox", { name: OWNER }).check();

    const columnKind = page.getByLabel(`Rodzaj — ${OWNER}`, { exact: true });
    await expect(columnKind.getByRole("option")).toHaveText(["rekreacyjny", "treningowy"]);
    await columnKind.selectOption({ label: "treningowy" });
    await page.getByLabel(`${OWNER}, 10:00`, { exact: true }).fill("2");

    const saved = page.waitForResponse(
      (response) => response.url().endsWith("/api/schedule/save") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Zapisz grafik" }).click();
    await saved;
    await page.waitForLoadState();
    expect(new URL(page.url()).searchParams.get("error"), "zapis grafiku odrzucony").toBeNull();

    // Trwałość: po przeładowaniu komórka pokazuje zapisany rodzaj slotu.
    await page.reload();
    await waitForIslands(page);
    await expect(page.getByLabel(`Rodzaj — ${OWNER}, 10:00`, { exact: true }).locator("option:checked")).toHaveText(
      "treningowy",
    );
  });

  await test.step("pensjonariuszka widzi slot treningowy i zapisuje się na Hrabi", async () => {
    const boarderContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const boarder = await boarderContext.newPage();
      await signIn(boarder, BOARDER_EMAIL, "/jezdziec");
      await openScenarioDay(boarder);

      const slot = slotItem(boarder, 10, OWNER);
      await expect(slot.getByText("slot treningowy", { exact: true })).toBeVisible();
      await expect(slot.getByText("na koniu Hrabia", { exact: true })).toBeVisible();
      await bookButton(boarder, 10, OWNER).click();
      await boarder.waitForURL(/sukces=1/);

      await expect(boarder.getByText("Zapisano na jazdę.", { exact: false })).toBeVisible();
      await expect(slotItem(boarder, 10, OWNER).getByText("Twój zapis", { exact: true })).toBeVisible();
    } finally {
      await boarderContext.close();
    }
  });

  await test.step("jeździec rekreacyjny nie widzi dnia z samymi slotami treningowymi", async () => {
    const riderContext = await browser.newContext({ storageState: RIDER_A_STATE });
    try {
      const rider = await riderContext.newPage();
      await openScenarioDay(rider);

      await expect(rider.getByText("Ośrodek nie ułożył grafiku na ten dzień.", { exact: true })).toBeVisible();
      await expect(rider.getByText(OWNER)).toHaveCount(0);
    } finally {
      await riderContext.close();
    }
  });

  await test.step("zapisy dnia ośrodka pokazują rodzaj slotu i konia pensjonariuszki", async () => {
    await page.goto(`/osrodek/zapisy?dzien=${DAY}`);
    const row = dayBookingRow(page, "Aktywne", 10, OWNER);
    await expect(row.getByText("slot treningowy", { exact: true })).toBeVisible();
    await expect(row.getByText("Katarzyna Zając", { exact: true })).toBeVisible();
    // Koń przydzielony przy zapisie; do wyboru przy slocie treningowym są tylko konie pensjonariuszki.
    const horse = row.getByLabel("Koń", { exact: true });
    await expect(horse.locator("option:checked")).toHaveText("Hrabia");
    await expect(horse.getByRole("option")).toHaveText(["bez konia", "Hrabia"]);
  });
});
