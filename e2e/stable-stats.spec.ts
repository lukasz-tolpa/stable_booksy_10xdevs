import { expect, test, type Locator } from "@playwright/test";
import { STABLE_STATE } from "./helpers";

/**
 * Strona statystyk ośrodka (FR-011) na minionej historii demo, którą ładuje setup
 * (`supabase/demo/history.sql`). Wyrocznią jest spójność, nie konkretne liczby,
 * bo historia jest liczona od dnia załadowania:
 * - tabela jeźdźców liczy te same jazdy co podsumowanie, więc ich sumy są równe;
 * - jazda bez przydzielonego konia jest jazdą, ale nie obciąża konia, a historia ma
 *   takie jazdy - suma tabeli koni jest więc mniejsza niż liczba jazd;
 * - przy jeźdźcu liczą się tylko jego własne odwołania, a historia ma odwołania
 *   ośrodka - suma odwołań jeźdźców jest więc mniejsza niż odwołania okresu.
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

test("statystyki okresu są spójne: tabela jeźdźców liczy wszystkie jazdy, tabela koni - tylko jazdy z koniem", async ({
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

  await test.step("jazdy tabeli jeźdźców sumują się do podsumowania, odwołania - bez odwołań ośrodka", async () => {
    const riders = page.getByRole("table", { name: "Jeźdźcy" });
    expect(await columnSum(riders, 0)).toBe(rides);
    const ownCancellations = await columnSum(riders, 2);
    expect(ownCancellations, "historia demo ma odwołania jeźdźców").toBeGreaterThan(0);
    expect(ownCancellations, "historia demo ma odwołania ośrodka").toBeLessThan(cancellations);
  });

  await test.step("zanonimizowani jeźdźcy stoją w jednym wierszu zbiorczym", async () => {
    await expect(page.getByRole("rowheader", { name: "Usunięci jeźdźcy", exact: true })).toHaveCount(1);
  });

  await test.step("tabela koni liczy tylko jazdy z przydzielonym koniem", async () => {
    // Bez slotów treningowych tabela koni nazywa się jak dawniej; historia demo je ma (#115), więc „konie ośrodka”.
    const horses = page.getByRole("table", { name: /^Obciążenie koni (ośrodka )?w okresie/ });
    const horseRides = await columnSum(horses, 0);
    expect(horseRides, "historia demo ma jazdy z koniem").toBeGreaterThan(0);
    expect(horseRides, "historia demo ma jazdy bez konia").toBeLessThan(rides);
  });

  await test.step("każdy z trzech wykresów ma dane w tabeli", async () => {
    await expect(page.getByText("Pokaż dane wykresu w tabeli")).toHaveCount(3);
  });
});

test("statystyki liczą rekreację i sloty treningowe osobno, a konie ośrodka i konie pensjonatowe w dwóch tabelach", async ({
  page,
}) => {
  await page.goto(STATS_URL);
  const summary = page.getByRole("region", { name: "Podsumowanie okresu" });
  await expect(summary, DEMO_HINT).toBeVisible();
  const rides = await count(summary.getByRole("definition").nth(0));

  const split = page.getByRole("table", { name: /^Rekreacja i sloty treningowe/ });
  const recreationRow = split.getByRole("row", { name: /^Sloty rekreacyjne/ });
  const trainingRow = split.getByRole("row", { name: /^Sloty treningowe/ });
  let recreationRides = 0;
  let trainingRides = 0;

  await test.step("jazdy slotów rekreacyjnych i treningowych sumują się do podsumowania", async () => {
    recreationRides = await count(recreationRow.getByRole("cell").nth(0));
    trainingRides = await count(trainingRow.getByRole("cell").nth(0));
    expect(trainingRides, "historia demo ma jazdy na slotach treningowych (#115)").toBeGreaterThan(0);
    expect(recreationRides + trainingRides).toBe(rides);
    // Przy slotach godzinowych godziny jazd równe są liczbie jazd.
    await expect(trainingRow.getByRole("cell").nth(1)).toHaveText(new RegExp(`^${trainingRides}\\s*h$`));
    await expect(trainingRow.getByRole("cell").nth(2)).toHaveText(/^\s*\d+\s*%\s*$/);
  });

  await test.step("konie ośrodka nie niosą jazd treningowych, konie pensjonatowe mają własną tabelę", async () => {
    const stableHorses = page.getByRole("table", { name: /^Obciążenie koni ośrodka w okresie/ });
    const boardingHorses = page.getByRole("table", { name: /^Obciążenie koni pensjonatowych w okresie/ });
    await expect(boardingHorses.getByRole("rowheader", { name: "Hrabia", exact: true })).toBeVisible();
    await expect(stableHorses.getByRole("rowheader", { name: "Hrabia", exact: true })).toHaveCount(0);
    expect(await columnSum(stableHorses, 0)).toBeLessThanOrEqual(recreationRides);
    const boardingRides = await columnSum(boardingHorses, 0);
    expect(boardingRides).toBeGreaterThan(0);
    expect(boardingRides).toBeLessThanOrEqual(trainingRides);
  });
});

test("strona statystyk mieści się w telefonie bez poziomego przewijania", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(STATS_URL);
  await expect(page.getByRole("region", { name: "Podsumowanie okresu" }), DEMO_HINT).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "strona jest szersza niż ekran 390 px").toBeLessThanOrEqual(0);
});
