import { expect, test, type Page } from "@playwright/test";
import { RIDER_A_STATE, STABLE_NAME, STABLE_STATE, runSql, signIn } from "./helpers";

/**
 * Konie pensjonatowe i pobyt (#114, spec #112): właściciel dodaje konia pensjonatowego, wskazując
 * pensjonariuszkę z seeda (Katarzyna Zając) po adresie e-mail jej konta; ona widzi konia w „Moich koniach”
 * i kończy pobyt; właściciel widzi dzień wyjazdu i to, kto go wpisał. Adres bez konta jeźdźca daje polską
 * odmowę. Jeździec bez konia pensjonatowego nie ma „Moich koni” w nawigacji.
 *
 * Koń scenariusza ma imię z prefiksem `E2E Pensjonat`; superuser usuwa takie konie przed i po scenariuszu
 * (kaskada usuwa właściciela i pobyty), więc seed zostaje jak był — także po przerwanym biegu.
 */
test.use({ storageState: STABLE_STATE });

const BOARDER_EMAIL = "katarzyna.zajac@example.com";
const BOARDER_NAME = "Katarzyna Zając";
const BOARDERS_ROUTE = "/osrodek/pensjonariusze";
const HORSE_PREFIX = "E2E Pensjonat";

function removeScenarioHorses(): void {
  runSql(
    `delete from public.horses h using public.stables s
     where s.id = h.stable_id and s.name = '${STABLE_NAME}' and h.name like '${HORSE_PREFIX}%';`,
    "usunąć koni pensjonatowych scenariusza",
  );
}

/** Dziś w strefie ośrodka, tak jak pisze go strona: `22 listopada 2026`. */
function todayText(): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Warsaw",
  }).format(new Date());
}

function horseCard(page: Page, horse: string) {
  return page.getByRole("article", { name: horse });
}

function staysOf(page: Page, horse: string) {
  return page.getByRole("list", { name: `Pobyty — ${horse}` }).getByRole("listitem");
}

test.beforeAll(removeScenarioHorses);
test.afterAll(removeScenarioHorses);

test("właściciel dodaje konia pensjonatowego po e-mailu, pensjonariuszka kończy pobyt, właściciel widzi, kto wpisał wyjazd", async ({
  page,
  browser,
}) => {
  const horse = `${HORSE_PREFIX} ${String(Date.now()).slice(-6)}`;
  const today = todayText();

  await test.step("strona „Pensjonariusze” pokazuje pensjonariuszkę z seeda z koniem w pobycie", async () => {
    await page.goto(BOARDERS_ROUTE);
    await expect(page.getByRole("heading", { level: 1, name: "Pensjonariusze" })).toBeVisible();
    const boarder = page
      .getByRole("list", { name: "Pensjonariusze" })
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { level: 2, name: BOARDER_NAME }) });
    await expect(boarder.getByText(BOARDER_EMAIL, { exact: true })).toBeVisible();
    await expect(horseCard(page, "Hrabia").getByText("w ośrodku", { exact: true })).toBeVisible();
    await expect(staysOf(page, "Hrabia").first()).toContainText("— trwa");
  });

  await test.step("adres bez konta jeźdźca daje odmowę: pensjonariusz musi najpierw założyć konto", async () => {
    await page.getByLabel("Imię konia").fill(horse);
    await page.getByLabel("Adres e-mail pensjonariusza").fill("nikt-taki@example.com");
    await page.getByRole("button", { name: "Dodaj konia pensjonatowego" }).click();
    await page.waitForURL(/error=/);
    await expect(page.getByRole("alert")).toHaveText(
      "Pod tym adresem e-mail nie ma konta jeźdźca. Pensjonariusz musi najpierw założyć konto w getona.horse.",
    );
    await expect(horseCard(page, horse)).toHaveCount(0);
  });

  await test.step("właściciel dodaje konia pensjonatowego z dniem przyjazdu dziś", async () => {
    await page.getByLabel("Imię konia").fill(horse);
    await page.getByLabel("Adres e-mail pensjonariusza").fill(BOARDER_EMAIL);
    await page.getByRole("button", { name: "Dodaj konia pensjonatowego" }).click();
    await page.waitForURL(/sukces=kon/);
    await expect(horseCard(page, horse).getByText("w ośrodku", { exact: true })).toBeVisible();
    await expect(staysOf(page, horse)).toHaveText([`od ${today} — trwa`]);
  });

  const boarderContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const boarder = await boarderContext.newPage();
  try {
    await test.step("pensjonariuszka widzi konia w „Moich koniach” i kończy pobyt dziś", async () => {
      await signIn(boarder, BOARDER_EMAIL, "/jezdziec");
      await boarder.getByRole("link", { name: "Moje konie", exact: true }).click();
      await boarder.waitForURL("**/jezdziec/konie");
      const card = horseCard(boarder, horse);
      await expect(card.getByText(STABLE_NAME, { exact: true })).toBeVisible();
      await expect(staysOf(boarder, horse)).toHaveText([`od ${today} — trwa`]);

      const form = boarder.getByRole("form", { name: `Zakończ pobyt — ${horse}` });
      await expect(form.getByLabel("Dzień wyjazdu")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
      await form.getByRole("button", { name: "Zakończ pobyt" }).click();
      await boarder.waitForURL(/sukces=wyjazd/);

      await expect(card.getByText("wyjechał", { exact: true })).toBeVisible();
      await expect(staysOf(boarder, horse)).toHaveCount(1);
      await expect(staysOf(boarder, horse)).toContainText([`${today} – ${today}`]);
      await expect(staysOf(boarder, horse)).toContainText(["dzień wyjazdu wpisany przez Ciebie"]);
      await expect(boarder.getByRole("form", { name: `Popraw dzień wyjazdu — ${horse}` })).toBeVisible();
    });
  } finally {
    await boarderContext.close();
  }

  await test.step("właściciel widzi dzień wyjazdu i to, że wpisała go pensjonariuszka", async () => {
    await page.goto(BOARDERS_ROUTE);
    await expect(horseCard(page, horse).getByText("wyjechał", { exact: true })).toBeVisible();
    await expect(staysOf(page, horse)).toHaveCount(1);
    await expect(staysOf(page, horse)).toContainText([`${today} – ${today}`]);
    await expect(staysOf(page, horse)).toContainText(["dzień wyjazdu wpisany przez pensjonariusza"]);
    // Koń, który wyjechał, może wrócić: „Nowy pobyt” jest zwinięty, a dzień przyjazdu zaczyna się po wyjeździe.
    await horseCard(page, horse).getByText("Nowy pobyt", { exact: true }).click();
    const newStay = page.getByRole("form", { name: `Nowy pobyt — ${horse}` });
    await expect(newStay.getByLabel("Dzień przyjazdu")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
    await expect(newStay.getByRole("button", { name: "Dodaj pobyt" })).toBeVisible();
  });
});

test("jeździec bez konia pensjonatowego nie ma „Moich koni” w nawigacji", async ({ browser }) => {
  const context = await browser.newContext({ storageState: RIDER_A_STATE });
  const page = await context.newPage();
  try {
    await page.goto("/jezdziec");
    await expect(page.getByRole("heading", { level: 1, name: "Ośrodki" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Moje zapisy", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Moje konie", exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
