import { expect, test, type Page } from "@playwright/test";
import { STABLE_NAME, STABLE_STATE } from "./helpers";
import { runLocalSql } from "../scripts/db-demo.mjs";

/**
 * Wejścia do Rozliczeń (#98, spec #93): boczna kolumna panelu ośrodka z sumą bieżącego miesiąca albo
 * prośbą „Ustaw stawkę” i link „Rozliczenia za ten miesiąc” z Podsumowania miesiąca właściciela.
 * Wejście z kolumny głównej na telefonie sprawdza `stable-panel.spec.ts`.
 *
 * Wyrocznią jest spójność, nie konkretne liczby (historia demo liczy się od dnia załadowania): suma przy
 * linku równa się „Razem” strony Rozliczenia tego miesiąca. Stawkę ustawia sam scenariusz — jako superuser,
 * od bieżącego miesiąca bazy (`private.warsaw_month_start()`, ten sam miesiąc co aplikacji); przed i po
 * scenariuszach stawki ośrodka usuwa superuser z wyłączonymi wyzwalaczami, bo obowiązującej zmiany nie
 * usunie nikt inny (SB027).
 */
test.use({ storageState: STABLE_STATE });

const SETTLEMENTS_ROUTE = "/osrodek/rozliczenia";
const SUMMARY_ROUTE = "/osrodek/podsumowanie";

function runSql(sql: string, what: string): void {
  const result = runLocalSql(sql);
  if (result.status !== 0) {
    throw new Error(`Nie udało się ${what}:\n${result.stderr}`);
  }
}

function clearStableRates(): void {
  runSql(
    `
    begin;
    set local session_replication_role = replica;
    delete from public.rates r using public.stables s where s.id = r.stable_id and s.name = '${STABLE_NAME}';
    commit;
  `,
    "usunąć stawek ośrodka",
  );
}

function setStableRate(grosze: number): void {
  runSql(
    `
    insert into public.rates (stable_id, rider_id, from_month, amount)
    select s.id, null, private.warsaw_month_start(), ${String(grosze)} from public.stables s where s.name = '${STABLE_NAME}';
  `,
    "ustawić stawki ośrodka",
  );
}

/** Kwota z tekstu, np. `1 234,50 zł` (twarde spacje), w groszach. */
function grosze(text: string): number {
  const match = /(\d[\d\s]*),(\d{2})\s*zł/.exec(text);
  if (!match) throw new Error(`Brak kwoty w „${text}”`);
  return Number(match[1].replace(/\s/g, "")) * 100 + Number(match[2]);
}

function sideLink(page: Page) {
  return page.getByRole("navigation", { name: "Ośrodek" }).getByRole("link", { name: /^Rozliczenia / });
}

function monthNav(page: Page) {
  return page.getByRole("navigation", { name: "Wybór miesiąca" });
}

test.describe("Wejścia do Rozliczeń", () => {
  test.beforeAll(clearStableRates);
  test.afterAll(clearStableRates);

  test("boczna kolumna panelu: bez stawki „Ustaw stawkę”, ze stawką suma bieżącego miesiąca równa „Razem” Rozliczeń", async ({
    page,
  }) => {
    await test.step("ośrodek bez stawki: przy linku prośba „Ustaw stawkę”", async () => {
      await page.goto("/osrodek");
      await expect(sideLink(page)).toHaveAccessibleName("Rozliczenia Ustaw stawkę");
    });

    setStableRate(12345);
    let sideTotal = 0;
    let monthName = "";

    await test.step("ze stawką przy linku suma bieżącego miesiąca, np. „listopad: 1 234,50 zł”", async () => {
      await page.reload();
      const link = sideLink(page);
      await expect(link).toHaveAccessibleName(/^Rozliczenia \S+: [\d\s]+,\d{2}\szł$/);
      const name = await link.innerText();
      monthName = /(\S+):/.exec(name)?.[1] ?? "";
      sideTotal = grosze(name);
      expect(sideTotal % 12345, "suma to wielokrotność stawki (same jazdy)").toBe(0);
    });

    await test.step("link prowadzi do Rozliczeń bieżącego miesiąca, gdzie „Razem” to ta sama kwota", async () => {
      await sideLink(page).click();
      await page.waitForURL(`**${SETTLEMENTS_ROUTE}`);
      await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toBeVisible();
      await expect(monthNav(page)).toContainText(monthName);
      const empty = page.getByText(/^We? .+ nie ma nic do rozliczenia\.$/);
      if (await empty.isVisible()) {
        expect(sideTotal, "miesiąc bez jazd ma sumę zero").toBe(0);
      } else {
        expect(grosze(await page.getByText(/^Razem: /).innerText())).toBe(sideTotal);
      }
    });
  });

  test("Podsumowanie miesiąca prowadzi do Rozliczeń tego samego miesiąca, bez filtra instruktora", async ({ page }) => {
    await page.goto(SUMMARY_ROUTE);
    await expect(page.getByRole("heading", { level: 1, name: "Podsumowanie miesiąca" })).toBeVisible();

    await test.step("filtr instruktora (gdy miesiąc ma jazdy) i poprzedni miesiąc", async () => {
      const filter = page.getByLabel("Instruktor", { exact: true });
      if (await filter.isVisible()) {
        await filter.selectOption({ index: 1 });
        await page.getByRole("button", { name: "Pokaż" }).click();
        await page.waitForURL(/instruktor=\d+/);
      }
      await monthNav(page).getByRole("link", { name: "Poprzedni" }).click();
      await page.waitForURL(/miesiac=\d{4}-\d{2}/);
    });

    const month = new URL(page.url()).searchParams.get("miesiac") ?? "";
    const label = (await monthNav(page).innerText()).replace(/\s+/g, " ");
    const link = page.getByRole("link", { name: "Rozliczenia za ten miesiąc", exact: true });

    await test.step("link „Rozliczenia za ten miesiąc” niesie miesiąc, nie filtr instruktora", async () => {
      await expect(link).toHaveAttribute("href", `${SETTLEMENTS_ROUTE}?miesiac=${month}`);
    });

    await test.step("Rozliczenia otwierają się na tym samym miesiącu", async () => {
      await link.click();
      await page.waitForURL(`**${SETTLEMENTS_ROUTE}?miesiac=${month}`);
      await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toBeVisible();
      expect((await monthNav(page).innerText()).replace(/\s+/g, " ")).toBe(label);
    });
  });
});
