import { expect, test, type Page } from "@playwright/test";
import { INSTRUCTOR_EMAIL, PASSWORD, STABLE_STATE, asError, seedDay, waitForIslands } from "./helpers";

/**
 * Uprawnienie do układania grafiku (#78, US 1–6): właściciel Stadniny Pod Dębem włącza i wyłącza
 * Joannie Wronie przełącznik „Układa grafik” na stronie Instruktorzy. Właściciel i instruktor bez
 * konta przełącznika nie mają. Dezaktywacja odbiera uprawnienie, ponowna aktywacja go nie
 * przywraca; przełącznik ze starej strony po dezaktywacji dostaje polską odmowę (SB024).
 *
 * Sprzątanie przywraca stan seeda (Joanna aktywna, bez uprawnienia) także po błędzie: aktywuje ją,
 * gdy mogła zostać nieaktywna, i wyłącza przełącznik, gdy mógł zostać włączony. Błąd sprzątania
 * nigdy nie przykrywa błędu scenariusza. Przerwany przebieg — naprawa: `npx supabase db reset`.
 *
 * Drugi scenariusz (#79, US 7–9, 14, 15): z uprawnieniem Joanna dostaje zakładkę „Grafik”, zmienia
 * w niej swój limit o 15:00 w dniu seeda (1 → 2; suma 2 = liczba koni) i zapisuje; właściciel
 * widzi zmianę w swoim grafiku. Właściciel odbiera uprawnienie przy otwartym formularzu Joanny —
 * jej zapis kończy się odmową w „Moje sloty”, a zakładka znika. Sprzątanie przywraca limit 1
 * (formularzem właściciela) i wyłącza przełącznik, gdy mogły zostać zmienione.
 */
const INSTRUCTORS = "/osrodek/instruktorzy";
const OWNER_SCHEDULE = "/osrodek/grafik";
const INSTRUCTOR_SCHEDULE = "/instruktor/grafik";
const SEATS_HOUR = 15;
const PERMISSION_LOST = "Nie masz już uprawnienia do układania grafiku";
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

/** Pasek zakładek przestrzeni instruktora — jest tylko u instruktora z uprawnieniem. */
function instructorTabs(page: Page) {
  return page.getByRole("navigation", { name: "Przestrzeń instruktora", exact: true });
}

function seatsInput(page: Page) {
  return page.getByLabel(`${INSTRUCTOR}, ${String(SEATS_HOUR)}:00`, { exact: true });
}

/** Ustawia limit Joanny o 15:00 w otwartym formularzu dnia seeda i zapisuje go. */
async function saveSeats(page: Page, seats: number): Promise<void> {
  await waitForIslands(page);
  await seatsInput(page).fill(String(seats));
  await page.getByRole("button", { name: "Zapisz grafik" }).click();
}

/** Formularzem właściciela: limit Joanny o 15:00 w dniu seeda, sprawdzony po przeładowaniu. */
async function ownerSetsSeats(page: Page, seats: number): Promise<void> {
  await page.goto(`${OWNER_SCHEDULE}?dzien=${seedDay()}`);
  await saveSeats(page, seats);
  await expect(page).toHaveURL((url) => url.pathname === OWNER_SCHEDULE && !url.searchParams.has("error"));
  await page.reload();
  await expect(seatsInput(page)).toHaveValue(String(seats));
}

async function signInAsInstructor(page: Page): Promise<void> {
  await page.goto("/auth/signin");
  await waitForIslands(page);
  await page.getByLabel("Adres e-mail").fill(INSTRUCTOR_EMAIL);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL("**/instruktor");
}

test.use({ storageState: STABLE_STATE });

test("instruktorka z uprawnieniem układa grafik w zakładce „Grafik”, po odebraniu zakładka znika", async ({
  page,
  browser,
}) => {
  const state = { mayBeGranted: false, seatsChanged: false };
  let failure: Error | undefined;
  const instructorContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const joanna = await instructorContext.newPage();
  const scheduleOfSeedDay = `${INSTRUCTOR_SCHEDULE}?dzien=${seedDay()}`;

  try {
    await test.step("bez uprawnienia Joanna nie ma zakładki „Grafik”, a jej adres przenosi do „Moje sloty”", async () => {
      await signInAsInstructor(joanna);
      await expect(instructorTabs(joanna)).toHaveCount(0);
      await joanna.goto(INSTRUCTOR_SCHEDULE);
      await expect(joanna).toHaveURL((url) => url.pathname === "/instruktor");
    });

    await test.step("właściciel nadaje uprawnienie, Joanna widzi zakładkę „Grafik” obok „Moje sloty”", async () => {
      await page.goto(INSTRUCTORS);
      state.mayBeGranted = true;
      await clickSwitch(page);
      await expect(permissionSwitch(page)).toHaveAttribute("aria-checked", "true");

      await joanna.goto("/instruktor");
      await expect(instructorTabs(joanna).getByRole("link", { name: "Moje sloty", exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await instructorTabs(joanna).getByRole("link", { name: "Grafik", exact: true }).click();
      await expect(joanna).toHaveURL((url) => url.pathname === INSTRUCTOR_SCHEDULE);
      await expect(joanna.getByRole("heading", { level: 1, name: "Grafik dnia" })).toBeVisible();
    });

    await test.step("Joanna zmienia limit w grafiku dnia i zapisuje, właściciel widzi zmianę", async () => {
      await joanna.goto(scheduleOfSeedDay);
      await expect(seatsInput(joanna)).toHaveValue("1");
      state.seatsChanged = true;
      await saveSeats(joanna, 2);
      await expect(joanna).toHaveURL((url) => url.pathname === INSTRUCTOR_SCHEDULE && !url.searchParams.has("error"));

      await joanna.reload();
      await expect(seatsInput(joanna)).toHaveValue("2");

      await page.goto(`${OWNER_SCHEDULE}?dzien=${seedDay()}`);
      await expect(seatsInput(page)).toHaveValue("2");
    });

    await test.step("właściciel odbiera uprawnienie przy otwartym formularzu — zapis Joanny dostaje odmowę", async () => {
      await joanna.goto(scheduleOfSeedDay);
      await waitForIslands(joanna);

      await page.goto(INSTRUCTORS);
      await clickSwitch(page);
      await expect(permissionSwitch(page)).toHaveAttribute("aria-checked", "false");
      state.mayBeGranted = false;

      await saveSeats(joanna, 1);
      await expect(joanna).toHaveURL((url) => url.pathname === "/instruktor" && url.searchParams.has("error"));
      await expect(joanna.getByRole("alert")).toHaveText(PERMISSION_LOST);
    });

    await test.step("zakładka „Grafik” znika, a jej adres przenosi do „Moje sloty”", async () => {
      await joanna.goto("/instruktor");
      await expect(joanna.getByRole("heading", { level: 1, name: "Moje sloty" })).toBeVisible();
      await expect(instructorTabs(joanna)).toHaveCount(0);
      await joanna.goto(INSTRUCTOR_SCHEDULE);
      await expect(joanna).toHaveURL((url) => url.pathname === "/instruktor");
    });

    await test.step("odmówiony zapis niczego nie zmienił; właściciel przywraca limit", async () => {
      await page.goto(`${OWNER_SCHEDULE}?dzien=${seedDay()}`);
      await expect(seatsInput(page)).toHaveValue("2");
      await ownerSetsSeats(page, 1);
      state.seatsChanged = false;
    });
  } catch (error) {
    failure = asError(error);
  } finally {
    await instructorContext.close().catch((closeError: unknown) => {
      failure ??= asError(closeError);
    });
    if (state.mayBeGranted || state.seatsChanged) {
      const cleanupContext = await browser.newContext({ storageState: STABLE_STATE });
      const cleanup = await cleanupContext.newPage();
      try {
        if (state.seatsChanged) {
          await ownerSetsSeats(cleanup, 1);
        }
        if (state.mayBeGranted) {
          await cleanup.goto(INSTRUCTORS);
          if ((await permissionSwitch(cleanup).getAttribute("aria-checked")) === "true") {
            await clickSwitch(cleanup);
          }
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
