import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  clearStableRatesAndCosts,
  DEMO_HINT,
  emptySettlementsMonth,
  grosze,
  otherRiders,
  otherRidersToggle,
  pricedSettlementRows,
  RIDER_SETTLEMENT_URL,
  riderCostsRegion,
  settlementCard,
  settlementRiders,
  SETTLEMENTS_ROUTE,
  setStableRate,
  STABLE_STATE,
} from "./helpers";

/**
 * Koszty dodatkowe (#96, spec #93) na minionej historii demo, którą ładuje setup: właściciel dopisuje,
 * poprawia i usuwa koszt w rozliczeniu jeźdźca, a jeźdźcowi bez jazd w miesiącu dopisuje koszt przez
 * „Pozostali jeźdźcy ośrodka” na stronie „Rozliczenia” (#106) — koszt dopisuje się tylko w rozliczeniu jeźdźca.
 *
 * Wyrocznią jest spójność, nie konkretne liczby: „Do zapłaty” = kwota za jazdy + suma pozycji kosztów,
 * kwota karty = jazdy × stawka + koszty jeźdźca, „Razem” = suma kart. Stawkę ośrodka ustawia
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
    const costsRegion = riderCostsRegion(page);
    const costs = costsRegion.getByRole("list", { name: `Koszty dodatkowe — ${name}` }).getByRole("listitem");
    const addForm = costsRegion.getByRole("form", { name: "Dopisz koszt" });
    const costsLine = card.getByText(/^Koszty dodatkowe: /);
    const ridesAmount = first.rides * RATE;

    const expectBackHere = () => {
      const url = new URL(page.url());
      expect(`${url.origin}${url.pathname}`, "powrót do rozliczenia tego jeźdźca").toBe(riderUrl.split("?")[0]);
      expect(url.searchParams.get("miesiac"), "powrót na ten sam miesiąc").toBe(month);
    };

    await test.step("bez kosztów „Do zapłaty” to kwota za jazdy", async () => {
      await expect(costsRegion.getByText("W tym miesiącu nie ma kosztów dodatkowych.", { exact: true })).toBeVisible();
      await expect(costsLine, "bez kosztów karta nie ma sumy kosztów").toHaveCount(0);
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
      expect(grosze(await costsLine.innerText()), "suma kosztów w karcie").toBe(80000);
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
      await expect(costsRegion.getByText("W tym miesiącu nie ma kosztów dodatkowych.", { exact: true })).toBeVisible();
      await expect(costsLine).toHaveCount(0);
      expect(await due(card)).toBe(ridesAmount);
    });
  });

  test("„Pozostali jeźdźcy ośrodka”: koszt dopisany jeźdźcowi bez jazd w jego rozliczeniu, na liście 0 jazd i koszt", async ({
    page,
  }) => {
    await openSettlementsWithRides(page);
    const before = await pricedSettlementRows(page);
    let rider = "";

    await test.step("rozwinięta sekcja „Pozostali jeźdźcy ośrodka” pokazuje jeźdźców spoza listy", async () => {
      await expect(otherRiders(page).first(), "sekcja jest domyślnie zwinięta").toBeHidden();
      await otherRidersToggle(page).click();
      await expect(otherRiders(page).first(), "demo ma jeźdźców bez jazd (konta e2e)").toBeVisible();
      const names = (await otherRiders(page).allInnerTexts()).map((text) => text.replace("Dopisz koszt →", "").trim());
      for (const name of names) {
        expect(
          before.some((row) => row.text.startsWith(name)),
          `„${name}” nie ma karty na liście`,
        ).toBe(false);
      }
      rider = names[0];
    });

    await test.step("„Dopisz koszt →” prowadzi do rozliczenia jeźdźca tego samego miesiąca", async () => {
      const listUrl = new URL(page.url());
      // Nazwa jeźdźca jest w nazwie dostępnej linku.
      await otherRiders(page)
        .getByRole("link", { name: `${rider} Dopisz koszt →`, exact: true })
        .click();
      await page.waitForURL(RIDER_SETTLEMENT_URL);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(rider);
      const month = listUrl.searchParams.get("miesiac");
      if (month !== null) {
        expect(new URL(page.url()).searchParams.get("miesiac"), "rozliczenie oglądanego miesiąca").toBe(month);
      }
    });

    await test.step("dopisany koszt jest w rozliczeniu, a „Do zapłaty” to sam koszt", async () => {
      const card = settlementCard(page);
      const costsRegion = riderCostsRegion(page);
      const addForm = costsRegion.getByRole("form", { name: "Dopisz koszt" });
      await addForm.getByLabel("Nazwa kosztu").fill("Wypożyczenie siodła");
      await addForm.getByLabel("Kwota (zł)").fill("50,50");
      await addForm.getByRole("button", { name: "Dopisz koszt", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      await expect(
        costsRegion.getByRole("list", { name: `Koszty dodatkowe — ${rider}` }).getByRole("listitem"),
      ).toHaveCount(1);
      expect(await due(card)).toBe(5050);
    });

    await test.step("po powrocie jeździec ma kartę z 0 jazd i kosztem, „Razem” = suma kart", async () => {
      await page.getByRole("link", { name: "Wróć do rozliczeń" }).click();
      await page.waitForURL(/\/osrodek\/rozliczenia\?miesiac=/);
      const after = await pricedSettlementRows(page);
      const row = after.find((item) => item.text.startsWith(rider));
      expect(row, `karta „${rider}” na liście`).toBeDefined();
      expect(row?.rides, "jeździec z samym kosztem ma 0 jazd").toBe(0);
      expect(row?.amount).toBe(5050);
      const total = grosze(await page.getByText(/^Razem: /).innerText());
      expect(total).toBe(after.reduce((sum, item) => sum + item.amount, 0));
      await otherRidersToggle(page).click();
      await expect(
        otherRiders(page).filter({ hasText: rider }),
        "jeździec z kosztem nie jest już wśród pozostałych",
      ).toHaveCount(0);
    });
  });
});
