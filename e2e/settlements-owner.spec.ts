import { expect, test, type Page } from "@playwright/test";
import { INSTRUCTOR_EMAIL, RIDER_A_STATE, STABLE_NAME, STABLE_STATE, signIn } from "./helpers";
import { runLocalSql } from "../scripts/db-demo.mjs";

/**
 * Rozliczenia właściciela (`/osrodek/rozliczenia`, #94) na minionej historii demo, którą ładuje setup.
 * Wyrocznią jest spójność, nie konkretne liczby (historia liczy się od dnia załadowania): po ustawieniu
 * stawki ośrodka kwota każdego jeźdźca to liczba jego jazd × stawka, a „Razem” to suma wierszy.
 *
 * Stawkę ustawia sam scenariusz; seed i historia demo jej nie mają. Obowiązującej zmiany aplikacja nie
 * usuwa (reguła bazy SB027), więc przed i po scenariuszu stawki ośrodka usuwa superuser — z wyłączonymi
 * wyzwalaczami (`session_replication_role = replica`), bo reguła czasu dotyczy także jego.
 *
 * Historia sięga 24 dni wstecz, więc pierwszego dnia miesiąca bieżący miesiąc nie ma jeszcze jazd —
 * scenariusz rozlicza wtedy poprzedni miesiąc (pierwsza stawka ośrodka działa wstecz).
 */
const DEMO_HINT = "Brak minionej historii demo — uruchom: npm run db:demo";
const ROUTE = "/osrodek/rozliczenia";

function clearStableRates(): void {
  const result = runLocalSql(`
    begin;
    set local session_replication_role = replica;
    delete from public.rates r using public.stables s where s.id = r.stable_id and s.name = '${STABLE_NAME}';
    commit;
  `);
  if (result.status !== 0) {
    throw new Error(`Nie udało się usunąć stawek ośrodka:\n${result.stderr}`);
  }
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

/** Wiersze listy: liczba jazd i kwota (`null` — bez kwoty, ośrodek bez stawki). */
async function rows(page: Page): Promise<{ text: string; rides: number; amount: number | null }[]> {
  return (await riders(page).allInnerTexts()).map((text) => ({
    text,
    rides: Number(/(\d+) jazd/.exec(text)?.[1] ?? Number.NaN),
    amount: text.includes("zł") ? grosze(text) : null,
  }));
}

test.describe("Rozliczenia właściciela", () => {
  test.use({ storageState: STABLE_STATE });
  test.beforeAll(clearStableRates);
  test.afterAll(clearStableRates);

  test("właściciel ustawia stawkę ośrodka: kwota jeźdźca = liczba jazd × stawka, „Razem” = suma wierszy", async ({
    page,
  }) => {
    const empty = page.getByText(/^We? .+ nie ma nic do rozliczenia\.$/);
    const total = page.getByText(/^Razem: /);
    const rateRegion = page.getByRole("region", { name: "Stawka ośrodka" });

    await test.step("przed pierwszą stawką strona prosi o nią, a lista nie ma kwot", async () => {
      await page.goto(ROUTE);
      await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toBeVisible();
      await expect(rateRegion.getByText("Ustaw stawkę ośrodka", { exact: true })).toBeVisible();
      if (await empty.isVisible()) {
        await page.getByRole("navigation", { name: "Wybór miesiąca" }).getByRole("link", { name: "Poprzedni" }).click();
        await page.waitForURL(/miesiac=\d{4}-\d{2}$/);
      }
      await expect(riders(page).first(), DEMO_HINT).toBeVisible();
      await expect(page.getByText("Kwoty pojawią się po ustawieniu stawki ośrodka.")).toBeVisible();
      await expect(total).toHaveCount(0);
      expect((await rows(page)).every((row) => row.amount === null)).toBe(true);
    });

    const month = new URL(page.url()).searchParams.get("miesiac");

    await test.step("kwota z trzema miejscami po przecinku wraca z polskim komunikatem", async () => {
      await rateRegion.getByLabel("Nowa stawka (zł)").fill("120,505");
      await rateRegion.getByRole("button", { name: "Zapisz stawkę", exact: true }).click();
      await page.waitForURL(/error=/);
      await expect(page.getByRole("alert")).toHaveText("Kwota może mieć najwyżej dwa miejsca po przecinku");
      await expect(rateRegion.getByText("Ustaw stawkę ośrodka", { exact: true })).toBeVisible();
    });

    await test.step("stawka od tego miesiąca: kwota każdego jeźdźca to jego jazdy × stawka", async () => {
      await rateRegion.getByLabel("Nowa stawka (zł)").fill("123,45");
      await rateRegion.getByRole("radio", { name: /^Od tego miesiąca/ }).check();
      await rateRegion.getByRole("button", { name: "Zapisz stawkę", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      if (month !== null) {
        expect(new URL(page.url()).searchParams.get("miesiac"), "powrót na ten sam miesiąc").toBe(month);
      }
      // Kwota obok „Obowiązuje teraz:” jest osobnym elementem (pogrubiona).
      await expect(rateRegion.getByText("Obowiązuje teraz:")).toBeVisible();
      await expect(rateRegion.getByText(/^123,45\szł$/)).toBeVisible();

      const list = await rows(page);
      expect(list.length, DEMO_HINT).toBeGreaterThan(0);
      for (const row of list) {
        expect(row.rides, `liczba jazd w „${row.text}”`).toBeGreaterThan(0);
        expect(row.amount, `kwota w „${row.text}”`).toBe(row.rides * 12345);
      }
      const sum = list.reduce((acc, row) => acc + (row.amount ?? 0), 0);
      expect(grosze(await total.innerText())).toBe(sum);
    });

    await test.step("zaplanowana zmiana od następnego miesiąca nie zmienia kwot i daje się usunąć", async () => {
      const before = await total.innerText();
      await rateRegion.getByLabel("Nowa stawka (zł)").fill("150");
      await rateRegion.getByRole("radio", { name: /^Od następnego miesiąca/ }).check();
      await rateRegion.getByRole("button", { name: "Zapisz stawkę", exact: true }).click();
      await page.waitForURL(/sukces=1/);

      const planned = rateRegion.getByText(/^od \S+ \d{4}: 150,00\szł$/);
      await expect(planned).toBeVisible();
      await expect(rateRegion.getByText(/^123,45\szł$/)).toBeVisible();
      await expect(total).toHaveText(before);

      await rateRegion.getByRole("button", { name: "Usuń zaplanowaną zmianę", exact: true }).click();
      await page.waitForURL(/sukces=1/);
      await expect(planned).toHaveCount(0);
      await expect(rateRegion.getByRole("button", { name: "Usuń zaplanowaną zmianę" })).toHaveCount(0);
      await expect(total).toHaveText(before);
    });
  });

  test("Rozliczenia mieszczą się w telefonie bez poziomego przewijania", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE);
    await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "strona jest szersza niż ekran 390 px").toBeLessThanOrEqual(0);
  });
});

test.describe("Rozliczenia tylko dla właściciela", () => {
  test.use({ storageState: RIDER_A_STATE });

  test("jeździec nie wchodzi na stronę „Rozliczenia”", async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page).not.toHaveURL(new RegExp(ROUTE));
    await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toHaveCount(0);
  });

  test("instruktor z kontem nie wchodzi na stronę „Rozliczenia”", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await signIn(page, INSTRUCTOR_EMAIL, "/instruktor");
      await page.goto(ROUTE);
      await page.waitForURL("**/instruktor");
      await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
