import { expect, test } from "@playwright/test";
import { STABLE_NAME, STABLE_STATE, asError, signIn } from "./helpers";

/**
 * Podsumowanie miesiąca jeźdźca (`/jezdziec/podsumowanie`, #91): Anna Kowalska z historią demo
 * (`supabase/demo/history.sql`, ładuje ją setup) wchodzi z linku obok „Moje zapisy” i widzi swoje
 * jazdy w Stadninie Pod Dębem. Wyrocznią jest spójność, nie konkretne liczby (historia liczy się od
 * dnia załadowania): liczba jazd ośrodka równa się długości listy i liczbie jazd Anny w podsumowaniu
 * właściciela za ten sam miesiąc. Tylko odczyt.
 *
 * Historia sięga 24 dni wstecz, więc pierwszego dnia miesiąca bieżący miesiąc nie ma jeszcze jazd —
 * scenariusz bierze wtedy poprzedni miesiąc.
 */
const RIDER_EMAIL = "anna.kowalska@example.com";
const RIDER = "Anna Kowalska";
const DEMO_HINT = "Brak minionej historii demo — uruchom: npm run db:demo";
const SUMMARY_ROUTE = "/jezdziec/podsumowanie";

test("jeździec otwiera Podsumowanie miesiąca z linku obok „Moje zapisy” i widzi swoje jazdy w ośrodku", async ({
  page,
  browser,
}) => {
  const monthNav = page.getByRole("navigation", { name: "Wybór miesiąca" });
  const empty = page.getByText(/^We? .+ nie jeździłeś\.$/);
  const stable = page.getByRole("region", { name: STABLE_NAME });
  const rides = stable.getByRole("list", { name: `Jazdy — ${STABLE_NAME}` });
  let riderRides = 0;

  await test.step("link „Podsumowanie miesiąca” obok „Moje zapisy” prowadzi do bieżącego miesiąca", async () => {
    await signIn(page, RIDER_EMAIL, "/jezdziec");
    await expect(page.getByRole("link", { name: "Moje zapisy", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Podsumowanie miesiąca", exact: true }).click();
    await page.waitForURL(`**${SUMMARY_ROUTE}`);
    await expect(page.getByRole("heading", { level: 1, name: "Podsumowanie miesiąca" })).toBeVisible();
    // Bieżący miesiąc: strzałka „Następny” nieaktywna (nie jest linkiem).
    await expect(monthNav.getByRole("link", { name: "Następny" })).toHaveCount(0);
  });

  await test.step("bez jazd w bieżącym miesiącu brany jest poprzedni", async () => {
    if (await empty.isVisible()) {
      await monthNav.getByRole("link", { name: "Poprzedni" }).click();
      await page.waitForURL(/miesiac=\d{4}-\d{2}$/);
    }
    await expect(stable, DEMO_HINT).toBeVisible();
  });

  await test.step("liczba jazd w ośrodku równa się liście jazd z datą, godziną, instruktorem i koniem", async () => {
    const count = /(\d+) jazd/.exec(await stable.getByText(/^\d+ jazd\S*$/).innerText());
    expect(count, "ośrodek podaje liczbę jazd").not.toBeNull();
    riderRides = Number(count?.[1]);
    expect(riderRides).toBeGreaterThan(0);
    await expect(rides.getByRole("listitem")).toHaveCount(riderRides);
    // Jazda: data z dniem tygodnia, godzina i instruktor z historii demo (koń albo „bez konia” obok).
    const first = rides.getByRole("listitem").first();
    await expect(first).toContainText(/\S+, \d+ \S+/);
    await expect(first).toContainText(/\d{1,2}:00/);
    await expect(first).toContainText(/Joanna Wrona|Karol Jasny/);
  });

  await test.step("ta sama liczba jazd Anny w podsumowaniu właściciela za ten sam miesiąc", async () => {
    const month = new URL(page.url()).searchParams.get("miesiac");
    const ownerContext = await browser.newContext({ storageState: STABLE_STATE });
    let failure: Error | undefined;
    try {
      const owner = await ownerContext.newPage();
      await owner.goto(month ? `/osrodek/podsumowanie?miesiac=${month}` : "/osrodek/podsumowanie");
      const row = owner
        .getByRole("list", { name: "Jeźdźcy" })
        .getByRole("listitem")
        .filter({ has: owner.getByText(RIDER, { exact: true }) });
      await expect(row).toContainText(new RegExp(`^\\s*${RIDER}\\s+${String(riderRides)} jazd`));
    } catch (error) {
      failure = asError(error);
    } finally {
      await ownerContext.close();
    }
    if (failure) {
      throw failure;
    }
  });
});

test("Podsumowanie miesiąca jeźdźca mieści się w telefonie bez poziomego przewijania", async ({ page }) => {
  await signIn(page, RIDER_EMAIL, "/jezdziec");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(SUMMARY_ROUTE);
  await expect(page.getByRole("heading", { level: 1, name: "Podsumowanie miesiąca" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "strona jest szersza niż ekran 390 px").toBeLessThanOrEqual(0);
});
