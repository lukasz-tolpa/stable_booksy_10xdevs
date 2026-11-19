import { expect, test, type Page } from "@playwright/test";
import { INSTRUCTOR_EMAIL, STABLE_NAME, asError, hourSection, signIn, upcomingRow } from "./helpers";

/**
 * Przydział konia przez instruktora (#81, US 18, 19, 25): Joanna Wrona w „Moje sloty” daje
 * Kasztana Annie Kowalskiej (zapis z seeda o 11:00), a Anna widzi go przy swoim zapisie.
 *
 * Sprzątanie: Joanna zdejmuje konia („bez konia”) tylko wtedy, gdy na pewno go przydzieliła
 * (`assigned`), a błąd sprzątania nie przykrywa błędu scenariusza. Przerwany przebieg zostawia
 * Annie konia — `instructor-slots.spec.ts` idzie wtedy na czerwono, naprawa: `npx supabase db reset`.
 */
const RIDER_EMAIL = "anna.kowalska@example.com";
const RIDER = "Anna Kowalska";
const INSTRUCTOR = "Joanna Wrona";
const HORSE = "Kasztan";
const HOUR = 11;

function riderItem(page: Page) {
  return hourSection(page, HOUR).getByRole("listitem").filter({ hasText: RIDER });
}

async function assignHorse(page: Page, horse: string): Promise<void> {
  await page.goto("/instruktor");
  const rider = riderItem(page);
  await rider.getByLabel(`Koń — ${RIDER}`, { exact: true }).selectOption({ label: horse });
  await rider.getByRole("button", { name: "Zapisz konia", exact: true }).click();
  await page.waitForURL(/sukces=przydzial/);
}

test("instruktorka przydziela konia w „Moje sloty”, a jeźdźczyni widzi go przy swoim zapisie", async ({
  page,
  browser,
}) => {
  const state = { assigned: false };
  let failure: Error | undefined;
  const riderContext = await browser.newContext();
  const riderPage = await riderContext.newPage();

  try {
    await test.step("przy zapisie są konie pracujące tego dnia i „bez konia”", async () => {
      await signIn(page, INSTRUCTOR_EMAIL, "/instruktor");
      const select = riderItem(page).getByLabel(`Koń — ${RIDER}`, { exact: true });
      await expect(select).toHaveValue("");
      await expect(select.getByRole("option")).toHaveText(["bez konia", "Bella", "Kasztan"]);
    });

    await test.step("instruktorka przydziela Kasztana i widzi go przy zapisie po przeładowaniu", async () => {
      await assignHorse(page, HORSE);
      state.assigned = true;
      await expect(page.getByText("Przydział konia zapisany.", { exact: true })).toBeVisible();

      await page.reload();
      const rider = riderItem(page);
      await expect(rider.getByText(HORSE, { exact: true }).first()).toBeVisible();
      await expect(rider.getByLabel(`Koń — ${RIDER}`, { exact: true })).not.toHaveValue("");
    });

    await test.step("jeźdźczyni widzi konia przy swoim zapisie", async () => {
      await signIn(riderPage, RIDER_EMAIL, "/jezdziec");
      await riderPage.goto("/jezdziec/zapisy");
      const row = upcomingRow(riderPage, STABLE_NAME, INSTRUCTOR);
      await expect(row).toContainText(HORSE);
      await expect(row).not.toContainText("Koń zostanie przydzielony");
    });
  } catch (error) {
    failure = asError(error);
  } finally {
    if (state.assigned) {
      try {
        await assignHorse(page, "bez konia");
        await expect(riderItem(page).getByLabel(`Koń — ${RIDER}`, { exact: true })).toHaveValue("");
      } catch (cleanupError) {
        failure ??= asError(cleanupError);
      }
    }
    await riderContext.close().catch((closeError: unknown) => {
      failure ??= asError(closeError);
    });
  }

  if (failure) {
    throw failure;
  }
});
