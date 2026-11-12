import { expect, test, type Page } from "@playwright/test";
import {
  RIDER_A_NAME,
  RIDER_A_STATE,
  STABLE_NAME,
  STABLE_STATE,
  asError,
  assertSlotsRendered,
  bookButton,
  cancelledRow,
  hourSection,
  openStable,
  seedDay,
  slotItem,
  upcomingRow,
  waitForIslands,
} from "./helpers";

/**
 * Ryzyko #6 (pętla jeźdźca przestaje działać w przeglądarce) i połowa #3 (sukces
 * bez zapisu w bazie), w modelu „zapis na miejsce u instruktora" (ADR-0002, #41).
 * Wyrocznia: ośrodek wystawia miejsce w grafiku, jeździec zapisuje się na nie bez
 * wyboru konia, zapis pojawia się na liście dnia ośrodka jako „bez konia", a odwołanie
 * zwalnia miejsce. Dowodem trwałości jest plakietka „Twój zapis", wiersz w „Moje
 * zapisy" i lista dnia ośrodka — nigdy baner sukcesu ani samo przekierowanie.
 *
 * Slot: Karol Jasny o 13:00 w Stadninie Pod Debem, dzień seeda. Karol nie pracuje
 * w seedzie — dodaje go ośrodek przez formularz grafiku z 1 miejscem o 13:00 (suma
 * limitów o 13: Joanna 1 + Karol 1 = 2 konie dnia). Inny niż Joanna@11 Anny, Joanna@14
 * scenariusza odmowy i Joanna@12 skryptu współbieżności.
 *
 * Sprzątanie: jeśli scenariusz padnie między zapisem a odwołaniem, zapis zostaje
 * odwołany, a Karol wraca poza grafik dnia, żeby powtórka (retry w CI) i następne
 * uruchomienie zaczynały od stanu seeda; błąd sprzątania nigdy nie przykrywa błędu
 * scenariusza.
 */
test.use({ storageState: RIDER_A_STATE });

const INSTRUCTOR = "Karol Jasny";
const OTHER_INSTRUCTOR = "Joanna Wrona";
const HOUR = 13;

/** Ośrodek ustawia, czy Karol pracuje w dniu seeda (z 1 miejscem o 13:00), i zapisuje grafik. */
async function setInstructorWorking(stablePage: Page, working: boolean): Promise<void> {
  const day = seedDay();
  await stablePage.goto(`/osrodek/grafik?dzien=${day}`);
  await waitForIslands(stablePage);
  await stablePage.getByRole("checkbox", { name: INSTRUCTOR, exact: true }).setChecked(working);
  if (working) {
    await stablePage.getByLabel(`${INSTRUCTOR}, ${String(HOUR)}:00`, { exact: true }).fill("1");
  }
  const saved = stablePage.waitForResponse(
    (response) => response.url().endsWith("/api/schedule/save") && response.request().method() === "POST",
  );
  await stablePage.getByRole("button", { name: "Zapisz grafik" }).click();
  await saved;
  await stablePage.waitForLoadState();
  expect(new URL(stablePage.url()).searchParams.get("error"), "zapis grafiku odrzucony").toBeNull();

  // Dowód z bazy, nie ze stanu formularza: po przeładowaniu wartości idą z grafiku.
  await stablePage.reload();
  await waitForIslands(stablePage);
  const checkbox = stablePage.getByRole("checkbox", { name: INSTRUCTOR, exact: true });
  if (working) {
    await expect(checkbox).toBeChecked();
    await expect(stablePage.getByLabel(`${INSTRUCTOR}, ${String(HOUR)}:00`, { exact: true })).toHaveValue("1");
  } else {
    await expect(checkbox).not.toBeChecked();
  }
}

test("jeździec przechodzi pełną pętlę: grafik ośrodka → slot instruktora → zapis → lista ośrodka → Moje zapisy → odwołanie", async ({
  page,
  browser,
}) => {
  const stableContext = await browser.newContext({ storageState: STABLE_STATE });
  const stablePage = await stableContext.newPage();
  // Obiekt, nie `let`: przypisania wewnątrz callbacków `test.step` są niewidoczne
  // dla analizy przepływu TS.
  const state = { booked: false, instructorAdded: false };
  let failure: Error | undefined;

  try {
    await test.step("ośrodek wystawia miejsce u Karola o 13:00", async () => {
      state.instructorAdded = true;
      await setInstructorWorking(stablePage, true);
    });

    const stable = await openStable(page, STABLE_NAME);

    await test.step("lista slotów zgadza się z grafikiem ośrodka", async () => {
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("1 z 1 wolne");
      await expect(bookButton(page, HOUR, INSTRUCTOR)).toBeVisible();
      await expect(bookButton(page, HOUR, OTHER_INSTRUCTOR)).toBeVisible();
      // Granica [10, 16): 16:00 nie istnieje, 9:00 nie istnieje.
      await expect(hourSection(page, 16)).toHaveCount(0);
      await expect(page.getByText("9:00", { exact: true })).toHaveCount(0);
      // Karol ma miejsce wyłącznie o 13:00.
      await expect(slotItem(page, 12, INSTRUCTOR)).toHaveCount(0);
      // Joanna o 11 ma jedyne miejsce zajęte przez Annę z seeda — cudzy zapis zajmuje miejsce.
      await expect(slotItem(page, 11, OTHER_INSTRUCTOR)).toContainText("0 z 1 wolne");
      await expect(bookButton(page, 11, OTHER_INSTRUCTOR)).toHaveCount(0);
    });

    await test.step("zapis u Karola o 13:00 zostaje oznaczony jako mój, bez wyboru konia", async () => {
      await bookButton(page, HOUR, INSTRUCTOR).click();
      await page.waitForURL(/sukces=1/);
      await expect(page.getByText("Zapisano na jazdę.")).toBeVisible();
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("Twój zapis");
      state.booked = true;
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("0 z 1 wolne");
      await expect(bookButton(page, HOUR, INSTRUCTOR)).toHaveCount(0);
      // Jedna godzina — jeden zapis: u Joanny o 13 nie da się już zapisać.
      await expect(bookButton(page, HOUR, OTHER_INSTRUCTOR)).toHaveCount(0);
      await expect(slotItem(page, HOUR, OTHER_INSTRUCTOR)).toContainText("Masz już zapis o tej godzinie");
    });

    await test.step("zapis pojawia się na liście dnia ośrodka, jeszcze bez konia", async () => {
      await stablePage.goto(`/osrodek/zapisy?dzien=${stable.day}`);
      await expect(stablePage.getByRole("heading", { level: 1, name: "Zapisy dnia" })).toBeVisible();
      const row = hourSection(stablePage, HOUR).filter({ hasText: INSTRUCTOR });
      await expect(row).toBeVisible();
      // FR-005: rejestracja wymaga imienia, więc ośrodek widzi jeźdźca, a nie zapas
      // dla profilu bez imienia. To imię podał setup przy zakładaniu konta A.
      await expect(row).toContainText(RIDER_A_NAME);
      await expect(row).toContainText("bez konia");
    });

    await test.step("zapis jest w Moich zapisach i daje się odwołać", async () => {
      await page.goto("/jezdziec/zapisy");
      await expect(page.getByRole("heading", { level: 2, name: "Nadchodzące" })).toBeVisible();
      const row = upcomingRow(page, STABLE_NAME, INSTRUCTOR);
      await expect(row).toContainText(`${String(HOUR)}:00`);
      await expect(row).toContainText("Koń zostanie przydzielony");
      await row.getByRole("button", { name: "Odwołaj" }).click();
      await page.waitForURL(/sukces=1/);
      await expect(page.getByText("Zapis został odwołany.")).toBeVisible();
      state.booked = false;
      await expect(page.getByText("Nie masz nadchodzących zapisów.")).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Minione i odwołane" })).toBeVisible();
      // `first()`: powtórka bez `db reset` zostawia w historii wcześniejsze odwołania.
      await expect(cancelledRow(page, STABLE_NAME, INSTRUCTOR).first()).toContainText("przez Ciebie");
    });

    await test.step("odwołanie znika z listy ośrodka i zwalnia miejsce", async () => {
      await stablePage.reload();
      await expect(hourSection(stablePage, HOUR).filter({ hasText: INSTRUCTOR })).toHaveCount(0);

      await page.goto(`${stable.path}?dzien=${stable.day}`);
      await assertSlotsRendered(page);
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("1 z 1 wolne");
      await expect(bookButton(page, HOUR, INSTRUCTOR)).toBeVisible();
      await expect(bookButton(page, HOUR, OTHER_INSTRUCTOR)).toBeVisible();
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

  if (state.instructorAdded) {
    try {
      await setInstructorWorking(stablePage, false);
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
