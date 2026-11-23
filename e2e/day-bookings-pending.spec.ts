import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  RIDER_B_NAME,
  RIDER_B_STATE,
  STABLE_NAME,
  STABLE_STATE,
  asError,
  bookButton,
  dayBookingRow,
  openStable,
  slotItem,
  upcomingRow,
} from "./helpers";

/**
 * Spec #122, AC #128: ośrodek przyjmuje zapis oczekujący z zapisów dnia, przy jego slocie. Wyrocznia: po zapisie
 * jeźdźca licznik „Zapisy do przyjęcia” w panelu rośnie o jeden, a na zapisach dnia zapis stoi w wyróżnionej
 * części „Czekają na przyjęcie” przy swoim slocie (godzina, instruktor, wolne miejsca, liczba czekających);
 * po „Przyjmij” strona wraca na ten sam dzień, zapis jest wśród aktywnych, licznik wraca do stanu sprzed zapisu,
 * a jeździec ma „Twój zapis”. Dowodem są strony wyrenderowane z bazy, nie baner sukcesu. Liczba czekających jest
 * porównywana względnie — historia demo ma własne zapisy oczekujące.
 *
 * Slot: Joanna Wrona o 12:00 w Stadninie Pod Dębem, dzień seeda — 1 miejsce, wolne w seedzie; inny niż sloty
 * pozostałych scenariuszy zapisu (test-plan §6.3; ten sam slot ma skrypt współbieżności `test:db`, który nigdy
 * nie dzieli bazy z e2e bez resetu).
 *
 * Sprzątanie: B odwołuje swój zapis (oczekujący albo aktywny), jeśli go założył; błąd sprzątania nigdy nie
 * przykrywa błędu scenariusza.
 */
test.use({ storageState: RIDER_B_STATE });

const INSTRUCTOR = "Joanna Wrona";
const HOUR = 12;

/** Licznik zapisów do przyjęcia z bocznej kolumny panelu („nikt nie czeka” — 0). */
async function panelPendingCount(stablePage: Page): Promise<number> {
  await stablePage.goto("/osrodek");
  const link = stablePage
    .getByRole("complementary", { name: "Ośrodek" })
    .getByRole("link")
    .filter({ hasText: "Zapisy do przyjęcia" });
  const text = (await link.innerText()).replace("Zapisy do przyjęcia", "");
  if (text.includes("nikt nie czeka")) {
    return 0;
  }
  const match = /(\d+)\s+czek/.exec(text);
  if (!match) {
    throw new Error(`Brak licznika przy „Zapisy do przyjęcia” w panelu: ${text}`);
  }
  return Number(match[1]);
}

/** Slot w części „Czekają na przyjęcie” zapisów dnia. */
function pendingSlot(stablePage: Page): Locator {
  return stablePage
    .getByRole("region", { name: "Czekają na przyjęcie", exact: true })
    .getByRole("listitem")
    .filter({ has: stablePage.getByText(`${String(HOUR)}:00`, { exact: true }) })
    .filter({ hasText: INSTRUCTOR });
}

test("ośrodek przyjmuje zapis oczekujący z zapisów dnia, przy jego slocie", async ({ page, browser }) => {
  const stableContext = await browser.newContext({ storageState: STABLE_STATE });
  const stablePage = await stableContext.newPage();
  const state = { booked: false };
  let failure: Error | undefined;

  try {
    const stable = await openStable(page, STABLE_NAME);
    const before = await panelPendingCount(stablePage);

    await test.step("jeździec zapisuje się — licznik zapisów do przyjęcia w panelu rośnie o jeden", async () => {
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("1 z 1 wolne");
      await bookButton(page, HOUR, INSTRUCTOR).click();
      await page.waitForURL(/sukces=1/);
      state.booked = true;

      expect(await panelPendingCount(stablePage)).toBe(before + 1);
    });

    await test.step("na zapisach dnia zapis czeka przy swoim slocie, nie wśród aktywnych", async () => {
      await stablePage.goto(`/osrodek/zapisy?dzien=${stable.day}`);
      const slot = pendingSlot(stablePage);
      await expect(slot).toContainText("1 z 1 wolne");
      await expect(slot).toContainText("1 czeka");
      await expect(slot).toContainText(RIDER_B_NAME);
      await expect(dayBookingRow(stablePage, "Aktywne", HOUR, INSTRUCTOR)).toHaveCount(0);
    });

    await test.step("„Przyjmij” przy slocie — zapis aktywny, strona zostaje na tym dniu", async () => {
      await pendingSlot(stablePage)
        .getByRole("listitem")
        .filter({ hasText: RIDER_B_NAME })
        .getByRole("button", { name: "Przyjmij", exact: true })
        .click();
      await stablePage.waitForURL(new RegExp(`dzien=${stable.day}.*sukces=przyjecie`));

      await stablePage.reload();
      await expect(pendingSlot(stablePage)).toHaveCount(0);
      await expect(dayBookingRow(stablePage, "Aktywne", HOUR, INSTRUCTOR)).toContainText(RIDER_B_NAME);
      expect(await panelPendingCount(stablePage)).toBe(before);

      await page.goto(`${stable.path}?dzien=${stable.day}`);
      const slot = slotItem(page, HOUR, INSTRUCTOR);
      await expect(slot.getByText("Twój zapis", { exact: true })).toBeVisible();
      await expect(slot).toContainText("0 z 1 wolne");
    });
  } catch (error: unknown) {
    failure = asError(error);
  }

  if (state.booked) {
    try {
      await page.goto("/jezdziec/zapisy");
      await upcomingRow(page, STABLE_NAME, INSTRUCTOR).getByRole("button", { name: "Odwołaj" }).click();
      await page.waitForURL(/sukces=1/);
      await expect(page.getByText("Zapis został odwołany.")).toBeVisible();
    } catch (cleanupError: unknown) {
      test.info().annotations.push({ type: "cleanup-failed", description: String(cleanupError) });
      failure ??= asError(cleanupError);
    }
  }

  await stableContext.close();

  if (failure !== undefined) {
    throw failure;
  }
});
