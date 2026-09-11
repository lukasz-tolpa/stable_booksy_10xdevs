import { expect, test } from "@playwright/test";
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
  upcomingRow,
} from "./helpers";

/**
 * Ryzyko #6 (pętla jeźdźca przestaje działać w przeglądarce) i połowa #3 (sukces
 * bez zapisu w bazie). Wyrocznią jest PRD: zapis „pojawia się w grafiku ośrodka,
 * a slot konia jest zajęty", a odwołanie zwalnia slot. Dowodem trwałości jest
 * plakietka „Twój zapis", wiersz w „Moje zapisy" i lista dnia ośrodka — nigdy
 * baner sukcesu ani samo przekierowanie.
 *
 * Slot: Kasztan o 13:00 w Stadninie Pod Debem, jutro — wolny w seedzie, inny niż
 * Bella@11 Anny i niż Kasztan@12, na którym pracuje skrypt współbieżności.
 *
 * Sprzątanie: jeśli scenariusz padnie między zapisem a odwołaniem, zapis zostaje
 * odwołany, żeby powtórka (retry w CI) i następne uruchomienie nie padały na
 * „slot wolny"; błąd sprzątania nigdy nie przykrywa błędu scenariusza.
 */
test.use({ storageState: RIDER_A_STATE });

const HORSE = "Kasztan";
const HOUR = 13;

test("jeździec przechodzi pełną pętlę: katalog → slot → zapis → lista ośrodka → Moje zapisy → odwołanie", async ({
  page,
  browser,
}) => {
  const stableContext = await browser.newContext({ storageState: STABLE_STATE });
  const stablePage = await stableContext.newPage();
  // Obiekt, nie `let`: przypisania wewnątrz callbacków `test.step` są niewidoczne
  // dla analizy przepływu TS.
  const state = { booked: false };
  let failure: Error | undefined;

  try {
    const stable = await openStable(page, STABLE_NAME);

    await test.step("lista slotów zgadza się z regułą PRD dla seeda", async () => {
      await expect(bookButton(page, HOUR, HORSE)).toBeVisible();
      // Granica [10, 16): 16:00 nie istnieje, 9:00 nie istnieje.
      await expect(hourSection(page, 16)).toHaveCount(0);
      await expect(page.getByText("9:00", { exact: true })).toHaveCount(0);
      // Iskra nie jest przydzielona do jutra — nigdzie nie ma jej przycisku.
      await expect(page.getByRole("button", { name: "Iskra", exact: true })).toHaveCount(0);
      // Bella o 11 jest zajęta przez Annę z seeda — cudzy zapis nie jest renderowany.
      await expect(hourSection(page, 11).getByRole("button", { name: "Bella", exact: true })).toHaveCount(0);
    });

    await test.step("zapis na Kasztana o 13:00 zostaje oznaczony jako mój", async () => {
      await bookButton(page, HOUR, HORSE).click();
      await page.waitForURL(/sukces=1/);
      await expect(page.getByText("Zapisano na jazdę.")).toBeVisible();
      await expect(hourSection(page, HOUR).getByText(`${HORSE} — Twój zapis`)).toBeVisible();
      state.booked = true;
      await expect(bookButton(page, HOUR, HORSE)).toHaveCount(0);
    });

    await test.step("zapis pojawia się na liście dnia ośrodka", async () => {
      await stablePage.goto(`/osrodek/zapisy?dzien=${stable.day}`);
      await expect(stablePage.getByRole("heading", { level: 1, name: "Zapisy dnia" })).toBeVisible();
      const row = hourSection(stablePage, HOUR).filter({ hasText: HORSE });
      await expect(row).toBeVisible();
      // FR-005: rejestracja wymaga imienia, więc ośrodek widzi jeźdźca, a nie zapas
      // dla profilu bez imienia. To imię podał setup przy zakładaniu konta A.
      await expect(row).toContainText(RIDER_A_NAME);
    });

    await test.step("zapis jest w Moich zapisach i daje się odwołać", async () => {
      await page.goto("/jezdziec/zapisy");
      await expect(page.getByRole("heading", { level: 2, name: "Nadchodzące" })).toBeVisible();
      const row = upcomingRow(page, STABLE_NAME, HORSE);
      await expect(row).toContainText(`${String(HOUR)}:00`);
      await row.getByRole("button", { name: "Odwołaj" }).click();
      await page.waitForURL(/sukces=1/);
      await expect(page.getByText("Zapis został odwołany.")).toBeVisible();
      state.booked = false;
      await expect(page.getByText("Nie masz nadchodzących zapisów.")).toBeVisible();
      await expect(page.getByRole("heading", { level: 2, name: "Minione i odwołane" })).toBeVisible();
      await expect(cancelledRow(page, STABLE_NAME, HORSE)).toBeVisible();
    });

    await test.step("odwołanie znika z listy ośrodka i zwalnia slot", async () => {
      await stablePage.reload();
      await expect(hourSection(stablePage, HOUR).filter({ hasText: HORSE })).toHaveCount(0);

      await page.goto(`${stable.path}?dzien=${stable.day}`);
      await assertSlotsRendered(page);
      await expect(bookButton(page, HOUR, HORSE)).toBeVisible();
      await expect(hourSection(page, HOUR).getByText(`${HORSE} — Twój zapis`)).toHaveCount(0);
    });
  } catch (error: unknown) {
    failure = asError(error);
  }

  if (state.booked) {
    try {
      await page.goto("/jezdziec/zapisy");
      await upcomingRow(page, STABLE_NAME, HORSE).getByRole("button", { name: "Odwołaj" }).click();
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
