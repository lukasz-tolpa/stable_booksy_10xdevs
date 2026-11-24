import { expect, test, type Page } from "@playwright/test";
import {
  PENDING_BOOKINGS_ROUTE,
  RIDER_B_NAME,
  RIDER_B_STATE,
  STABLE_NAME,
  STABLE_STATE,
  acceptPendingBooking,
  asError,
  bookButton,
  openStable,
  upcomingRow,
} from "./helpers";

/**
 * Spec #122, AC #129: powiadomienia w aplikacji. Wyrocznia: jeździec się zapisuje → dzwonek ośrodka pokazuje
 * 1 nieprzeczytane, a na „Powiadomieniach” na górze stoi „Nowy zapis czeka na przyjęcie” z jeźdźcem, które
 * prowadzi do „Zapisów do przyjęcia”; otwarcie strony zeruje dzwonek → ośrodek przyjmuje → dzwonek jeźdźca
 * pokazuje 1, a jego „Powiadomienia” mają „Ośrodek przyjął Twój zapis” z ośrodkiem, prowadzące do „Moich zapisów”.
 * Liczby są dokładne, bo obie strony otwierają „Powiadomienia” na starcie (data ostatniego otwarcia = teraz),
 * a scenariusze idą po kolei (jeden worker).
 *
 * Slot: Joanna Wrona o 15:00 w Stadninie Pod Dębem, dzień seeda — ten sam co scenariusz przyjęcia, który po sobie
 * sprząta (zapis odwołany nie blokuje godziny).
 *
 * Sprzątanie: B odwołuje swój zapis (oczekujący albo aktywny), jeśli go założył; błąd sprzątania nigdy nie
 * przykrywa błędu scenariusza.
 */
test.use({ storageState: RIDER_B_STATE });

const INSTRUCTOR = "Joanna Wrona";
const HOUR = 15;
const NOTIFICATIONS_ROUTE = "/powiadomienia";

function bell(page: Page) {
  return page.getByRole("link", { name: /^Powiadomienia/ });
}

/** Otwarcie „Powiadomień” — wszystko, co było, staje się przeczytane; dzwonek bez liczby. */
async function openNotifications(page: Page) {
  await page.goto(NOTIFICATIONS_ROUTE);
  await expect(page.getByRole("heading", { level: 1, name: "Powiadomienia" })).toBeVisible();
  await expect(bell(page)).toHaveAccessibleName("Powiadomienia");
}

function newestNotification(page: Page) {
  return page.getByRole("list", { name: "Powiadomienia", exact: true }).getByRole("listitem").first();
}

test("zapis i przyjęcie zapisu powiadamiają ośrodek i jeźdźca", async ({ page, browser }) => {
  const stableContext = await browser.newContext({ storageState: STABLE_STATE });
  const stablePage = await stableContext.newPage();
  const state = { booked: false };
  let failure: Error | undefined;

  try {
    await openNotifications(page);
    await openNotifications(stablePage);

    await test.step("jeździec się zapisuje — ośrodek ma nieprzeczytane powiadomienie", async () => {
      await openStable(page, STABLE_NAME);
      await bookButton(page, HOUR, INSTRUCTOR).click();
      await page.waitForURL(/sukces=1/);
      state.booked = true;

      await stablePage.goto("/osrodek");
      await expect(bell(stablePage)).toHaveAccessibleName("Powiadomienia (1 nieprzeczytane)");
      await expect(bell(stablePage)).toContainText("1");
    });

    await test.step("„Powiadomienia” ośrodka: nowy zapis na górze, prowadzi do „Zapisów do przyjęcia”", async () => {
      await stablePage.goto(NOTIFICATIONS_ROUTE);
      const item = newestNotification(stablePage);
      await expect(item).toContainText("Nowy zapis czeka na przyjęcie");
      await expect(item).toContainText(RIDER_B_NAME);
      await expect(item).toContainText(`${String(HOUR)}:00`);
      await expect(item).toContainText(INSTRUCTOR);
      await expect(item.getByText("nowe", { exact: true })).toBeVisible();
      // Otwarcie strony oznacza wszystko jako przeczytane — dzwonek na tej samej stronie już bez liczby.
      await expect(bell(stablePage)).toHaveAccessibleName("Powiadomienia");

      await item.getByRole("link").click();
      await stablePage.waitForURL(new RegExp(`${PENDING_BOOKINGS_ROUTE}$`));
    });

    await test.step("ośrodek przyjmuje zapis — jeździec ma nieprzeczytane powiadomienie o przyjęciu", async () => {
      await acceptPendingBooking(stablePage, { hour: HOUR, instructor: INSTRUCTOR, rider: RIDER_B_NAME });

      await page.goto("/jezdziec");
      await expect(bell(page)).toHaveAccessibleName("Powiadomienia (1 nieprzeczytane)");

      await page.goto(NOTIFICATIONS_ROUTE);
      const item = newestNotification(page);
      await expect(item).toContainText("Ośrodek przyjął Twój zapis");
      await expect(item).toContainText(STABLE_NAME);
      await expect(item).toContainText(`${String(HOUR)}:00`);
      await expect(item.getByText("nowe", { exact: true })).toBeVisible();

      await item.getByRole("link").click();
      await page.waitForURL(/\/jezdziec\/zapisy$/);
      await expect(upcomingRow(page, STABLE_NAME, INSTRUCTOR)).toContainText(`${String(HOUR)}:00`);
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
