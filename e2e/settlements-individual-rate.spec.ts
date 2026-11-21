import { expect, test, type Page } from "@playwright/test";
import { STABLE_NAME, STABLE_STATE } from "./helpers";
import { runLocalSql } from "../scripts/db-demo.mjs";

/**
 * Stawka indywidualna jeźdźca (#97, spec #93) na minionej historii demo, którą ładuje setup. Wyrocznią jest
 * spójność, nie konkretne liczby: po stawce indywidualnej od tego miesiąca kwota jeźdźca to jego jazdy ×
 * stawka indywidualna — w rozliczeniu jeźdźca i na liście — a kwoty innych jeźdźców zostają przy stawce
 * ośrodka; „Razem” to suma wierszy. Potem powrót do stawki ośrodka: zaplanowany (i usunięty) od
 * następnego miesiąca, wreszcie od tego miesiąca.
 *
 * Stawkę ośrodka ustawia sam scenariusz — jako superuser, od bieżącego miesiąca bazy
 * (`private.warsaw_month_start()`). Obowiązującej zmiany nie usunie nikt poza superuserem z wyłączonymi
 * wyzwalaczami (SB027), więc przed i po scenariuszu usuwa tak wszystkie stawki ośrodka (także
 * indywidualne). Pierwszego dnia miesiąca bieżący miesiąc może nie mieć jeszcze jazd — wtedy scenariusz
 * się pomija (stawka „od tego miesiąca” nie dotyczy poprzedniego).
 */
test.use({ storageState: STABLE_STATE });

const DEMO_HINT = "Brak minionej historii demo — uruchom: npm run db:demo";
const ROUTE = "/osrodek/rozliczenia";
const NO_RIDES_YET = "Bieżący miesiąc nie ma jeszcze jazd (pierwszy dzień miesiąca)";
const STABLE_RATE = 12345;
const INDIVIDUAL_RATE = 8000;

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

function riders(page: Page) {
  return page.getByRole("list", { name: "Rozliczenia jeźdźców" }).getByRole("listitem");
}

function emptyMonth(page: Page) {
  return page.getByText(/^We? .+ nie ma nic do rozliczenia\.$/);
}

/** Wiersze listy: tekst, liczba jazd i kwota. */
async function rows(page: Page): Promise<{ text: string; rides: number; amount: number }[]> {
  return (await riders(page).allInnerTexts()).map((text) => ({
    text,
    rides: Number(/(\d+) jazd/.exec(text)?.[1] ?? Number.NaN),
    amount: grosze(text),
  }));
}

/** Karta rozliczenia jeźdźca: region „Rozliczenie za {miesiąc}”. */
function settlementCard(page: Page) {
  return page.getByRole("region", { name: /^Rozliczenie za / });
}

/** Wiersz „Jazdy: N × stawka = kwota”, dopisek źródła i „Do zapłaty” zgadzają się z jazdami i stawką. */
async function expectRiderAmounts(page: Page, rides: number, rate: number, source: string): Promise<void> {
  const card = settlementCard(page);
  const line = card.getByText(/^Jazdy: \d+ × /);
  await expect(line).toHaveText(new RegExp(`^Jazdy: ${String(rides)} × `));
  const [, rateText = "", amountText = ""] = /× (.+) = (.+)$/.exec(await line.innerText()) ?? [];
  expect(grosze(rateText), "stawka w wierszu jazd").toBe(rate);
  expect(grosze(amountText), "kwota za jazdy").toBe(rides * rate);
  await expect(card.getByText(source, { exact: true })).toBeVisible();
  // Jedyny element karty z samą kwotą to „Do zapłaty”.
  expect(grosze(await card.getByText(/^\d[\d\s]*,\d{2}\szł$/).innerText()), "Do zapłaty").toBe(rides * rate);
}

test.describe("Stawka indywidualna jeźdźca", () => {
  test.beforeAll(() => {
    clearStableRates();
    setStableRate(STABLE_RATE);
  });
  test.afterAll(clearStableRates);

  test("właściciel ustawia jeźdźcowi stawkę indywidualną od tego miesiąca: jego kwota liczy się po niej, innych bez zmian", async ({
    page,
  }) => {
    await page.goto(ROUTE);
    test.skip(await emptyMonth(page).isVisible(), NO_RIDES_YET);
    await expect(riders(page).first(), DEMO_HINT).toBeVisible();
    const listUrl = page.url();

    const before = await rows(page);
    for (const row of before) {
      expect(row.amount, `kwota w „${row.text}” po stawce ośrodka`).toBe(row.rides * STABLE_RATE);
    }
    const [target] = before;

    const rateRegion = page.getByRole("region", { name: "Stawka jeźdźca" });
    let riderUrl = "";

    await test.step("rozliczenie jeźdźca: bez stawki indywidualnej obowiązuje stawka ośrodka", async () => {
      await riders(page).first().getByRole("link").click();
      await page.waitForURL(/\/osrodek\/rozliczenia\/[0-9a-f-]{36}\?miesiac=\d{4}-\d{2}$/);
      riderUrl = page.url();
      const name = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
      expect(target.text.startsWith(name), `wiersz listy „${target.text}” to jeździec „${name}”`).toBe(true);
      await expect(rateRegion.getByText(/^123,45\szł$/)).toBeVisible();
      await expect(rateRegion.getByText("stawka ośrodka", { exact: true })).toBeVisible();
      await expect(rateRegion.getByRole("form", { name: "Powrót do stawki ośrodka" })).toHaveCount(0);
      await expectRiderAmounts(page, target.rides, STABLE_RATE, "stawka ośrodka");
    });

    await test.step("stawka indywidualna od tego miesiąca: kwota jeźdźca = jego jazdy × stawka indywidualna", async () => {
      const form = rateRegion.getByRole("form", { name: "Nowa stawka indywidualna" });
      await form.getByLabel("Nowa stawka indywidualna (zł)").fill("80");
      await form.getByRole("radio", { name: /^Od tego miesiąca/ }).check();
      await form.getByRole("button", { name: "Zapisz stawkę indywidualną", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      const back = new URL(page.url());
      const rider = new URL(riderUrl);
      expect(back.pathname, "powrót na rozliczenie tego jeźdźca").toBe(rider.pathname);
      expect(back.searchParams.get("miesiac"), "ten sam miesiąc").toBe(rider.searchParams.get("miesiac"));
      await expect(page.getByText("Zapisano.")).toBeVisible();
      await expect(rateRegion.getByText(/^80,00\szł$/)).toBeVisible();
      await expect(rateRegion.getByText("stawka indywidualna", { exact: true })).toBeVisible();
      await expectRiderAmounts(page, target.rides, INDIVIDUAL_RATE, "stawka indywidualna");
    });

    await test.step("lista: jeździec po stawce indywidualnej z dopiskiem, inni bez zmian, „Razem” = suma wierszy", async () => {
      await page.goto(listUrl);
      const after = await rows(page);
      expect(after.map((row) => row.rides)).toEqual(before.map((row) => row.rides));
      expect(after[0]?.amount).toBe(target.rides * INDIVIDUAL_RATE);
      expect(after[0]?.text).toContain("stawka indywidualna");
      for (const row of after.slice(1)) {
        expect(row.amount, `kwota w „${row.text}” bez zmian`).toBe(row.rides * STABLE_RATE);
        expect(row.text).not.toContain("stawka indywidualna");
      }
      const sum = after.reduce((acc, row) => acc + row.amount, 0);
      expect(grosze(await page.getByText(/^Razem: /).innerText())).toBe(sum);
    });

    await test.step("powrót do stawki ośrodka od następnego miesiąca: zaplanowany, nie zmienia kwot, daje się usunąć", async () => {
      await page.goto(riderUrl);
      const end = rateRegion.getByRole("form", { name: "Powrót do stawki ośrodka" });
      await end.getByRole("radio", { name: /^Od następnego miesiąca/ }).check();
      await end.getByRole("button", { name: "Usuń stawkę indywidualną", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      const planned = rateRegion.getByText(/^od \S+ \d{4}: stawka ośrodka$/);
      await expect(planned).toBeVisible();
      await expectRiderAmounts(page, target.rides, INDIVIDUAL_RATE, "stawka indywidualna");

      await rateRegion.getByRole("button", { name: "Usuń zaplanowaną zmianę", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      await expect(planned).toHaveCount(0);
      await expectRiderAmounts(page, target.rides, INDIVIDUAL_RATE, "stawka indywidualna");
    });

    await test.step("usunięcie stawki indywidualnej od tego miesiąca: jeździec wraca do stawki ośrodka", async () => {
      const end = rateRegion.getByRole("form", { name: "Powrót do stawki ośrodka" });
      await end.getByRole("radio", { name: /^Od tego miesiąca/ }).check();
      await end.getByRole("button", { name: "Usuń stawkę indywidualną", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      await expect(rateRegion.getByText("stawka ośrodka", { exact: true })).toBeVisible();
      await expect(end).toHaveCount(0);
      await expectRiderAmounts(page, target.rides, STABLE_RATE, "stawka ośrodka");
    });
  });

  test("kwota z trzema miejscami po przecinku wraca na rozliczenie jeźdźca z polskim komunikatem", async ({ page }) => {
    await page.goto(ROUTE);
    test.skip(await emptyMonth(page).isVisible(), NO_RIDES_YET);
    await riders(page).first().getByRole("link").click();
    await page.waitForURL(/\/osrodek\/rozliczenia\/[0-9a-f-]{36}\?miesiac=/);
    const path = new URL(page.url()).pathname;
    const form = page.getByRole("form", { name: "Nowa stawka indywidualna" });
    await form.getByLabel("Nowa stawka indywidualna (zł)").fill("80,505");
    await form.getByRole("button", { name: "Zapisz stawkę indywidualną", exact: true }).click();
    await page.waitForURL(/error=/);
    expect(new URL(page.url()).pathname).toBe(path);
    await expect(page.getByRole("alert")).toHaveText("Kwota może mieć najwyżej dwa miejsca po przecinku");
    await expect(settlementCard(page).getByText("stawka ośrodka", { exact: true })).toBeVisible();
  });
});
