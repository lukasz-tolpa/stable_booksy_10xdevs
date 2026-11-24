import { expect, test } from "@playwright/test";
import {
  PENDING_BOOKINGS_ROUTE,
  RIDER_B_NAME,
  RIDER_B_STATE,
  STABLE_NAME,
  STABLE_STATE,
  acceptPendingBooking,
  asError,
  bookButton,
  dayBookingRow,
  openStable,
  pendingBookingRow,
  slotItem,
  upcomingRow,
} from "./helpers";

/**
 * Spec #122, AC #124: zapis jeźdźca czeka na przyjęcie przez ośrodek. Wyrocznia: po zapisie jeździec widzi
 * „Czekasz na przyjęcie” przy slocie i „Czeka na przyjęcie” w „Moich zapisach”, miejsce w slocie jest nadal wolne
 * (zapis oczekujący go nie zajmuje, ADR 0006), ośrodek widzi zapis na „Zapisach do przyjęcia” i go przyjmuje —
 * dopiero wtedy jeździec ma „Twój zapis”, miejsce jest zajęte, a zapis stoi wśród aktywnych na liście dnia.
 * Dowodem są strony wyrenderowane z bazy po przeładowaniu, nie baner sukcesu.
 *
 * Slot: Joanna Wrona o 15:00 w Stadninie Pod Dębem, dzień seeda — 1 miejsce, wolne w seedzie; inny niż Karol@13
 * pętli jeźdźca i Joanna@14 scenariusza odmowy (scenariusze idą po kolei, jeden worker).
 *
 * Sprzątanie: B odwołuje swój zapis (oczekujący albo aktywny), jeśli go założył; błąd sprzątania nigdy nie
 * przykrywa błędu scenariusza.
 */
test.use({ storageState: RIDER_B_STATE });

const INSTRUCTOR = "Joanna Wrona";
const HOUR = 15;

test("zapis jeźdźca czeka na przyjęcie, a po przyjęciu przez ośrodek jest aktywny", async ({ page, browser }) => {
  const stableContext = await browser.newContext({ storageState: STABLE_STATE });
  const stablePage = await stableContext.newPage();
  const state = { booked: false };
  let failure: Error | undefined;

  try {
    const stable = await openStable(page, STABLE_NAME);

    await test.step("jeździec zapisuje się — zapis czeka na przyjęcie i nie zajmuje miejsca", async () => {
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("1 z 1 wolne");
      await bookButton(page, HOUR, INSTRUCTOR).click();
      await page.waitForURL(/sukces=1/);
      state.booked = true;
      await expect(
        page.getByText(
          "Zapisano na jazdę. Zapis czeka na przyjęcie przez ośrodek — Twój slot jest oznaczony poniżej.",
          { exact: true },
        ),
      ).toBeVisible();

      await page.reload();
      const slot = slotItem(page, HOUR, INSTRUCTOR);
      await expect(slot.getByText("Czekasz na przyjęcie", { exact: true })).toBeVisible();
      await expect(slot).toContainText("1 z 1 wolne");
      await expect(bookButton(page, HOUR, INSTRUCTOR)).toHaveCount(0);
    });

    await test.step("w Moich zapisach zapis ma stan „Czeka na przyjęcie” i daje się odwołać", async () => {
      await page.goto("/jezdziec/zapisy");
      const row = upcomingRow(page, STABLE_NAME, INSTRUCTOR);
      await expect(row).toContainText(`${String(HOUR)}:00`);
      await expect(row.getByText("Czeka na przyjęcie", { exact: true })).toBeVisible();
    });

    await test.step("ośrodek widzi zapis na „Zapisach do przyjęcia”, ale jeszcze nie wśród aktywnych", async () => {
      await stablePage.goto(`/osrodek/zapisy?dzien=${stable.day}`);
      await expect(dayBookingRow(stablePage, "Aktywne", HOUR, INSTRUCTOR)).toHaveCount(0);

      await stablePage.goto(PENDING_BOOKINGS_ROUTE);
      const row = pendingBookingRow(stablePage, HOUR, INSTRUCTOR, RIDER_B_NAME);
      await expect(row).toBeVisible();
      await expect(row).toContainText("1 z 1 wolne");
      await expect(row.getByRole("button", { name: "Przyjmij", exact: true })).toBeVisible();
    });

    await test.step("ośrodek przyjmuje zapis — jeździec ma aktywny zapis i zajęte miejsce", async () => {
      await acceptPendingBooking(stablePage, { hour: HOUR, instructor: INSTRUCTOR, rider: RIDER_B_NAME });

      await page.reload();
      const row = upcomingRow(page, STABLE_NAME, INSTRUCTOR);
      await expect(row).toContainText(`${String(HOUR)}:00`);
      await expect(row.getByText("Czeka na przyjęcie", { exact: true })).toHaveCount(0);

      await page.goto(`${stable.path}?dzien=${stable.day}`);
      const slot = slotItem(page, HOUR, INSTRUCTOR);
      await expect(slot.getByText("Twój zapis", { exact: true })).toBeVisible();
      await expect(slot).toContainText("0 z 1 wolne");

      await stablePage.goto(`/osrodek/zapisy?dzien=${stable.day}`);
      await expect(dayBookingRow(stablePage, "Aktywne", HOUR, INSTRUCTOR)).toContainText(RIDER_B_NAME);
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
