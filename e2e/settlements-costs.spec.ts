import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  clearStableRatesAndCosts,
  DEMO_HINT,
  emptySettlementsMonth,
  grosze,
  pricedSettlementRows,
  RIDER_SETTLEMENT_URL,
  settlementCard,
  settlementRiders,
  SETTLEMENTS_ROUTE,
  setStableRate,
  STABLE_STATE,
} from "./helpers";

/**
 * Koszty dodatkowe (#96, spec #93) na minionej historii demo, którą ładuje setup: właściciel dopisuje,
 * poprawia i usuwa koszt w rozliczeniu jeźdźca, a na stronie „Rozliczenia” dopisuje koszt jeźdźcowi
 * z listy jeźdźców ośrodka (najlepiej takiemu bez jazd w miesiącu).
 *
 * Wyrocznią jest spójność, nie konkretne liczby: „Do zapłaty” = kwota za jazdy + suma pozycji kosztów,
 * kwota wiersza listy = jazdy × stawka + koszty jeźdźca, „Razem” = suma wierszy. Stawkę ośrodka ustawia
 * scenariusz jako superuser od bieżącego miesiąca bazy (`private.warsaw_month_start()`); przed i po
 * scenariuszach superuser usuwa stawki (z wyłączonymi wyzwalaczami, SB027) i koszty dodatkowe ośrodka —
 * kolejne specyfikacje zaczynają bez nich.
 *
 * Historia sięga 24 dni wstecz, więc pierwszego dnia miesiąca bieżący miesiąc nie ma jeszcze jazd —
 * scenariusz pracuje wtedy na poprzednim miesiącu (koszt w minionym miesiącu jest dozwolony).
 */
test.use({ storageState: STABLE_STATE });

const RATE = 12345;

/**
 * Lista ze stawką: bieżący miesiąc, a gdy jeszcze pusty — poprzedni. Zwraca miesiąc z adresu (`null` —
 * bieżący, bez parametru).
 */
async function openSettlementsWithRides(page: Page): Promise<string | null> {
  await page.goto(SETTLEMENTS_ROUTE);
  if (await emptySettlementsMonth(page).isVisible()) {
    await page.getByRole("navigation", { name: "Wybór miesiąca" }).getByRole("link", { name: "Poprzedni" }).click();
    await page.waitForURL(/miesiac=\d{4}-\d{2}$/);
  }
  await expect(settlementRiders(page).first(), DEMO_HINT).toBeVisible();
  return new URL(page.url()).searchParams.get("miesiac");
}

/** „Do zapłaty” i kwota (pogrubiona) to osobne elementy jednego akapitu. */
async function due(card: Locator): Promise<number> {
  const paragraph = card.getByRole("paragraph").filter({ hasText: "Do zapłaty" });
  await expect(paragraph).toBeVisible();
  return grosze(await paragraph.innerText());
}

test.describe("Koszty dodatkowe", () => {
  test.beforeAll(() => {
    clearStableRatesAndCosts();
    setStableRate(RATE);
  });
  test.afterAll(clearStableRatesAndCosts);

  test("właściciel dopisuje, poprawia i usuwa koszt w rozliczeniu jeźdźca: „Do zapłaty” = jazdy + koszty", async ({
    page,
  }) => {
    await openSettlementsWithRides(page);
    const [first] = await pricedSettlementRows(page);
    await settlementRiders(page).first().getByRole("link").click();
    await page.waitForURL(RIDER_SETTLEMENT_URL);
    const riderUrl = page.url();
    // Wiersz listy prowadzi do rozliczenia z miesiącem w adresie.
    const month = new URL(riderUrl).searchParams.get("miesiac");
    const name = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
    const card = settlementCard(page);
    const costs = card.getByRole("list", { name: `Koszty dodatkowe — ${name}` }).getByRole("listitem");
    const addForm = card.getByRole("form", { name: "Dopisz koszt" });
    const ridesAmount = first.rides * RATE;

    const expectBackHere = () => {
      const url = new URL(page.url());
      expect(`${url.origin}${url.pathname}`, "powrót do rozliczenia tego jeźdźca").toBe(riderUrl.split("?")[0]);
      expect(url.searchParams.get("miesiac"), "powrót na ten sam miesiąc").toBe(month);
    };

    await test.step("bez kosztów „Do zapłaty” to kwota za jazdy", async () => {
      await expect(card.getByText("W tym miesiącu nie ma kosztów dodatkowych.", { exact: true })).toBeVisible();
      expect(await due(card)).toBe(ridesAmount);
    });

    await test.step("kwota 0 wraca z polskim komunikatem i nic nie dopisuje", async () => {
      await addForm.getByLabel("Nazwa kosztu").fill("Pensjonat konia");
      await addForm.getByLabel("Kwota (zł)").fill("0");
      await addForm.getByRole("button", { name: "Dopisz koszt", exact: true }).click();
      await page.waitForURL(/error=/);
      expectBackHere();
      await expect(page.getByRole("alert")).toHaveText(/Koszt musi wynosić co najmniej 0,01\szł/);
      await expect(costs).toHaveCount(0);
    });

    await test.step("dopisany koszt jest na liście, a „Do zapłaty” = jazdy + koszt", async () => {
      await addForm.getByLabel("Nazwa kosztu").fill("Pensjonat konia");
      await addForm.getByLabel("Kwota (zł)").fill("800");
      await addForm.getByRole("button", { name: "Dopisz koszt", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      expectBackHere();

      await expect(costs).toHaveCount(1);
      await expect(costs.first().getByText("Pensjonat konia", { exact: true })).toBeVisible();
      await expect(costs.first().getByText(/^800,00\szł$/)).toBeVisible();
      expect(await due(card)).toBe(ridesAmount + 80000);
    });

    await test.step("poprawiony koszt zmienia nazwę, kwotę i „Do zapłaty”", async () => {
      await costs.first().getByText("Popraw", { exact: true }).click();
      const editForm = costs.first().getByRole("form", { name: "Popraw koszt Pensjonat konia" });
      await expect(editForm.getByLabel("Kwota (zł)")).toHaveValue("800,00");
      await editForm.getByLabel("Nazwa kosztu").fill("Pensjonat konia i siano");
      await editForm.getByLabel("Kwota (zł)").fill("750,50");
      await editForm.getByRole("button", { name: "Zapisz koszt", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      expectBackHere();

      await expect(costs).toHaveCount(1);
      await expect(costs.first().getByText("Pensjonat konia i siano", { exact: true })).toBeVisible();
      await expect(costs.first().getByText(/^750,50\szł$/)).toBeVisible();
      expect(await due(card)).toBe(ridesAmount + 75050);
    });

    await test.step("wiersz listy pokazuje kwotę z kosztem", async () => {
      await page.getByRole("link", { name: "Wróć do rozliczeń" }).click();
      await page.waitForURL(/\/osrodek\/rozliczenia\?miesiac=/);
      const row = (await pricedSettlementRows(page)).find((item) => item.text.startsWith(name));
      expect(row?.amount, `wiersz „${name}”`).toBe(ridesAmount + 75050);
      await page.goto(riderUrl);
    });

    await test.step("usunięty koszt znika, a „Do zapłaty” wraca do kwoty za jazdy", async () => {
      await costs.first().getByRole("button", { name: "Usuń", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      expectBackHere();
      await expect(costs).toHaveCount(0);
      await expect(card.getByText("W tym miesiącu nie ma kosztów dodatkowych.", { exact: true })).toBeVisible();
      expect(await due(card)).toBe(ridesAmount);
    });
  });

  test("„Dopisz koszt” na stronie „Rozliczenia”: jeździec z listy jeźdźców ośrodka trafia na listę z kosztem", async ({
    page,
  }) => {
    const month = await openSettlementsWithRides(page);
    const before = await pricedSettlementRows(page);
    const region = page.getByRole("region", { name: "Dopisz koszt" });
    const select = region.getByLabel("Jeździec");
    const options = (await select.getByRole("option").allInnerTexts())
      .map((text) => text.trim())
      .filter((text) => text !== "Wybierz jeźdźca");
    expect(options.length, "jeźdźcy ośrodka do wyboru").toBeGreaterThan(0);
    // Najlepiej jeździec bez jazd w miesiącu (np. konto e2e z samymi odwołaniami); bez takiego — pierwszy.
    const withoutRides = options.find((option) => !before.some((row) => row.text.startsWith(option)));
    const rider = withoutRides ?? options[0];
    const previous = before.find((row) => row.text.startsWith(rider));

    await test.step("koszt dopisany jeźdźcowi wraca na listę tego samego miesiąca", async () => {
      await select.selectOption({ label: rider });
      await region.getByLabel("Nazwa kosztu").fill("Wypożyczenie siodła");
      await region.getByLabel("Kwota (zł)").fill("50,50");
      await region.getByRole("button", { name: "Dopisz koszt", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      if (month !== null) {
        expect(new URL(page.url()).searchParams.get("miesiac"), "powrót na ten sam miesiąc").toBe(month);
      }
    });

    await test.step("wiersz jeźdźca: jazdy × stawka + koszt, „Razem” = suma wierszy", async () => {
      const after = await pricedSettlementRows(page);
      const row = after.find((item) => item.text.startsWith(rider));
      expect(row, `wiersz „${rider}” na liście`).toBeDefined();
      if (previous === undefined) {
        expect(row?.rides, "jeździec z samym kosztem ma 0 jazd").toBe(0);
      }
      expect(row?.amount).toBe((row?.rides ?? 0) * RATE + 5050);
      const total = grosze(await page.getByText(/^Razem: /).innerText());
      expect(total).toBe(after.reduce((sum, item) => sum + item.amount, 0));
    });
  });
});
