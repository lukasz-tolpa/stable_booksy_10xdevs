import { expect, test, type Page } from "@playwright/test";
import { RIDER_A_STATE, openStable, runSql, seedDay, signUpOwnerWithStable, slotItem, waitForIslands } from "./helpers";

/**
 * Place ośrodka (#113, spec #112): właściciel zakłada plac, zmienia nazwę, dezaktywuje i aktywuje
 * plac (pierwsze pokrycie strony „Place”), dodaje konie (pierwsze pokrycie dodawania konia), układa
 * dzień z dwoma placami — plac dla całego instruktora i poprawka jednej godziny — a jeździec widzi
 * plac przy slocie.
 *
 * Świeży właściciel per uruchomienie: nowy ośrodek dostaje od bazy jeden plac „Plac”, a place nie
 * gromadzą się w ośrodku z seeda (placu się nie usuwa). Dzień scenariusza to dzień seeda
 * (`seedDay`), więc jeździec otwiera go przez `openStable`.
 */

const HOURS = [10, 11];

/** Id placu ośrodka — wartość pozycji listy „Plac”. */
function placeId(stable: string, name: string): string {
  return runSql(
    `select p.id from public.places p join public.stables s on s.id = p.stable_id
     where s.name = '${stable}' and p.name = '${name}';`,
    "odczytać placu",
    ["-At"],
  ).trim();
}

function activePlaces(page: Page) {
  return page.getByRole("list", { name: "Aktywne place" });
}

function inactivePlaces(page: Page) {
  return page.getByRole("list", { name: "Nieaktywne place" });
}

async function addPlace(page: Page, name: string): Promise<void> {
  await waitForIslands(page);
  await page.getByLabel("Nazwa placu").fill(name);
  await page.getByRole("button", { name: "Dodaj plac" }).click();
  await page.waitForURL(/\/osrodek\/place(\?|$)/);
}

async function addHorse(page: Page, name: string): Promise<void> {
  await waitForIslands(page);
  await page.getByLabel("Imię konia").fill(name);
  await page.getByRole("button", { name: "Dodaj konia" }).click();
  await page.waitForURL("**/osrodek/konie");
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
}

test("właściciel zakłada drugi plac, układa dzień z dwoma placami, a jeździec widzi plac przy slocie", async ({
  page,
  browser,
}) => {
  const stamp = String(Date.now());
  const owner = `Właściciel Placów ${stamp}`;
  const stableName = `Ośrodek ${owner}`;
  const day = seedDay();

  await test.step("nowy ośrodek ma jeden plac „Plac”, którego nie da się dezaktywować", async () => {
    await signUpOwnerWithStable(page, owner, `e2e-place-owner-${stamp}@example.com`);
    await page
      .getByRole("link", { name: /^Place/ })
      .filter({ visible: true })
      .click();
    await page.waitForURL("**/osrodek/place");

    await expect(page.getByRole("heading", { level: 1, name: "Place" })).toBeVisible();
    await expect(activePlaces(page).getByRole("listitem")).toHaveCount(1);
    await expect(activePlaces(page).getByRole("heading", { name: "Plac", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Dezaktywuj/ })).toHaveCount(0);
  });

  await test.step("właściciel dodaje „Duży plac”, a powtórzona nazwa dostaje odmowę", async () => {
    await addPlace(page, "Duży plac");
    await expect(activePlaces(page).getByRole("heading", { name: "Duży plac", exact: true })).toBeVisible();

    await addPlace(page, "  duży PLAC ");
    await expect(page.getByRole("alert")).toContainText("Masz już plac o tej nazwie");
    await expect(activePlaces(page).getByRole("listitem")).toHaveCount(2);
  });

  await test.step("zmiana nazwy „Plac” na „Hala”", async () => {
    const card = activePlaces(page)
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "Plac", exact: true }) });
    await card.getByText("Zmień nazwę", { exact: true }).click();
    await card.getByLabel("Nowa nazwa — Plac", { exact: true }).fill("Hala");
    await card.getByRole("button", { name: "Zapisz nazwę" }).click();
    await page.waitForURL("**/osrodek/place");

    await expect(activePlaces(page).getByRole("heading", { name: "Hala", exact: true })).toBeVisible();
    await expect(activePlaces(page).getByRole("heading", { name: "Plac", exact: true })).toHaveCount(0);
  });

  await test.step("„Lonżownik” po dezaktywacji jest wśród nieaktywnych, po aktywacji wraca", async () => {
    await addPlace(page, "Lonżownik");
    await page.getByRole("button", { name: "Dezaktywuj — Lonżownik" }).click();
    await page.waitForURL("**/osrodek/place");
    await expect(inactivePlaces(page).getByRole("heading", { name: "Lonżownik", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Aktywuj — Lonżownik" }).click();
    await page.waitForURL("**/osrodek/place");
    await expect(activePlaces(page).getByRole("heading", { name: "Lonżownik", exact: true })).toBeVisible();

    // Zostaje nieaktywny: grafik nowego dnia go nie proponuje.
    await page.getByRole("button", { name: "Dezaktywuj — Lonżownik" }).click();
    await page.waitForURL("**/osrodek/place");
    await expect(inactivePlaces(page).getByRole("listitem")).toHaveCount(1);
  });

  await test.step("właściciel dodaje dwa konie", async () => {
    await page.goto("/osrodek/konie");
    await addHorse(page, "Bella");
    await addHorse(page, "Kasztan");
  });

  await test.step("grafik dnia: Hala dla całego instruktora, o 11:00 Duży plac", async () => {
    await page.goto(`/osrodek/grafik?dzien=${day}`);
    await waitForIslands(page);
    await page.getByLabel("Od", { exact: true }).selectOption("10");
    await page.getByLabel("Do", { exact: true }).selectOption("12");
    await page.getByRole("checkbox", { name: "Bella" }).check();
    await page.getByRole("checkbox", { name: "Kasztan" }).check();
    await page.getByRole("checkbox", { name: owner }).check();

    const columnPlace = page.getByLabel(`Plac — ${owner}`, { exact: true });
    await expect(columnPlace.getByRole("option")).toHaveText(["Hala", "Duży plac"]);
    await columnPlace.selectOption({ label: "Hala" });
    await page.getByLabel(`Plac — ${owner}, 11:00`, { exact: true }).selectOption({ label: "Duży plac" });
    for (const hour of HOURS) {
      await page.getByLabel(`${owner}, ${String(hour)}:00`, { exact: true }).fill("1");
    }
    const saved = page.waitForResponse(
      (response) => response.url().endsWith("/api/schedule/save") && response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Zapisz grafik" }).click();
    await saved;
    await page.waitForLoadState();
    expect(new URL(page.url()).searchParams.get("error"), "zapis grafiku odrzucony").toBeNull();

    // Trwałość: po przeładowaniu formularz pokazuje zapisany plac każdego slotu.
    await page.reload();
    await waitForIslands(page);
    await expect(page.getByLabel(`Plac — ${owner}, 10:00`, { exact: true })).toHaveValue(placeId(stableName, "Hala"));
    await expect(page.getByLabel(`Plac — ${owner}, 11:00`, { exact: true })).toHaveValue(
      placeId(stableName, "Duży plac"),
    );
  });

  await test.step("jeździec widzi plac przy każdym slocie", async () => {
    const riderContext = await browser.newContext({ storageState: RIDER_A_STATE });
    try {
      const rider = await riderContext.newPage();
      await openStable(rider, stableName);

      await expect(slotItem(rider, 10, owner).getByText("Hala", { exact: true })).toBeVisible();
      await expect(slotItem(rider, 11, owner).getByText("Duży plac", { exact: true })).toBeVisible();
    } finally {
      await riderContext.close();
    }
  });
});
