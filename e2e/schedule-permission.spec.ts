import { expect, test, type Page } from "@playwright/test";
import { STABLE_STATE, asError } from "./helpers";

/**
 * Uprawnienie do układania grafiku (#78, US 1–6): właściciel Stadniny Pod Dębem włącza i wyłącza
 * Joannie Wronie przełącznik „Układa grafik” na stronie Instruktorzy. Właściciel i instruktor bez
 * konta przełącznika nie mają. Dezaktywacja odbiera uprawnienie, ponowna aktywacja go nie
 * przywraca; przełącznik ze starej strony po dezaktywacji dostaje polską odmowę (SB024).
 *
 * Sprzątanie przywraca stan seeda (Joanna aktywna, bez uprawnienia) także po błędzie: aktywuje ją,
 * gdy mogła zostać nieaktywna, i wyłącza przełącznik, gdy mógł zostać włączony. Błąd sprzątania
 * nigdy nie przykrywa błędu scenariusza. Przerwany przebieg — naprawa: `npx supabase db reset`.
 */
const INSTRUCTORS = "/osrodek/instruktorzy";
const INSTRUCTOR = "Joanna Wrona";
const OWNER = "Marek Dębowski";
const WITHOUT_ACCOUNT = "Karol Jasny";
const INACTIVE_REFUSAL =
  "Ten instruktor jest nieaktywny — dezaktywacja odebrała mu uprawnienie do układania grafiku. Aktywuj go, żeby nadać je ponownie.";

function instructorCard(page: Page, name: string) {
  return page.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });
}

function permissionSwitch(page: Page, name: string = INSTRUCTOR) {
  return instructorCard(page, name).getByRole("switch", { name: `Układa grafik — ${name}`, exact: true });
}

async function clickSwitch(page: Page): Promise<void> {
  await permissionSwitch(page).click();
  await expect(page).toHaveURL((url) => url.pathname === INSTRUCTORS);
}

async function setActive(page: Page, active: boolean): Promise<void> {
  await page.goto(INSTRUCTORS);
  await instructorCard(page, INSTRUCTOR)
    .getByRole("button", { name: active ? "Aktywuj" : "Dezaktywuj", exact: true })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === INSTRUCTORS && url.search === "");
  await expect(
    instructorCard(page, INSTRUCTOR).getByRole("button", { name: active ? "Dezaktywuj" : "Aktywuj", exact: true }),
  ).toBeVisible();
}

test.use({ storageState: STABLE_STATE });

test("właściciel nadaje i odbiera uprawnienie do układania grafiku, dezaktywacja je odbiera", async ({
  page,
  browser,
}) => {
  // Obiekt, nie `let`: przypisanie w callbacku `test.step` jest niewidoczne dla zawężania typów.
  const state = { mayBeGranted: false, mayBeInactive: false };
  let failure: Error | undefined;

  try {
    await test.step("przełącznik ma tylko aktywny instruktor z kontem, który nie jest właścicielem", async () => {
      await page.goto(INSTRUCTORS);
      await expect(permissionSwitch(page)).toHaveAttribute("aria-checked", "false");
      await expect(instructorCard(page, OWNER).getByRole("switch")).toHaveCount(0);
      await expect(instructorCard(page, WITHOUT_ACCOUNT).getByRole("switch")).toHaveCount(0);
    });

    await test.step("właściciel włącza „Układa grafik” i stan widać na liście", async () => {
      state.mayBeGranted = true;
      await clickSwitch(page);
      await expect(permissionSwitch(page)).toHaveAttribute("aria-checked", "true");

      await page.reload();
      await expect(permissionSwitch(page)).toHaveAttribute("aria-checked", "true");
    });

    await test.step("właściciel wyłącza przełącznik", async () => {
      await clickSwitch(page);
      await expect(permissionSwitch(page)).toHaveAttribute("aria-checked", "false");
      state.mayBeGranted = false;
    });

    await test.step("dezaktywacja odbiera uprawnienie, ponowna aktywacja go nie przywraca", async () => {
      state.mayBeGranted = true;
      await clickSwitch(page);
      await expect(permissionSwitch(page)).toHaveAttribute("aria-checked", "true");

      state.mayBeInactive = true;
      await setActive(page, false);
      await expect(instructorCard(page, INSTRUCTOR).getByRole("switch")).toHaveCount(0);

      await setActive(page, true);
      state.mayBeInactive = false;
      await expect(permissionSwitch(page)).toHaveAttribute("aria-checked", "false");
      state.mayBeGranted = false;
    });

    await test.step("przełącznik ze starej strony po dezaktywacji dostaje odmowę po polsku", async () => {
      await page.goto(INSTRUCTORS);
      await expect(permissionSwitch(page)).toHaveAttribute("aria-checked", "false");

      const other = await page.context().newPage();
      state.mayBeInactive = true;
      await setActive(other, false);
      await other.close();

      await permissionSwitch(page).click();
      await expect(page).toHaveURL((url) => url.pathname === INSTRUCTORS && url.searchParams.has("error"));
      await expect(page.getByRole("alert")).toHaveText(INACTIVE_REFUSAL);

      await setActive(page, true);
      state.mayBeInactive = false;
      await expect(permissionSwitch(page)).toHaveAttribute("aria-checked", "false");
    });
  } catch (error) {
    failure = asError(error);
  } finally {
    if (state.mayBeInactive || state.mayBeGranted) {
      const cleanupContext = await browser.newContext({ storageState: STABLE_STATE });
      const cleanup = await cleanupContext.newPage();
      try {
        await cleanup.goto(INSTRUCTORS);
        if (
          state.mayBeInactive &&
          (await instructorCard(cleanup, INSTRUCTOR).getByRole("button", { name: "Aktywuj", exact: true }).count()) > 0
        ) {
          await setActive(cleanup, true);
        }
        if ((await permissionSwitch(cleanup).getAttribute("aria-checked")) === "true") {
          await clickSwitch(cleanup);
        }
      } catch (cleanupError) {
        failure ??= asError(cleanupError);
      } finally {
        await cleanupContext.close().catch((closeError: unknown) => {
          failure ??= asError(closeError);
        });
      }
    }
  }

  if (failure) {
    throw failure;
  }
});
