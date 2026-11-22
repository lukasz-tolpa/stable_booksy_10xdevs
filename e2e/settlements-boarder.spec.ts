import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  BOARDER,
  SETTLEMENTS_ROUTE,
  STABLE_STATE,
  clearStableRatesAndCosts,
  grosze,
  settlementCard,
  signIn,
} from "./helpers";

/**
 * Rozliczenie pensjonariusza (#117, spec #112): właściciel ustawia stawkę treningową ośrodka na „Rozliczeniach”
 * i opłatę za pensjonat Hrabi przy koniu na „Pensjonariuszach”; rozliczenie pensjonariuszki z seeda
 * (Katarzyna Zając) bieżącego miesiąca ma „Jazdy: N × stawka treningowa = kwota”, pozycję opłaty za pensjonat
 * i „Do zapłaty” = jazdy + opłata; PDF ma te same pozycje. Przed opłatą pozycja konia nie ma kwoty, a karta —
 * „Do zapłaty”. Pensjonariuszka widzi swoją opłatę w „Moich koniach”.
 *
 * Bieżący miesiąc zawsze ma pobyt Hrabi (seed: od 90 dni, bez wyjazdu), więc rozliczenie istnieje także bez
 * jazd. Stawki i opłaty ośrodka usuwa superuser przed scenariuszem i po nim (`clearStableRatesAndCosts`).
 */
test.use({ storageState: STABLE_STATE });

const BOARDER_EMAIL = "katarzyna.zajac@example.com";
const BOARDER_SLUG = "katarzyna-zajac";
const TRAINING_RATE = 15050;
const FEE = 150000;

/** Bieżący miesiąc `RRRR-MM` w strefie ośrodka — ten, od którego działa „Od tego miesiąca”. */
function currentMonth(): string {
  return new Intl.DateTimeFormat("sv-SE", { year: "numeric", month: "2-digit", timeZone: "Europe/Warsaw" }).format(
    new Date(),
  );
}

function boarderSettlementUrl(month: string): string {
  return `${SETTLEMENTS_ROUTE}/${BOARDER.key}?miesiac=${month}`;
}

/** Liczba jazd z wiersza „Jazdy: N × …”. */
async function ridesOf(page: Page): Promise<number> {
  const text = await settlementCard(page)
    .getByText(/^Jazdy: \d+ × /)
    .innerText();
  return Number(/^Jazdy: (\d+) ×/.exec(text)?.[1]);
}

test.describe("Rozliczenie pensjonariusza", () => {
  test.beforeAll(clearStableRatesAndCosts);
  test.afterAll(clearStableRatesAndCosts);

  test("właściciel ustawia stawkę treningową i opłatę za pensjonat: rozliczenie pensjonariuszki z obiema pozycjami, „Do zapłaty” i PDF", async ({
    page,
    browser,
  }) => {
    const month = currentMonth();
    const card = settlementCard(page);
    const feeLine = card.getByText(/^Opłata za pensjonat — Hrabia: /);

    await test.step("stawka treningowa od tego miesiąca w karcie „Stawka treningowa”, stawka ośrodka bez zmian", async () => {
      await page.goto(SETTLEMENTS_ROUTE);
      const training = page.getByRole("region", { name: "Stawka treningowa" });
      await expect(training.getByText("Ustaw stawkę treningową", { exact: true })).toBeVisible();
      await training.getByLabel("Nowa stawka treningowa (zł)").fill("150,50");
      await training.getByRole("radio", { name: /^Od tego miesiąca/ }).check();
      await training.getByRole("button", { name: "Zapisz stawkę treningową", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      await expect(training.getByText(/^150,50\szł$/)).toBeVisible();
      const recreation = page.getByRole("region", { name: "Stawka ośrodka" });
      await expect(recreation.getByText("Ustaw stawkę ośrodka", { exact: true })).toBeVisible();
    });

    await test.step("bez opłaty: jazdy po stawce treningowej, pozycja konia bez kwoty, bez „Do zapłaty”", async () => {
      await page.goto(boarderSettlementUrl(month));
      await expect(page.getByRole("heading", { level: 1, name: BOARDER.name })).toBeVisible();
      await expect(card.getByText(/^Jazdy: \d+ × 150,50\szł = /)).toBeVisible();
      await expect(card.getByText("stawka treningowa ośrodka", { exact: true })).toBeVisible();
      await expect(feeLine).toHaveText("Opłata za pensjonat — Hrabia: brak kwoty");
      await expect(card.getByText("Do zapłaty", { exact: true })).toHaveCount(0);
    });

    await test.step("link „Ustaw opłatę za pensjonat — Hrabia” prowadzi do konia na „Pensjonariuszach”", async () => {
      await card.getByRole("link", { name: "Ustaw opłatę za pensjonat — Hrabia", exact: true }).click();
      await page.waitForURL(/\/osrodek\/pensjonariusze#horse-\d+$/);
      await expect(page.getByRole("heading", { level: 1, name: "Pensjonariusze" })).toBeVisible();
    });

    await test.step("opłata za pensjonat od tego miesiąca przy koniu", async () => {
      const horse = page.getByRole("article", { name: BOARDER.horse });
      await expect(horse.getByText("Opłata nie jest ustawiona.")).toBeVisible();
      const form = horse.getByRole("form", { name: `Opłata za pensjonat — ${BOARDER.horse}` });
      await form.getByLabel("Nowa opłata (zł)").fill("1500");
      await form.getByRole("radio", { name: /^Od tego miesiąca/ }).check();
      await form.getByRole("button", { name: "Zapisz opłatę", exact: true }).click();
      await page.waitForURL(/sukces=oplata#horse-\d+$/);
      await expect(page.getByText("Zapisano opłatę za pensjonat.")).toBeVisible();
      await expect(horse.getByText(/^1 500,00\szł$/)).toBeVisible();
    });

    let rides = 0;
    await test.step("rozliczenie: „Jazdy: N × stawka treningowa”, opłata za Hrabię i „Do zapłaty” = jazdy + opłata", async () => {
      await page.goto(boarderSettlementUrl(month));
      rides = await ridesOf(page);
      const line = card.getByText(/^Jazdy: \d+ × /);
      expect(grosze((await line.innerText()).split("=")[1] ?? "")).toBe(rides * TRAINING_RATE);
      await expect(feeLine).toHaveText(/^Opłata za pensjonat — Hrabia: 1\s500,00\szł$/);
      await expect(card.getByText("Do zapłaty", { exact: true })).toBeVisible();
      // Jedyny element karty z samą kwotą to „Do zapłaty”.
      expect(grosze(await card.getByText(/^\d[\d\s]*,\d{2}\szł$/).innerText())).toBe(rides * TRAINING_RATE + FEE);
    });

    await test.step("„Pobierz PDF” pobiera plik PDF pensjonariuszki i miesiąca", async () => {
      const [file] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("link", { name: "Pobierz PDF" }).click(),
      ]);
      expect(file.suggestedFilename()).toBe(`rozliczenie-${month}-${BOARDER_SLUG}.pdf`);
      const bytes = await readFile(await file.path());
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    });

    const boarderContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const boarder = await boarderContext.newPage();
    try {
      await test.step("pensjonariuszka widzi swoją opłatę w „Moich koniach”, bez formularza", async () => {
        await signIn(boarder, BOARDER_EMAIL, "/jezdziec");
        await boarder.goto("/jezdziec/konie");
        const horse = boarder.getByRole("article", { name: BOARDER.horse });
        await expect(horse.getByText(/^1 500,00\szł$/)).toBeVisible();
        await expect(horse.getByRole("button", { name: "Zapisz opłatę" })).toHaveCount(0);
      });
    } finally {
      await boarderContext.close();
    }
  });
});
