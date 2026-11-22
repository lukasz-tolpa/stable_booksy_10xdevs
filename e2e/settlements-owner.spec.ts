import { expect, test } from "@playwright/test";
import {
  calendarRideDays,
  clearStableRates,
  DEMO_HINT,
  emptySettlementsMonth,
  grosze,
  INSTRUCTOR_EMAIL,
  otherRidersToggle,
  RIDER_A_STATE,
  RIDER_SETTLEMENT_URL,
  riderBreakdown,
  riderCalendar,
  riderCostsRegion,
  settlementCard,
  settlementRiders,
  settlementRows,
  SETTLEMENTS_ROUTE,
  showAllRides,
  signIn,
  STABLE_STATE,
} from "./helpers";

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
 *
 * Rozliczenie jeźdźca (#95): wiersz listy prowadzi do rozliczenia tego samego miesiąca; liczba jazd
 * zgadza się z listą jazd i z wierszem listy, kwota = N × stawka, „Do zapłaty” = kwota za jazdy.
 * Kalendarz (#110): liczby w dniach sumują się do N, a dzień prowadzi do zapisów tego dnia.
 */
test.describe("Rozliczenia właściciela", () => {
  test.use({ storageState: STABLE_STATE });
  test.beforeAll(clearStableRates);
  test.afterAll(clearStableRates);

  test("właściciel ustawia stawkę ośrodka: kwota jeźdźca = liczba jazd × stawka, „Razem” = suma wierszy", async ({
    page,
  }) => {
    const empty = emptySettlementsMonth(page);
    const total = page.getByText(/^Razem: /);
    const rateRegion = page.getByRole("region", { name: "Stawka ośrodka" });

    await test.step("przed pierwszą stawką strona prosi o nią, a lista nie ma kwot", async () => {
      await page.goto(SETTLEMENTS_ROUTE);
      await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toBeVisible();
      await expect(rateRegion.getByText("Ustaw stawkę ośrodka", { exact: true })).toBeVisible();
      if (await empty.isVisible()) {
        await page.getByRole("navigation", { name: "Wybór miesiąca" }).getByRole("link", { name: "Poprzedni" }).click();
        await page.waitForURL(/miesiac=\d{4}-\d{2}$/);
      }
      await expect(settlementRiders(page).first(), DEMO_HINT).toBeVisible();
      await expect(page.getByText("Kwoty pojawią się po ustawieniu stawki ośrodka.")).toBeVisible();
      await expect(total).toHaveCount(0);
      expect((await settlementRows(page)).every((row) => row.amount === null)).toBe(true);
    });

    await test.step("rozliczenie jeźdźca przed pierwszą stawką prosi o nią zamiast kwot", async () => {
      const listUrl = page.url();
      await settlementRiders(page).first().getByRole("link").click();
      await page.waitForURL(RIDER_SETTLEMENT_URL);
      const card = settlementCard(page);
      await expect(card.getByRole("link", { name: "Ustaw stawkę ośrodka", exact: true })).toBeVisible();
      await expect(card.getByText("Do zapłaty")).toHaveCount(0);
      await page.goto(listUrl);
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

      const list = await settlementRows(page);
      expect(list.length, DEMO_HINT).toBeGreaterThan(0);
      for (const row of list) {
        expect(row.rides, `liczba jazd w „${row.text}”`).toBeGreaterThan(0);
        expect(row.amount, `kwota w „${row.text}”`).toBe(row.rides * 12345);
      }
      const sum = list.reduce((acc, row) => acc + (row.amount ?? 0), 0);
      expect(grosze(await total.innerText())).toBe(sum);
    });

    await test.step("rozliczenie jeźdźca: jazdy z listy jazd = wiersz listy, kwota = N × stawka = „Do zapłaty”", async () => {
      const listUrl = page.url();
      const [first] = await settlementRows(page);
      await settlementRiders(page).first().getByRole("link").click();
      await page.waitForURL(RIDER_SETTLEMENT_URL);
      if (month !== null) {
        expect(new URL(page.url()).searchParams.get("miesiac"), "ten sam miesiąc co lista").toBe(month);
      }

      const name = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
      expect(first.text.startsWith(name), `wiersz listy „${first.text}” to jeździec „${name}”`).toBe(true);
      const card = settlementCard(page);
      const rides = await (await showAllRides(page, name)).getByRole("listitem").count();
      expect(rides, "liczba jazd na liście jazd = liczba jazd w wierszu listy").toBe(first.rides);
      await expect(page.getByText(`Pokaż wszystkie jazdy (${String(rides)})`, { exact: true })).toBeVisible();

      const line = card.getByText(/^Jazdy: \d+ × /);
      await expect(line).toHaveText(new RegExp(`^Jazdy: ${String(rides)} × 123,45\\szł = `));
      expect(grosze((await line.innerText()).split("=")[1] ?? "")).toBe(rides * 12345);
      await expect(card.getByText("stawka ośrodka", { exact: true })).toBeVisible();
      // „Do zapłaty” i kwota (pogrubiona) to osobne elementy; jedyny element z samą kwotą to „Do zapłaty”.
      await expect(card.getByText("Do zapłaty", { exact: true })).toBeVisible();
      expect(grosze(await card.getByText(/^\d[\d\s]*,\d{2}\szł$/).innerText())).toBe(rides * 12345);

      await page.getByRole("link", { name: "Wróć do rozliczeń" }).click();
      await page.waitForURL(/\/osrodek\/rozliczenia\?miesiac=/);
      expect(new URL(page.url()).searchParams.get("miesiac")).toBe(new URL(listUrl).searchParams.get("miesiac"));
    });

    await test.step("kalendarz jeźdźca: jazdy w dniach sumują się do „Jazdy: N”, dzień prowadzi do jego zapisów", async () => {
      const listUrl = page.url();
      await settlementRiders(page).first().getByRole("link").click();
      await page.waitForURL(RIDER_SETTLEMENT_URL);
      const name = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
      const rides = Number(
        /^Jazdy: (\d+) × /.exec(
          await settlementCard(page)
            .getByText(/^Jazdy: \d+ × /)
            .innerText(),
        )?.[1],
      );

      const days = await calendarRideDays(page);
      expect(days.length, DEMO_HINT).toBeGreaterThan(0);
      expect(
        days.reduce((sum, day) => sum + day.rides, 0),
        "suma jazd w dniach kalendarza = „Jazdy: N”",
      ).toBe(rides);
      await expect(riderBreakdown(page).getByRole("list", { name: "Instruktorzy" })).toBeVisible();

      // Najwcześniejszy dzień z jazdami jest miniony, więc każdy aktywny zapis jeźdźca tego dnia to jazda.
      const [first] = days;
      expect(first.href).toMatch(/^\/osrodek\/zapisy\?dzien=\d{4}-\d{2}-\d{2}$/);
      await riderCalendar(page).getByRole("link", { name: first.label, exact: true }).click();
      await page.waitForURL(`**${first.href}`);
      await expect(page.getByRole("heading", { level: 1, name: "Zapisy dnia" })).toBeVisible();
      // Data dnia w nawigacji dniami, np. „wtorek, 3 listopada 2026”, to dzień z opisu pola „3 listopada: 4 jazdy”.
      const dayMonth = first.label.split(":")[0];
      await expect(page.getByText(new RegExp(`, ${dayMonth} \\d{4}$`))).toBeVisible();
      const bookings = page
        .getByRole("region", { name: "Aktywne", exact: true })
        .getByRole("listitem")
        .filter({ has: page.getByText(name, { exact: true }) });
      await expect(bookings, "zapisy jeźdźca tego dnia = liczba w polu kalendarza").toHaveCount(first.rides);
      await page.goto(listUrl);
    });

    await test.step("rozliczenie jeźdźca na telefonie: „Do zapłaty”, kalendarz, zestawienie, lista jazd, koszty, stawka — bez przewijania w bok", async () => {
      const listUrl = page.url();
      await page.setViewportSize({ width: 390, height: 844 });
      await settlementRiders(page).first().getByRole("link").click();
      await page.waitForURL(RIDER_SETTLEMENT_URL);

      // Kolejność czytania (Tab, czytnik ekranu) to kolejność w dokumencie — ma być tą samą co na ekranie.
      const blocks = [
        page.getByRole("heading", { level: 1 }),
        page.getByRole("navigation", { name: "Wybór miesiąca" }),
        settlementCard(page).getByText("Do zapłaty", { exact: true }),
        riderCalendar(page),
        riderBreakdown(page),
        page.getByText(/^Pokaż wszystkie jazdy \(\d+\)$/),
        riderCostsRegion(page),
        page.getByRole("region", { name: "Stawka jeźdźca" }),
      ];
      for (const block of blocks) await expect(block).toBeVisible();
      const handles = await Promise.all(blocks.map((block) => block.elementHandle()));
      const inOrder = await page.evaluate(
        (elements) =>
          elements
            .slice(1)
            .every(
              (element, i) => (elements[i].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
            ),
        handles,
      );
      expect(inOrder, "kolejność bloków w dokumencie").toBe(true);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, "strona jest szersza niż ekran 390 px").toBeLessThanOrEqual(0);

      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(listUrl);
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

  test("nieznany jeździec w adresie to spokojny stan „Nie ma takiego jeźdźca.”", async ({ page }) => {
    for (const rider of ["00000000-0000-4000-8000-000000000000", "anna"]) {
      await page.goto(`${SETTLEMENTS_ROUTE}/${rider}`);
      await expect(page.getByText("Nie ma takiego jeźdźca.", { exact: true })).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
  });

  test("na telefonie jedna kolumna czytana po kolei: miesiąc i suma, karty, pozostali jeźdźcy, stawka — bez przewijania w bok", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(SETTLEMENTS_ROUTE);
    await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toBeVisible();
    const monthNav = page.getByRole("navigation", { name: "Wybór miesiąca" });
    if (await emptySettlementsMonth(page).isVisible()) {
      await monthNav.getByRole("link", { name: "Poprzedni" }).click();
      await page.waitForURL(/miesiac=\d{4}-\d{2}$/);
    }
    await expect(settlementRiders(page).first(), DEMO_HINT).toBeVisible();

    // Kolejność czytania (Tab, czytnik ekranu) to kolejność w dokumencie — ma być tą samą co na ekranie.
    // „Pozostali jeźdźcy ośrodka” są tylko, gdy jakiś jeździec ośrodka nie ma jazd w miesiącu (zależy od
    // kont założonych przez wcześniejsze scenariusze).
    const others = otherRidersToggle(page);
    const blocks = [
      monthNav,
      page.getByRole("heading", { level: 2, name: "Do zapłaty razem" }),
      settlementRiders(page).first(),
      ...((await others.count()) > 0 ? [others] : []),
      page.getByRole("region", { name: "Stawka ośrodka" }),
    ];
    const handles = await Promise.all(blocks.map((block) => block.elementHandle()));
    const inOrder = await page.evaluate(
      (elements) =>
        elements
          .slice(1)
          .every(
            (element, i) => (elements[i].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
          ),
      handles,
    );
    expect(inOrder, "kolejność bloków w dokumencie").toBe(true);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "strona jest szersza niż ekran 390 px").toBeLessThanOrEqual(0);
  });
});

test.describe("Rozliczenia tylko dla właściciela", () => {
  test.use({ storageState: RIDER_A_STATE });

  test("jeździec nie wchodzi na stronę „Rozliczenia”", async ({ page }) => {
    await page.goto(SETTLEMENTS_ROUTE);
    await expect(page).not.toHaveURL(new RegExp(SETTLEMENTS_ROUTE));
    await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toHaveCount(0);
  });

  test("jeździec nie wchodzi do rozliczenia jeźdźca", async ({ page }) => {
    await page.goto(`${SETTLEMENTS_ROUTE}/00000000-0000-4000-8000-000000000000`);
    await expect(page).not.toHaveURL(new RegExp(SETTLEMENTS_ROUTE));
    await expect(page.getByText("Nie ma takiego jeźdźca.")).toHaveCount(0);
  });

  test("instruktor z kontem nie wchodzi na stronę „Rozliczenia”", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await signIn(page, INSTRUCTOR_EMAIL, "/instruktor");
      await page.goto(SETTLEMENTS_ROUTE);
      await page.waitForURL("**/instruktor");
      await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});
