import { expect, test } from "@playwright/test";
import {
  INSTRUCTOR_EMAIL,
  INSTRUCTOR_PENDING_BOOKINGS_ROUTE,
  RIDER_B_NAME,
  RIDER_B_STATE,
  STABLE_NAME,
  acceptPendingBooking,
  asError,
  bookButton,
  openStable,
  pendingBookingRow,
  signIn,
  slotItem,
  upcomingRow,
} from "./helpers";

/**
 * Spec #122, AC #126: instruktor z kontem przyjmuje zapis oczekujący na swój slot. Wyrocznia: Joanna Wrona
 * (instruktorka z kontem, nie właścicielka) ma w swoich zakładkach „Zapisy do przyjęcia”, widzi tam zapis jeźdźca
 * na swój slot z „Przyjmij” i „Odrzuć”, przyjmuje go — wiersz znika, a jeździec ma „Twój zapis” i zajęte miejsce.
 * Dowodem są strony wyrenderowane z bazy po przeładowaniu, nie baner sukcesu. Że zapisów na cudze sloty
 * instruktor nie widzi ani o nich nie decyduje, dowodzi baza (supabase/tests/instructor_booking_decisions.sql).
 *
 * Slot: Joanna Wrona o 10:00 w Stadninie Pod Dębem, dzień seeda — 1 miejsce, wolne w seedzie; inny niż Joanna@13
 * (odrzucenie, pętla jeźdźca u Karola), Joanna@14 (odmowa) i Joanna@15 (przyjęcie przez ośrodek).
 *
 * Sprzątanie: B odwołuje swój zapis (oczekujący albo aktywny), jeśli go założył; błąd sprzątania nigdy nie
 * przykrywa błędu scenariusza.
 */
test.use({ storageState: RIDER_B_STATE });

const INSTRUCTOR = "Joanna Wrona";
const HOUR = 10;

test("instruktorka z kontem przyjmuje zapis oczekujący na swój slot", async ({ page, browser }) => {
  const instructorContext = await browser.newContext();
  const instructorPage = await instructorContext.newPage();
  const state = { booked: false };
  let failure: Error | undefined;

  try {
    const stable = await openStable(page, STABLE_NAME);

    await test.step("jeździec zapisuje się na slot instruktorki — zapis czeka na przyjęcie", async () => {
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("1 z 1 wolne");
      await bookButton(page, HOUR, INSTRUCTOR).click();
      await page.waitForURL(/sukces=1/);
      state.booked = true;
      await page.reload();
      await expect(slotItem(page, HOUR, INSTRUCTOR).getByText("Czekasz na przyjęcie", { exact: true })).toBeVisible();
    });

    await test.step("instruktorka ma „Zapisy do przyjęcia” w zakładkach, z „Przyjmij” i „Odrzuć”", async () => {
      await signIn(instructorPage, INSTRUCTOR_EMAIL, "/instruktor");
      await instructorPage
        .getByRole("navigation", { name: "Przestrzeń instruktora" })
        .getByRole("link", { name: "Zapisy do przyjęcia" })
        .click();
      await instructorPage.waitForURL(`**${INSTRUCTOR_PENDING_BOOKINGS_ROUTE}`);
      await expect(instructorPage.getByRole("heading", { level: 1, name: "Zapisy do przyjęcia" })).toBeVisible();

      const row = pendingBookingRow(instructorPage, HOUR, INSTRUCTOR, RIDER_B_NAME);
      await expect(row).toBeVisible();
      await expect(row).toContainText("1 z 1 wolne");
      await expect(row.getByRole("button", { name: "Przyjmij", exact: true })).toBeVisible();
      await expect(row.getByText("Odrzuć", { exact: true })).toBeVisible();
    });

    await test.step("instruktorka przyjmuje zapis — jeździec ma aktywny zapis i zajęte miejsce", async () => {
      await acceptPendingBooking(
        instructorPage,
        { hour: HOUR, instructor: INSTRUCTOR, rider: RIDER_B_NAME },
        INSTRUCTOR_PENDING_BOOKINGS_ROUTE,
      );
      await expect(instructorPage).toHaveURL(/\/instruktor\/zapisy-do-przyjecia\?sukces=przyjecie$/);

      await page.goto("/jezdziec/zapisy");
      const row = upcomingRow(page, STABLE_NAME, INSTRUCTOR);
      await expect(row).toContainText(`${String(HOUR)}:00`);
      await expect(row.getByText("Czeka na przyjęcie", { exact: true })).toHaveCount(0);

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

  await instructorContext.close();

  if (failure !== undefined) {
    throw failure;
  }
});
