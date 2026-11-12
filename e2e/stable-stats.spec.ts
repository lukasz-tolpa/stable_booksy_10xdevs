import { expect, test, type Locator } from "@playwright/test";
import { STABLE_STATE } from "./helpers";

/**
 * Strona statystyk ośrodka (FR-011) na minionej historii demo, którą ładuje setup
 * (`supabase/demo/history.sql`). Wyrocznią jest spójność, nie konkretne liczby:
 * podsumowanie okresu, tabela jeźdźców i tabela koni liczą te same jazdy, więc ich
 * sumy muszą się zgadzać - niezależnie od dnia, w którym załadowano historię.
 *
 * Okres podany jawnie: domyślny (bieżący miesiąc do dziś) pierwszego dnia miesiąca
 * nie obejmuje żadnego minionego dnia.
 */
test.use({ storageState: STABLE_STATE });

const DEMO_HINT = "Brak minionej historii demo — uruchom: npm run db:demo";

function isoDay(offsetDays: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + offsetDays);
  return day.toISOString().slice(0, 10);
}

const STATS_URL = `/osrodek/statystyki?od=${isoDay(-40)}&do=${isoDay(0)}`;

async function count(locator: Locator): Promise<number> {
  const text = (await locator.innerText()).replace(/\s/g, "");
  expect(text, `oczekiwana liczba całkowita, jest "${text}"`).toMatch(/^\d+$/);
  return Number(text);
}

/** Suma komórek liczbowych o danym indeksie we wszystkich wierszach treści tabeli. */
async function columnSum(table: Locator, cellIndex: number): Promise<number> {
  const rows = await table.locator("tbody").getByRole("row").all();
  let sum = 0;
  for (const row of rows) {
    sum += await count(row.getByRole("cell").nth(cellIndex));
  }
  return sum;
}

test("statystyki okresu są spójne: podsumowanie, tabela jeźdźców i tabela koni liczą te same jazdy", async ({
  page,
}) => {
  await page.goto(STATS_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Statystyki" })).toBeVisible();

  const summary = page.getByRole("region", { name: "Podsumowanie okresu" });
  await expect(summary, DEMO_HINT).toBeVisible();
  // Kafelki w kolejności: jazdy, godziny jazd, obłożenie grafiku, odwołania.
  const tiles = summary.getByRole("definition");
  const rides = await count(tiles.nth(0));
  const cancellations = await count(tiles.nth(3));
  expect(rides, DEMO_HINT).toBeGreaterThan(0);

  await test.step("tabela jeźdźców sumuje się do podsumowania", async () => {
    const riders = page.getByRole("table", { name: "Jeźdźcy" });
    expect(await columnSum(riders, 0)).toBe(rides);
    expect(await columnSum(riders, 2)).toBe(cancellations);
  });

  await test.step("zanonimizowani jeźdźcy stoją w jednym wierszu zbiorczym", async () => {
    await expect(page.getByRole("rowheader", { name: "Usunięci jeźdźcy", exact: true })).toHaveCount(1);
  });

  await test.step("tabela koni sumuje się do podsumowania", async () => {
    const horses = page.getByRole("table", { name: /^Obciążenie koni w okresie/ });
    expect(await columnSum(horses, 0)).toBe(rides);
  });

  await test.step("każdy z trzech wykresów ma dane w tabeli", async () => {
    await expect(page.getByText("Pokaż dane wykresu w tabeli")).toHaveCount(3);
  });
});

test("strona statystyk mieści się w telefonie bez poziomego przewijania", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(STATS_URL);
  await expect(page.getByRole("region", { name: "Podsumowanie okresu" }), DEMO_HINT).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "strona jest szersza niż ekran 390 px").toBeLessThanOrEqual(0);
});
