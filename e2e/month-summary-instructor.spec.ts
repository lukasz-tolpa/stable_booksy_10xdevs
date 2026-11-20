import { expect, test, type Page } from "@playwright/test";
import { INSTRUCTOR_EMAIL, STABLE_STATE, signIn } from "./helpers";

/**
 * Podsumowanie miesiąca instruktorki z kontem (`/instruktor/podsumowanie`, #90) na minionej historii
 * demo (`supabase/demo/history.sql`, ładuje ją setup). Joanna Wrona wchodzi zakładką „Podsumowanie
 * miesiąca” i widzi wyłącznie jazdy ze swoich slotów. Wyrocznią jest perspektywa właściciela, nie
 * konkretne liczby (historia liczy się od dnia załadowania): jazd na liście Joanny jest dokładnie tyle,
 * ile jazd z jej nazwiskiem w podsumowaniu właściciela za ten sam miesiąc. Jazdy jeźdźców
 * zanonimizowanych u właściciela nie mają instruktora, więc porównanie obejmuje rozwijane listy jazd.
 * Tylko odczyt.
 */
const INSTRUCTOR_NAME = "Joanna Wrona";
const OTHER_INSTRUCTOR = "Karol Jasny";
const SUMMARY_ROUTE = "/instruktor/podsumowanie";
const OWNER_SUMMARY_ROUTE = "/osrodek/podsumowanie";
const DEMO_HINT = "Brak minionej historii demo — uruchom: npm run db:demo";
const TOTAL = /^(\d+) jazd\S* · \d+ jeźdźc\S*$/;

function monthNav(page: Page) {
  return page.getByRole("navigation", { name: "Wybór miesiąca" });
}

/** Jazdy na rozwijanych listach jeźdźców (także zwiniętych) — jedna pozycja na jazdę. */
function rideItems(page: Page) {
  return page
    .getByRole("list", { name: /^Jazdy — /, includeHidden: true })
    .getByRole("listitem", { includeHidden: true });
}

test("instruktorka z kontem widzi w zakładce „Podsumowanie miesiąca” tylko jazdy ze swoich slotów", async ({
  page,
  browser,
}) => {
  const total = page.getByText(TOTAL);
  const empty = page.getByText(/^We? .+ nie było jazd na Twoich slotach\.$/);
  let month = "";

  await test.step("zakładka „Podsumowanie miesiąca” obok „Moje sloty” prowadzi do podsumowania", async () => {
    await signIn(page, INSTRUCTOR_EMAIL, "/instruktor");
    const tabs = page.getByRole("navigation", { name: "Przestrzeń instruktora", exact: true });
    await expect(tabs.getByRole("link", { name: "Moje sloty", exact: true })).toBeVisible();
    // Bez uprawnienia do układania grafiku — bez zakładki „Grafik”.
    await expect(tabs.getByRole("link", { name: "Grafik", exact: true })).toHaveCount(0);

    await tabs.getByRole("link", { name: "Podsumowanie miesiąca", exact: true }).click();
    await page.waitForURL(`**${SUMMARY_ROUTE}`);
    await expect(page.getByRole("heading", { level: 1, name: "Podsumowanie miesiąca" })).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Podsumowanie miesiąca", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(monthNav(page).getByRole("link", { name: "Następny" })).toHaveCount(0);
  });

  await test.step("bez jazd w bieżącym miesiącu rozliczany jest poprzedni", async () => {
    if (await empty.isVisible()) {
      await monthNav(page).getByRole("link", { name: "Poprzedni" }).click();
      await page.waitForURL(/miesiac=\d{4}-\d{2}$/);
    }
    await expect(total, DEMO_HINT).toBeVisible();
    month = new URL(page.url()).searchParams.get("miesiac") ?? "";
  });

  const ownRides = await rideItems(page).count();

  await test.step("liczba jazd każdego jeźdźca równa się liście jego dat; bez instruktora i bez linków", async () => {
    expect(ownRides, DEMO_HINT).toBeGreaterThan(0);
    const rider = page.getByRole("list", { name: "Jeźdźcy" }).getByRole("listitem").first();
    const [, riderName = "", riderRides = ""] = /^\s*(.+?)\s+(\d+) jazd/s.exec(await rider.innerText()) ?? [];
    expect(riderName, "pierwszy wiersz jeźdźca ma nazwę i liczbę jazd").not.toBe("");
    await rider.getByText(riderName, { exact: true }).click();
    const rides = page.getByRole("list", { name: `Jazdy — ${riderName}` });
    await expect(rides.getByRole("listitem")).toHaveCount(Number(riderRides));
    // Data jazdy to tekst — Zapisy dnia są w przestrzeni ośrodka.
    await expect(rides.getByRole("link")).toHaveCount(0);

    // Widok instruktora nie ma kolumny instruktora — ani jej, ani cudzej.
    await expect(rideItems(page).filter({ hasText: INSTRUCTOR_NAME })).toHaveCount(0);
    await expect(rideItems(page).filter({ hasText: OTHER_INSTRUCTOR })).toHaveCount(0);
  });

  await test.step("u właściciela ten sam miesiąc ma dokładnie tyle jazd z nazwiskiem Joanny", async () => {
    const ownerContext = await browser.newContext({ storageState: STABLE_STATE });
    try {
      const owner = await ownerContext.newPage();
      await owner.goto(month ? `${OWNER_SUMMARY_ROUTE}?miesiac=${month}` : OWNER_SUMMARY_ROUTE);
      await expect(owner.getByText(TOTAL)).toBeVisible();
      await expect(rideItems(owner).filter({ hasText: INSTRUCTOR_NAME })).toHaveCount(ownRides);
      // Kontrola wyroczni: u właściciela są też jazdy innego instruktora, których Joanna nie widzi.
      expect(await rideItems(owner).filter({ hasText: OTHER_INSTRUCTOR }).count()).toBeGreaterThan(0);
    } finally {
      await ownerContext.close();
    }
  });
});
