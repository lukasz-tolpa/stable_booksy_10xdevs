import { expect, test, type Page } from "@playwright/test";
import {
  BOARDER,
  DEMO_HINT,
  SETTLEMENTS_ROUTE,
  STABLE_STATE,
  clearStableRatesAndCosts,
  expectDocumentOrder,
  expectNoHorizontalScroll,
  goToMonthWithRecreationRides,
  grosze,
  otherRiders,
  otherRidersToggle,
  setBoarderFee,
  setStableRate,
  setTrainingRate,
  settlementRiders,
  settlementRows,
  settlementSection,
  settlementSectionTotal,
} from "./helpers";

/**
 * Rozliczenia i Podsumowanie miesiąca w dwóch sekcjach (#118, spec #112): „Rekreacja” i „Pensjonariusze”
 * według reguły „pensjonariusz w miesiącu”. Pensjonariuszka z seeda (Katarzyna Zając, pobyt Hrabi od 90 dni)
 * jest w sekcji „Pensjonariusze” także w miesiącu bez jazd; jeźdźcy rekreacyjni historii demo — w „Rekreacji”.
 *
 * Wyrocznią jest spójność, nie konkretne liczby (historia demo liczy się od dnia załadowania): suma sekcji
 * = suma „Do zapłaty” jej kart, „Razem” = suma sum sekcji. Stawki i opłatę ustawia sam scenariusz jako
 * superuser, od bieżącego miesiąca bazy (pierwsza działa wstecz); przed i po nim usuwa je
 * `clearStableRatesAndCosts`.
 */
test.use({ storageState: STABLE_STATE });

const SUMMARY_ROUTE = "/osrodek/podsumowanie";
const RATE = 12345;
const TRAINING_RATE = 15050;
const FEE = 150000;

function monthNav(page: Page) {
  return page.getByRole("navigation", { name: "Wybór miesiąca" });
}

/** Suma „Do zapłaty” kart sekcji (każda karta ma kwotę — stawki i opłata są ustawione). */
async function cardsSum(page: Page, section: "Rekreacja" | "Pensjonariusze"): Promise<number> {
  const rows = await settlementRows(page, section);
  for (const row of rows) expect(row.amount, `„Do zapłaty” w „${row.text}”`).not.toBeNull();
  return rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
}

test.describe("Rozliczenia w dwóch sekcjach", () => {
  test.beforeAll(() => {
    clearStableRatesAndCosts();
    setStableRate(RATE);
    setTrainingRate(TRAINING_RATE);
    setBoarderFee(FEE);
  });
  test.afterAll(clearStableRatesAndCosts);

  test("pensjonariuszka w sekcji „Pensjonariusze”, jeźdźcy rekreacyjni w „Rekreacji”; sumy sekcji = karty, „Razem” = sekcje", async ({
    page,
  }) => {
    await page.goto(SETTLEMENTS_ROUTE);
    await goToMonthWithRecreationRides(page);
    await expect(settlementRiders(page).first(), DEMO_HINT).toBeVisible();

    await test.step("Katarzyna ma kartę tylko w sekcji „Pensjonariusze”, z opłatą za pensjonat w wyliczeniu", async () => {
      const boarders = settlementRiders(page, "Pensjonariusze");
      await expect(boarders).toHaveCount(1);
      await expect(boarders.first()).toContainText(BOARDER.name);
      await expect(boarders.first()).toContainText("stawka treningowa ośrodka");
      await expect(boarders.first()).toContainText(/opłata za pensjonat 1\s500,00\szł/);
      await expect(settlementRiders(page).filter({ hasText: BOARDER.name })).toHaveCount(0);
      // Rekreacja liczy się po stawce ośrodka: kwota = jazdy × stawka.
      for (const row of await settlementRows(page)) {
        expect(row.amount, `kwota w „${row.text}”`).toBe(row.rides * RATE);
      }
    });

    await test.step("suma każdej sekcji to suma jej kart, a „Razem” — suma sekcji", async () => {
      const recreation = await settlementSectionTotal(page, "Rekreacja");
      const boarders = await settlementSectionTotal(page, "Pensjonariusze");
      expect(recreation).toBe(await cardsSum(page, "Rekreacja"));
      expect(boarders).toBe(await cardsSum(page, "Pensjonariusze"));
      expect(grosze(await page.getByText(/^Razem: /).innerText())).toBe((recreation ?? 0) + (boarders ?? 0));
    });

    await test.step("pensjonariuszki nie ma wśród „Pozostałych jeźdźców ośrodka”", async () => {
      const toggle = otherRidersToggle(page);
      if ((await toggle.count()) > 0) {
        await toggle.click();
        await expect(otherRiders(page).filter({ hasText: BOARDER.name })).toHaveCount(0);
      }
    });
  });

  test("w miesiącu bez jazd pensjonariuszka ma kartę „0 jazd” z opłatą za pensjonat", async ({ page }) => {
    // Dwa miesiące wstecz: historia demo (24 dni) tam nie sięga, a pobyt Hrabi (od 90 dni) — tak.
    await page.goto(SETTLEMENTS_ROUTE);
    for (let back = 0; back < 2; back += 1) {
      const month = new URL(page.url()).searchParams.get("miesiac");
      await monthNav(page).getByRole("link", { name: "Poprzedni" }).click();
      await page.waitForURL((url) => (url.searchParams.get("miesiac") ?? "") !== (month ?? ""));
    }
    const card = settlementRiders(page, "Pensjonariusze").filter({ hasText: BOARDER.name });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("0 jazd");
    expect(grosze(await card.innerText()), "„Do zapłaty” = opłata za pensjonat").toBe(FEE);
    expect(await settlementSectionTotal(page, "Pensjonariusze")).toBe(FEE);
  });

  test("na telefonie kolejność w dokumencie: miesiąc i suma, Rekreacja, Pensjonariusze, stawki — bez przewijania w bok", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SETTLEMENTS_ROUTE);
    await goToMonthWithRecreationRides(page);
    await expect(settlementRiders(page).first(), DEMO_HINT).toBeVisible();
    await expectDocumentOrder(page, [
      monthNav(page),
      page.getByRole("heading", { level: 2, name: "Do zapłaty razem" }),
      settlementSection(page, "Rekreacja").getByRole("heading", { level: 2 }),
      settlementRiders(page).first(),
      settlementSection(page, "Pensjonariusze").getByRole("heading", { level: 2 }),
      settlementRiders(page, "Pensjonariusze").first(),
      page.getByRole("region", { name: "Stawka ośrodka" }),
      page.getByRole("region", { name: "Stawka treningowa" }),
    ]);
    await expectNoHorizontalScroll(page);
  });
});

// Oracle: spec #112 — „Do zapłaty” bez opłaty za pensjonat nie jest liczone, a suma miesiąca nie bywa częściowa.
test.describe("Rozliczenia bez opłaty za pensjonat", () => {
  test.beforeAll(() => {
    clearStableRatesAndCosts();
    setStableRate(RATE);
    setTrainingRate(TRAINING_RATE);
  });
  test.afterAll(clearStableRatesAndCosts);

  test("koń bez opłaty: sekcja „Pensjonariusze” i „Do zapłaty razem” bez sumy, rekreacja ma swoją", async ({
    page,
  }) => {
    await page.goto(SETTLEMENTS_ROUTE);
    await goToMonthWithRecreationRides(page);
    await expect(settlementRiders(page).first(), DEMO_HINT).toBeVisible();

    const boarders = settlementSection(page, "Pensjonariusze");
    await expect(settlementRiders(page, "Pensjonariusze").first()).toContainText("opłata za pensjonat: brak kwoty");
    await expect(
      boarders.getByText(
        "„Do zapłaty” pojawi się po ustawieniu opłaty za pensjonat przy koniu na stronie „Pensjonariusze”.",
      ),
    ).toBeVisible();
    expect(await settlementSectionTotal(page, "Pensjonariusze")).toBeNull();
    expect(await settlementSectionTotal(page, "Rekreacja")).toBe(await cardsSum(page, "Rekreacja"));
    // „Do zapłaty razem” bez kwoty („—”) zamiast sumy częściowej: suma dla czytników ekranu znika.
    await expect(page.getByRole("heading", { level: 2, name: "Do zapłaty razem" })).toBeVisible();
    await expect(page.getByText(/^Razem: /)).toHaveCount(0);
  });
});

test("Podsumowanie miesiąca właściciela ma obie sekcje: pensjonariuszka w „Pensjonariuszach”, reszta w „Rekreacji”", async ({
  page,
}) => {
  const boarders = page.getByRole("list", { name: "Jeźdźcy — Pensjonariusze", exact: true });
  await page.goto(SUMMARY_ROUTE);
  // Jazdy pensjonariuszki (środy i soboty historii demo) są w bieżącym albo w poprzednim miesiącu.
  if ((await boarders.count()) === 0) {
    await monthNav(page).getByRole("link", { name: "Poprzedni" }).click();
    await page.waitForURL(/miesiac=\d{4}-\d{2}$/);
  }

  const recreation = page.getByRole("list", { name: "Jeźdźcy — Rekreacja", exact: true });
  await expect(page.getByRole("region", { name: "Pensjonariusze", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Rekreacja", exact: true }), DEMO_HINT).toBeVisible();
  // Wiersz jeźdźca to pozycja listy sekcji z jego imieniem i nazwiskiem (zwinięte pod nim jazdy go nie mają).
  const riderRow = (list: typeof boarders) =>
    list.getByRole("listitem").filter({ has: page.getByText(BOARDER.name, { exact: true }) });
  await expect(riderRow(boarders)).toHaveCount(1);
  await expect(riderRow(recreation)).toHaveCount(0);
  await expect(recreation.getByRole("listitem").first()).toBeVisible();

  await test.step("pensjonariuszka jeździ na swoim koniu", async () => {
    await boarders.getByText(BOARDER.name, { exact: true }).click();
    const rides = page.getByRole("list", { name: `Jazdy — ${BOARDER.name}` }).getByRole("listitem");
    await expect(rides.first()).toBeVisible();
    for (const text of await rides.allInnerTexts()) expect(text).toContain(BOARDER.horse);
  });
});
