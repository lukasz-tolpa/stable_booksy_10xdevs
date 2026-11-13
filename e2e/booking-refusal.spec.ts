import { expect, test } from "@playwright/test";
import {
  RIDER_A_STATE,
  RIDER_B_STATE,
  STABLE_NAME,
  asError,
  bookButton,
  openStable,
  slotItem,
  upcomingRow,
} from "./helpers";

/**
 * Ryzyko #3 (odmowa) i klauzula „nie jest już zajęta" z ryzyka #5, w modelu limitu
 * miejsc (#41): próba zapisu na slot, w którym zabrakło miejsc, jest odrzucana —
 * dokładnie tak, jak spotyka to jeździec: miejsce było wolne, gdy strona się
 * załadowała, a zajął je ktoś inny, zanim kliknął. Wyrocznia: jeździec A widzi
 * konkretny polski komunikat (SB009 z wyzwalacza `bookings_seat_limit`
 * przetłumaczone), a w „Moich zapisach" nie ma wiersza — żadna ścieżka nie daje
 * sukcesu bez utrwalonego wiersza.
 *
 * Slot: Joanna Wrona o 14:00 w Stadninie Pod Dębem, dzień seeda — 1 miejsce, wolne
 * w seedzie; inny niż Karol@13 z pętli jeźdźca i niż Joanna@12 skryptu współbieżności.
 *
 * Sprzątanie: B odwołuje swój zapis tylko wtedy, gdy na pewno go założył
 * (`bookedByB`), a błąd samego sprzątania nigdy nie przykrywa błędu scenariusza.
 */
test.use({ storageState: RIDER_A_STATE });

const INSTRUCTOR = "Joanna Wrona";
const HOUR = 14;
const NO_SEATS_MESSAGE = "W tym slocie nie ma już wolnych miejsc. Wybierz inną godzinę albo innego instruktora.";

test("jeździec klikający nieświeży slot bez wolnych miejsc dostaje polską odmowę i nie ma zapisu", async ({
  page,
  browser,
}) => {
  const contextB = await browser.newContext({ storageState: RIDER_B_STATE });
  const pageB = await contextB.newPage();
  // Obiekt, nie `let`: przypisanie wewnątrz callbacka `test.step` jest niewidoczne
  // dla analizy przepływu TS, która zwęziłaby zmienną do `false`.
  const state = { bookedByB: false };
  let failure: Error | undefined;

  try {
    await test.step("A ładuje stronę ośrodka, gdy miejsce jest jeszcze wolne", async () => {
      await openStable(page, STABLE_NAME);
      await expect(slotItem(page, HOUR, INSTRUCTOR)).toContainText("1 z 1 wolne");
      await expect(bookButton(page, HOUR, INSTRUCTOR)).toBeVisible();
    });

    await test.step("B zajmuje jedyne miejsce w drugim kontekście", async () => {
      await openStable(pageB, STABLE_NAME);
      await bookButton(pageB, HOUR, INSTRUCTOR).click();
      await pageB.waitForURL(/sukces=1/);
      await expect(slotItem(pageB, HOUR, INSTRUCTOR)).toContainText("Twój zapis");
      state.bookedByB = true;
    });

    await test.step("A klika nieświeży przycisk i dostaje konkretną odmowę", async () => {
      await bookButton(page, HOUR, INSTRUCTOR).click();
      await page.waitForURL(/error=/);
      await expect(page.getByText(NO_SEATS_MESSAGE)).toBeVisible();
      // Strona po odmowie jest wyrenderowana z bazy: slot jest pełny, a A nie ma
      // plakietki własnego zapisu.
      const slot = slotItem(page, HOUR, INSTRUCTOR);
      await expect(slot).toContainText("0 z 1 wolne");
      await expect(slot).toContainText("Brak miejsc");
      await expect(bookButton(page, HOUR, INSTRUCTOR)).toHaveCount(0);
      await expect(slot.getByText("Twój zapis")).toHaveCount(0);
    });

    await test.step("A nie ma zapisu w Moich zapisach", async () => {
      await page.goto("/jezdziec/zapisy");
      await expect(page.getByText("Nie masz nadchodzących zapisów.")).toBeVisible();
      await expect(upcomingRow(page, STABLE_NAME, INSTRUCTOR)).toHaveCount(0);
    });
  } catch (error: unknown) {
    failure = asError(error);
  }

  if (state.bookedByB) {
    try {
      await pageB.goto("/jezdziec/zapisy");
      await upcomingRow(pageB, STABLE_NAME, INSTRUCTOR).getByRole("button", { name: "Odwołaj" }).click();
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
