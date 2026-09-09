import { expect, test } from "@playwright/test";
import {
  RIDER_A_STATE,
  RIDER_B_STATE,
  STABLE_NAME,
  asError,
  bookButton,
  hourSection,
  openStable,
  upcomingRow,
} from "./helpers";

/**
 * Ryzyko #3 (odmowa) i klauzula „nie jest już zajęta" z ryzyka #5. Zdanie z PRD:
 * „próba zapisu na slot, który stał się zajęty, jest odrzucana" — dokładnie tak,
 * jak spotyka to jeździec: slot był wolny, gdy strona się załadowała, a zajął go
 * ktoś inny, zanim kliknął. Wyrocznia: jeździec A widzi konkretny polski komunikat
 * (23505 przetłumaczone), a w „Moich zapisach" nie ma wiersza — żadna ścieżka nie
 * daje sukcesu bez utrwalonego wiersza.
 *
 * Slot: Bella o 14:00 w Stadninie Pod Debem, jutro — wolny w seedzie, inny niż
 * Kasztan@13 z pętli jeźdźca i niż Kasztan@12 skryptu współbieżności.
 *
 * Sprzątanie: B odwołuje swój zapis tylko wtedy, gdy na pewno go założył
 * (`bookedByB`), a błąd samego sprzątania nigdy nie przykrywa błędu scenariusza.
 */
test.use({ storageState: RIDER_A_STATE });

const HORSE = "Bella";
const HOUR = 14;
const TAKEN_MESSAGE = "Ten slot został właśnie zajęty. Wybierz inny termin lub konia.";

test("jeździec klikający nieświeży slot dostaje polską odmowę i nie ma zapisu", async ({ page, browser }) => {
  const contextB = await browser.newContext({ storageState: RIDER_B_STATE });
  const pageB = await contextB.newPage();
  // Obiekt, nie `let`: przypisanie wewnątrz callbacka `test.step` jest niewidoczne
  // dla analizy przepływu TS, która zwęziłaby zmienną do `false`.
  const state = { bookedByB: false };
  let failure: Error | undefined;

  try {
    await test.step("A ładuje stronę ośrodka, gdy slot jest jeszcze wolny", async () => {
      await openStable(page, STABLE_NAME);
      await expect(bookButton(page, HOUR, HORSE)).toBeVisible();
    });

    await test.step("B zajmuje ten sam slot w drugim kontekście", async () => {
      await openStable(pageB, STABLE_NAME);
      await bookButton(pageB, HOUR, HORSE).click();
      await pageB.waitForURL(/sukces=1/);
      await expect(hourSection(pageB, HOUR).getByText(`${HORSE} — Twój zapis`)).toBeVisible();
      state.bookedByB = true;
    });

    await test.step("A klika nieświeży przycisk i dostaje konkretną odmowę", async () => {
      await bookButton(page, HOUR, HORSE).click();
      await page.waitForURL(/error=/);
      await expect(page.getByText(TAKEN_MESSAGE)).toBeVisible();
      // Strona po odmowie jest wyrenderowana z bazy: cudzy zapis nie jest pokazywany,
      // a A nie ma plakietki własnego zapisu.
      await expect(bookButton(page, HOUR, HORSE)).toHaveCount(0);
      await expect(hourSection(page, HOUR).getByText(`${HORSE} — Twój zapis`)).toHaveCount(0);
    });

    await test.step("A nie ma zapisu w Moich zapisach", async () => {
      await page.goto("/jezdziec/zapisy");
      await expect(page.getByText("Nie masz nadchodzących zapisów.")).toBeVisible();
      await expect(upcomingRow(page, STABLE_NAME, HORSE)).toHaveCount(0);
    });
  } catch (error: unknown) {
    failure = asError(error);
  }

  if (state.bookedByB) {
    try {
      await pageB.goto("/jezdziec/zapisy");
      await upcomingRow(pageB, STABLE_NAME, HORSE).getByRole("button", { name: "Odwołaj" }).click();
      await pageB.waitForURL(/sukces=1/);
      await expect(pageB.getByText("Zapis został odwołany.")).toBeVisible();
    } catch (cleanupError: unknown) {
      // Nie przykrywaj błędu scenariusza błędem sprzątania — zostaw ślad w raporcie.
      test.info().annotations.push({ type: "cleanup-failed", description: String(cleanupError) });
      failure ??= asError(cleanupError);
    }
  }

  await contextB.close();

  if (failure !== undefined) {
    throw failure;
  }
});
