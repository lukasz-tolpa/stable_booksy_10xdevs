import { expect, test, type Page } from "@playwright/test";
import { INSTRUCTOR_EMAIL, PASSWORD, STABLE_STATE, asError, hourSection, waitForIslands } from "./helpers";

/**
 * Dezaktywacja instruktora z kontem (#73, US 13, 14, 30): właściciel z seeda dezaktywuje
 * Joannę Wronę na stronie Instruktorzy; Joanna po zalogowaniu widzi ekran nieaktywnego konta
 * z każdej trasy chronionej i może się z niego wylogować. Ponowna aktywacja przywraca jej
 * „Moje sloty” bez nowego zaproszenia.
 *
 * Sprzątanie: właściciel aktywuje Joannę z powrotem tylko wtedy, gdy na pewno ją zdezaktywował
 * (`deactivated`), a błąd samego sprzątania nigdy nie przykrywa błędu scenariusza. Przerwany
 * przebieg zostawia Joannę nieaktywną — `instructor-slots.spec.ts` idzie wtedy na czerwono,
 * naprawa: `npx supabase db reset`.
 */
const INSTRUCTOR = "Joanna Wrona";
const INACTIVE_HEADING = "Konto nieaktywne";
// Przekierowania sprawdza `toHaveURL` (limit asercji), nie `waitForURL` (limit całego testu):
// przy złym przekierowaniu scenariusz pada od razu z adresem w komunikacie, a `finally` zdąży
// aktywować Joannę z powrotem.
const INACTIVE_URL = /\/instruktor\/konto-nieaktywne$/;
const MY_SLOTS_URL = /\/instruktor$/;

function instructorCard(page: Page) {
  return page.getByRole("article").filter({ has: page.getByRole("heading", { name: INSTRUCTOR, exact: true }) });
}

async function signInAsInstructor(page: Page): Promise<void> {
  await page.goto("/auth/signin");
  await waitForIslands(page);
  await page.getByLabel("Adres e-mail").fill(INSTRUCTOR_EMAIL);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

async function setActive(owner: Page, active: boolean): Promise<void> {
  await owner.goto("/osrodek/instruktorzy");
  await instructorCard(owner)
    .getByRole("button", { name: active ? "Aktywuj" : "Dezaktywuj", exact: true })
    .click();
  await owner.waitForURL("**/osrodek/instruktorzy");
  await expect(
    instructorCard(owner).getByRole("button", { name: active ? "Dezaktywuj" : "Aktywuj", exact: true }),
  ).toBeVisible();
}

test("zdezaktywowany instruktor widzi ekran nieaktywnego konta, a ponowna aktywacja przywraca mu sloty", async ({
  page,
  browser,
}) => {
  const ownerContext = await browser.newContext({ storageState: STABLE_STATE });
  const owner = await ownerContext.newPage();
  // Obiekt, nie `let`: przypisanie wewnątrz callbacka `test.step` jest niewidoczne dla analizy
  // przepływu TS, która zwęziłaby zmienną do `false`.
  const state = { deactivated: false };
  let failure: Error | undefined;

  try {
    await test.step("właściciel dezaktywuje instruktorkę z kontem", async () => {
      await setActive(owner, false);
      state.deactivated = true;
      await expect(instructorCard(owner).getByText("Z kontem", { exact: true })).toBeVisible();
    });

    await test.step("po zalogowaniu instruktorka trafia na ekran nieaktywnego konta", async () => {
      await signInAsInstructor(page);
      await expect(page).toHaveURL(INACTIVE_URL);
      await expect(page.getByRole("heading", { level: 1, name: INACTIVE_HEADING })).toBeVisible();
      await expect(page.getByRole("banner").getByText("Instruktor", { exact: true })).toBeVisible();
    });

    await test.step("każda trasa chroniona prowadzi na ten sam ekran", async () => {
      for (const path of ["/instruktor", "/osrodek", "/osrodek/zapisy", "/osrodek/nowa-stadnina", "/dashboard"]) {
        await page.goto(path);
        await expect(page).toHaveURL(INACTIVE_URL);
        await expect(page.getByRole("heading", { level: 1, name: INACTIVE_HEADING })).toBeVisible();
      }
    });

    await test.step("„Wyloguj się” na karcie kończy sesję", async () => {
      await page.getByRole("main").getByRole("button", { name: "Wyloguj się", exact: true }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/");
      await expect(page.getByRole("banner").getByRole("link", { name: "Zaloguj się" })).toBeVisible();

      await page.goto("/instruktor/konto-nieaktywne");
      await expect(page).toHaveURL(/\/auth\/signin$/);
    });

    await test.step("ponowna aktywacja przywraca „Moje sloty” bez nowego zaproszenia", async () => {
      await setActive(owner, true);
      state.deactivated = false;

      await signInAsInstructor(page);
      await expect(page).toHaveURL(MY_SLOTS_URL);
      await expect(page.getByRole("heading", { level: 1, name: "Moje sloty" })).toBeVisible();
      await expect(hourSection(page, 11).getByText("zajęte 1 z 1", { exact: true })).toBeVisible();

      await page.goto("/instruktor/konto-nieaktywne");
      await expect(page).toHaveURL(MY_SLOTS_URL);
    });
  } catch (error) {
    failure = asError(error);
  } finally {
    if (state.deactivated) {
      try {
        await setActive(owner, true);
      } catch (cleanupError) {
        failure ??= asError(cleanupError);
      }
    }
    await ownerContext.close().catch((closeError: unknown) => {
      failure ??= asError(closeError);
    });
  }

  if (failure) {
    throw failure;
  }
});
