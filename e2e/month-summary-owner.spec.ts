import { expect, test, type Page } from "@playwright/test";
import { STABLE_STATE } from "./helpers";

/**
 * Podsumowanie miesiąca właściciela (`/osrodek/podsumowanie`, #88) na minionej historii demo, którą
 * ładuje setup (`supabase/demo/history.sql`). Wyrocznią jest spójność, nie konkretne liczby, bo
 * historia liczy się od dnia załadowania: liczba jazd na panelu równa się sumie strony, liczba jazd
 * jeźdźca — długości listy jego dat, a data jazdy prowadzi do Zapisów dnia, na których ten jeździec jest.
 *
 * Historia sięga 24 dni wstecz, więc pierwszego dnia miesiąca bieżący miesiąc nie ma jeszcze jazd —
 * scenariusz rozlicza wtedy poprzedni miesiąc.
 */
test.use({ storageState: STABLE_STATE });

const DEMO_HINT = "Brak minionej historii demo — uruchom: npm run db:demo";
const SUMMARY_ROUTE = "/osrodek/podsumowanie";
const TOTAL = /^(\d+) jazd\S* · \d+ jeźdźc\S*$/;

function monthNav(page: Page) {
  return page.getByRole("navigation", { name: "Wybór miesiąca" });
}

/** Miesiąc `RRRR-MM` przesunięty o `offset` — jak w aplikacji, w UTC. */
function shiftMonth(month: string, offset: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + offset, 1)).toISOString().slice(0, 7);
}

test("właściciel rozlicza miesiąc: liczba jazd jeźdźca równa się liście dat, data prowadzi do Zapisów dnia, ‹ zmienia miesiąc", async ({
  page,
}) => {
  const total = page.getByText(TOTAL);
  const empty = page.getByText(/^W .+ nie było jazd\.$/);

  await test.step("wejście z bocznej kolumny panelu, gdzie liczba jazd miesiąca równa się sumie podsumowania", async () => {
    await page.goto("/osrodek");
    const link = page
      .getByRole("navigation", { name: "Ośrodek" })
      .getByRole("link", { name: /^Podsumowanie miesiąca \S+: \d+ jazd/ });
    const fact = /(\d+) jazd/.exec(await link.innerText());
    expect(fact, "boczna kolumna podaje liczbę jazd miesiąca").not.toBeNull();
    const panelRides = Number(fact?.[1]);

    await link.click();
    await page.waitForURL(`**${SUMMARY_ROUTE}`);
    await expect(page.getByRole("heading", { level: 1, name: "Podsumowanie miesiąca" })).toBeVisible();
    // Bieżący miesiąc: strzałka „Następny” nieaktywna (nie jest linkiem).
    await expect(monthNav(page).getByRole("link", { name: "Następny" })).toHaveCount(0);

    if (panelRides === 0) {
      await expect(empty).toBeVisible();
    } else {
      await expect(total).toHaveText(new RegExp(`^${String(panelRides)} jazd`));
    }
  });

  await test.step("bez jazd w bieżącym miesiącu rozliczany jest poprzedni", async () => {
    if (await empty.isVisible()) {
      await monthNav(page).getByRole("link", { name: "Poprzedni" }).click();
      await page.waitForURL(/miesiac=\d{4}-\d{2}$/);
    }
    await expect(total, DEMO_HINT).toBeVisible();
  });

  const riders = page.getByRole("list", { name: "Jeźdźcy" });
  const rider = riders.getByRole("listitem").first();
  // Wiersz jeźdźca: nazwa, potem liczba jazd, np. „Anna Kowalska 12 jazd”.
  const [, riderName = "", riderRides = ""] = /^\s*(.+?)\s+(\d+) jazd/s.exec(await rider.innerText()) ?? [];
  const rides = page.getByRole("list", { name: `Jazdy — ${riderName}` });

  await test.step("rozwinięty jeździec ma tyle dat jazd, ile podaje jego liczba jazd", async () => {
    expect(riderName, "pierwszy wiersz jeźdźca ma nazwę i liczbę jazd").not.toBe("");
    await rider.getByText(riderName, { exact: true }).click();
    await expect(rides).toBeVisible();
    await expect(rides.getByRole("listitem")).toHaveCount(Number(riderRides));
  });

  await test.step("data jazdy prowadzi do Zapisów tego dnia, na których jest ten jeździec", async () => {
    const date = rides.getByRole("link").first();
    const href = (await date.getAttribute("href")) ?? "";
    expect(href).toMatch(/^\/osrodek\/zapisy\?dzien=\d{4}-\d{2}-\d{2}$/);
    await date.click();
    await page.waitForURL(`**${href}`);
    await expect(page.getByRole("heading", { level: 1, name: "Zapisy dnia" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Aktywne" }).getByText(riderName).first()).toBeVisible();
    await page.goBack();
    await expect(total).toBeVisible();
  });

  await test.step("‹ przechodzi na poprzedni miesiąc: zmienia adres, etykietę i listę", async () => {
    const label = await monthNav(page).innerText();
    const current = new URL(page.url()).searchParams.get("miesiac") ?? new Date().toISOString().slice(0, 7);
    const previous = shiftMonth(current, -1);

    await monthNav(page).getByRole("link", { name: "Poprzedni" }).click();
    await page.waitForURL(`**${SUMMARY_ROUTE}?miesiac=${previous}`);
    await expect(monthNav(page)).not.toHaveText(label);
    await expect(monthNav(page).getByRole("link", { name: "Następny" })).toHaveAttribute(
      "href",
      `${SUMMARY_ROUTE}?miesiac=${current}`,
    );
    // Lista to jazdy poprzedniego miesiąca — każda data prowadzi do dnia z tego miesiąca — albo stan pusty.
    if (!(await empty.isVisible())) {
      const dates = page.getByRole("link", { name: /^\S+ \d+ \S+$/, includeHidden: true });
      for (const href of await dates.evaluateAll((links) => links.map((link) => link.getAttribute("href")))) {
        expect(href).toContain(`dzien=${previous}-`);
      }
    }
  });
});

test("Statystyki prowadzą do Podsumowania miesiąca", async ({ page }) => {
  await page.goto("/osrodek/statystyki");
  await page.getByRole("link", { name: "Podsumowanie miesiąca", exact: true }).click();
  await page.waitForURL(`**${SUMMARY_ROUTE}`);
  await expect(page.getByRole("heading", { level: 1, name: "Podsumowanie miesiąca" })).toBeVisible();
});

test("Podsumowanie miesiąca mieści się w telefonie bez poziomego przewijania, także z rozwiniętym jeźdźcem", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(SUMMARY_ROUTE);
  await expect(page.getByRole("heading", { level: 1, name: "Podsumowanie miesiąca" })).toBeVisible();
  const rider = page.getByRole("list", { name: "Jeźdźcy" }).getByRole("listitem").first();
  if (await rider.isVisible()) {
    await rider.click({ position: { x: 20, y: 20 } });
  }

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "strona jest szersza niż ekran 390 px").toBeLessThanOrEqual(0);
});
