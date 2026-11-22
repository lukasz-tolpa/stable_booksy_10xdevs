import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  clearStableRatesAndCosts,
  DEMO_HINT,
  runSql,
  settlementCard,
  SETTLEMENTS_ROUTE,
  setStableRate,
  STABLE_STATE,
} from "./helpers";

/**
 * PDF rozliczenia jeźdźca (#101, spec #100) na minionej historii demo, którą ładuje setup. Wyrocznią jest
 * plik, nie jego tekst: „Pobierz PDF” pobiera `rozliczenie-RRRR-MM-anna-kowalska.pdf`, który zaczyna się od
 * `%PDF`. Zgodność treści z rozliczeniem gwarantuje wspólny model widoku (Vitest `document.test.ts`).
 *
 * Miesiąc to miesiąc sprzed tygodnia według bazy — historia demo ma w nim jazdy Anny także w pierwszych
 * dniach miesiąca. Stawkę ośrodka ustawia sam scenariusz (pierwsza stawka działa wstecz) i usuwa ją przed
 * i po sobie jako superuser (`clearStableRatesAndCosts`), więc bez niej przycisku nie ma.
 */
test.use({ storageState: STABLE_STATE });

/** Jeździec z seeda z jazdami w historii demo. */
const ANNA = { key: "33333333-3333-3333-3333-333333333333", slug: "anna-kowalska" };

/** Miesiąc `RRRR-MM` sprzed tygodnia według bazy. */
function monthWithRides(): string {
  return runSql("select to_char(current_date - 7, 'YYYY-MM');", "odczytać miesiąca", ["-At"]).trim();
}

test.describe("PDF rozliczenia jeźdźca", () => {
  test.beforeAll(clearStableRatesAndCosts);
  test.afterAll(clearStableRatesAndCosts);

  test("bez stawki ośrodka nie ma „Pobierz PDF”; po jej ustawieniu przycisk pobiera plik PDF jeźdźca i miesiąca", async ({
    page,
  }) => {
    const month = monthWithRides();
    const riderPage = `${SETTLEMENTS_ROUTE}/${ANNA.key}?miesiac=${month}`;
    const download = page.getByRole("link", { name: "Pobierz PDF" });

    await page.goto(riderPage);
    const card = settlementCard(page);
    await expect(card.getByRole("list", { name: /^Jazdy — / }), DEMO_HINT).toBeVisible();
    await expect(card.getByRole("link", { name: "Ustaw stawkę ośrodka" })).toBeVisible();
    await expect(download).toHaveCount(0);

    setStableRate(12345);
    await page.goto(`${SETTLEMENTS_ROUTE}?miesiac=${month}`);
    await expect(page.getByRole("list", { name: "Rozliczenia jeźdźców" })).toBeVisible();
    await expect(download, "na liście „Rozliczenia” przycisku nie ma").toHaveCount(0);

    await page.goto(riderPage);
    await expect(card.getByText("Do zapłaty", { exact: true })).toBeVisible();
    const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);

    expect(file.suggestedFilename()).toBe(`rozliczenie-${month}-${ANNA.slug}.pdf`);
    const bytes = await readFile(await file.path());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
