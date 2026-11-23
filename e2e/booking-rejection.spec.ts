import { expect, test } from "@playwright/test";
import {
  PENDING_BOOKINGS_ROUTE,
  RIDER_B_NAME,
  RIDER_B_STATE,
  STABLE_NAME,
  STABLE_STATE,
  asError,
  bookButton,
  openStable,
  pendingBookingRow,
  slotItem,
  upcomingRow,
} from "./helpers";

/**
 * Spec #122, AC #125: ośrodek odrzuca zapis oczekujący z powodem, który jeździec widzi. Wyrocznia: po odrzuceniu
 * zapisu nie ma na „Zapisach do przyjęcia”, jeździec widzi w „Moich zapisach” „Odrzucony: <powód>” (bez „Odwołaj”),
 * przy slocie znów ma „Zapisz się”, zapisuje się ponownie, a ośrodek widzi przy nowym zapisie, że wcześniej
 * odrzucił mu zapis na ten slot. Dowodem są strony wyrenderowane z bazy po przekierowaniu, nie baner sukcesu.
 *
 * Slot: Joanna Wrona o 13:00 w Stadninie Pod Dębem, dzień seeda — 1 miejsce, wolne w seedzie; inny niż Joanna@14
 * scenariusza odmowy i Joanna@15 scenariusza przyjęcia. Zapis odrzucony zostaje w bazie (stan końcowy) — nie
 * zajmuje miejsca i nie blokuje godziny.
 *
 * Sprzątanie: B odwołuje swój zapis oczekujący (ponowny albo pierwszy, gdy scenariusz padł przed odrzuceniem),
 * jeśli jakiś ma; błąd sprzątania nigdy nie przykrywa błędu scenariusza.
 */
test.use({ storageState: RIDER_B_STATE });

const INSTRUCTOR = "Joanna Wrona";
const HOUR = 13;
const REASON = "Na tę godzinę Joanna prowadzi jazdę dla zaawansowanych — wybierz proszę 10:00.";

test("ośrodek odrzuca zapis z powodem, jeździec go widzi i może zapisać się ponownie", async ({ page, browser }) => {
  const stableContext = await browser.newContext({ storageState: STABLE_STATE });
  const stablePage = await stableContext.newPage();
  const state = { booked: false };
  let failure: Error | undefined;

  try {
    const stable = await openStable(page, STABLE_NAME);

    await test.step("jeździec zapisuje się — zapis czeka na przyjęcie", async () => {
      await bookButton(page, HOUR, INSTRUCTOR).click();
      await page.waitForURL(/sukces=1/);
      state.booked = true;
      await expect(slotItem(page, HOUR, INSTRUCTOR).getByText("Czekasz na przyjęcie", { exact: true })).toBeVisible();
    });

    await test.step("ośrodek odrzuca zapis z powodem — zapisu nie ma już na „Zapisach do przyjęcia”", async () => {
      await stablePage.goto(PENDING_BOOKINGS_ROUTE);
      const row = pendingBookingRow(stablePage, HOUR, INSTRUCTOR, RIDER_B_NAME);
      await expect(row.getByText("wcześniej odrzucony na ten slot", { exact: true })).toHaveCount(0);
      await row.getByText("Odrzuć", { exact: true }).click();
      await row.getByLabel(`Powód odrzucenia — ${RIDER_B_NAME}`).fill(REASON);
      await row.getByRole("button", { name: "Potwierdź odrzucenie", exact: true }).click();
      await stablePage.waitForURL(/sukces=odrzucenie/);
      await expect(stablePage.getByText("Zapis odrzucony.", { exact: false })).toBeVisible();
      await expect(pendingBookingRow(stablePage, HOUR, INSTRUCTOR, RIDER_B_NAME)).toHaveCount(0);
    });

    await test.step("jeździec widzi w Moich zapisach „Odrzucony: <powód>” bez odwołania", async () => {
      await page.goto("/jezdziec/zapisy");
      const row = page
        .getByRole("listitem")
        .filter({ has: page.getByText(`Odrzucony: ${REASON}`, { exact: true }) })
        .filter({ hasText: STABLE_NAME })
        .filter({ hasText: INSTRUCTOR });
      await expect(row).toContainText(`${String(HOUR)}:00`);
      await expect(row.getByRole("button", { name: "Odwołaj" })).toHaveCount(0);
      await expect(upcomingRow(page, STABLE_NAME, INSTRUCTOR)).toHaveCount(0);
    });

    await test.step("jeździec zapisuje się na ten sam slot ponownie", async () => {
      await page.goto(`${stable.path}?dzien=${stable.day}`);
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("1 z 1 wolne");
      await bookButton(page, HOUR, INSTRUCTOR).click();
      await page.waitForURL(/sukces=1/);
      await expect(slotItem(page, HOUR, INSTRUCTOR).getByText("Czekasz na przyjęcie", { exact: true })).toBeVisible();
    });

    await test.step("ośrodek widzi przy nowym zapisie, że wcześniej odrzucił go na ten slot", async () => {
      await stablePage.goto(PENDING_BOOKINGS_ROUTE);
      const row = pendingBookingRow(stablePage, HOUR, INSTRUCTOR, RIDER_B_NAME);
      await expect(row.getByText("wcześniej odrzucony na ten slot", { exact: true })).toBeVisible();
    });
  } catch (error: unknown) {
    failure = asError(error);
  }

  if (state.booked) {
    try {
      // Zapis oczekujący (pierwszy, gdy scenariusz padł przed odrzuceniem, albo ponowny) ma „Odwołaj”.
      await page.goto("/jezdziec/zapisy");
      const pending = upcomingRow(page, STABLE_NAME, INSTRUCTOR);
      if ((await pending.count()) > 0) {
        await pending.getByRole("button", { name: "Odwołaj" }).click();
        await page.waitForURL(/sukces=1/);
        await expect(page.getByText("Zapis został odwołany.")).toBeVisible();
      }
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
