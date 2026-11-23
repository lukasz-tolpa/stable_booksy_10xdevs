import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
  clearStableRatesAndCosts,
  DEMO_HINT,
  RIDER_A_STATE,
  runSql,
  settlementCard,
  settlementRiders,
  SETTLEMENTS_ROUTE,
  setStableRate,
  showAllRides,
  STABLE_STATE,
} from "./helpers";

/**
 * PDF rozliczenia jeźdźca (#101, #102, spec #100) na minionej historii demo, którą ładuje setup. Wyrocznią jest
 * plik, nie jego tekst: „Pobierz PDF” pobiera `rozliczenie-RRRR-MM-anna-kowalska.pdf`, który zaczyna się od
 * `%PDF`. Zgodność treści z rozliczeniem gwarantuje wspólny model widoku (Vitest `document.test.ts`).
 *
 * Miesiąc to miesiąc sprzed tygodnia według bazy — historia demo ma w nim jazdy Anny także w pierwszych
 * dniach miesiąca. Stawkę ośrodka ustawia sam scenariusz (pierwsza stawka działa wstecz) i usuwa ją przed
 * i po sobie jako superuser (`clearStableRatesAndCosts`): pierwsza grupa testów pracuje bez stawki, druga
 * z nią.
 */
test.use({ storageState: STABLE_STATE });

/** Jeździec z seeda z jazdami w historii demo. */
const ANNA = { key: "33333333-3333-3333-3333-333333333333", name: "Anna Kowalska", slug: "anna-kowalska" };

/** Adres rozliczenia jeźdźca za miesiąc `RRRR-MM`. */
function riderUrl(rider: string, month: string): string {
  return `${SETTLEMENTS_ROUTE}/${rider}?miesiac=${month}`;
}

/** Adres PDF rozliczenia jeźdźca za miesiąc `RRRR-MM`. */
function pdfUrl(rider: string, month: string): string {
  return `${SETTLEMENTS_ROUTE}/${rider}/pdf?miesiac=${month}`;
}

/** Miesiąc `RRRR-MM` sprzed tygodnia według bazy. */
function monthWithRides(): string {
  return runSql("select to_char(current_date - 7, 'YYYY-MM');", "odczytać miesiąca", ["-At"]).trim();
}

/** Następny miesiąc `RRRR-MM` według bazy (`private.warsaw_month_start()`, ten sam co aplikacji) — przyszły. */
function nextMonth(): string {
  return runSql(
    "select to_char(private.warsaw_month_start() + interval '1 month', 'YYYY-MM');",
    "odczytać następnego miesiąca",
    ["-At"],
  ).trim();
}

function pdfButton(page: Page) {
  return page.getByRole("link", { name: "Pobierz PDF" });
}

test.describe("PDF rozliczenia jeźdźca — ośrodek bez stawki", () => {
  test.beforeAll(clearStableRatesAndCosts);
  test.afterAll(clearStableRatesAndCosts);

  test("bez stawki ośrodka rozliczenie jeźdźca nie ma „Pobierz PDF”", async ({ page }) => {
    const card = settlementCard(page);

    await test.step("rozliczenie Anny ma jazdy i prośbę „Ustaw stawkę ośrodka”", async () => {
      await page.goto(riderUrl(ANNA.key, monthWithRides()));
      await expect(page.getByText(/^Pokaż wszystkie jazdy \(\d+\)$/), DEMO_HINT).toBeVisible();
      await showAllRides(page, ANNA.name);
      await expect(card.getByRole("link", { name: "Ustaw stawkę ośrodka" })).toBeVisible();
    });

    await test.step("przycisku „Pobierz PDF” nie ma", async () => {
      await expect(pdfButton(page)).toHaveCount(0);
    });
  });

  test("adres PDF bez stawki ośrodka wraca na stronę jeźdźca tego miesiąca, bez pliku i bez błędu", async ({
    page,
  }) => {
    const month = monthWithRides();

    await test.step("adres PDF otwiera stronę rozliczenia Anny za ten miesiąc", async () => {
      await page.goto(pdfUrl(ANNA.key, month));
      await expect(page).toHaveURL(riderUrl(ANNA.key, month));
    });

    await test.step("strona prosi o stawkę ośrodka i nie pokazuje błędu", async () => {
      await expect(settlementCard(page).getByRole("link", { name: "Ustaw stawkę ośrodka" })).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    });
  });

  test("adres PDF nieznanego jeźdźca to ta sama strona co rozliczenie: „Nie ma takiego jeźdźca.”", async ({ page }) => {
    const month = monthWithRides();
    for (const rider of ["00000000-0000-4000-8000-000000000000", "anna"]) {
      await test.step(`jeździec „${rider}” — strona rozliczenia z „Nie ma takiego jeźdźca.”`, async () => {
        await page.goto(pdfUrl(rider, month));
        await expect(page).toHaveURL(riderUrl(rider, month));
        await expect(page.getByText("Nie ma takiego jeźdźca.", { exact: true })).toBeVisible();
      });
    }
  });
});

test.describe("PDF rozliczenia jeźdźca — ośrodek ze stawką", () => {
  test.beforeAll(() => {
    clearStableRatesAndCosts();
    setStableRate(12345);
  });
  test.afterAll(clearStableRatesAndCosts);

  test("na liście „Rozliczenia” nie ma „Pobierz PDF”", async ({ page }) => {
    await test.step("lista jeźdźców miesiąca jest widoczna", async () => {
      await page.goto(`${SETTLEMENTS_ROUTE}?miesiac=${monthWithRides()}`);
      await expect(settlementRiders(page).first(), DEMO_HINT).toBeVisible();
    });

    await test.step("przycisku „Pobierz PDF” nie ma", async () => {
      await expect(pdfButton(page)).toHaveCount(0);
    });
  });

  test("adres PDF przyszłego miesiąca wraca na stronę jeźdźca tego miesiąca, bez pliku", async ({ page }) => {
    const future = nextMonth();

    await test.step("adres PDF otwiera stronę rozliczenia Anny, nie pobiera pliku", async () => {
      // Pobieranie zamiast strony kończy `goto` błędem „Download is starting”.
      await page.goto(pdfUrl(ANNA.key, future));
      await expect(page).toHaveURL(riderUrl(ANNA.key, future));
      await expect(page.getByRole("heading", { level: 1, name: ANNA.name })).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    });
  });

  test("„Pobierz PDF” pobiera plik PDF jeźdźca i miesiąca", async ({ page }) => {
    const month = monthWithRides();

    await test.step("rozliczenie Anny pokazuje „Do zapłaty” i „Pobierz PDF”", async () => {
      await page.goto(riderUrl(ANNA.key, month));
      await expect(settlementCard(page).getByText("Do zapłaty", { exact: true }), DEMO_HINT).toBeVisible();
      await expect(pdfButton(page)).toBeVisible();
    });

    await test.step("przycisk pobiera `rozliczenie-<miesiąc>-anna-kowalska.pdf` — plik PDF", async () => {
      const [file] = await Promise.all([page.waitForEvent("download"), pdfButton(page).click()]);
      expect(file.suggestedFilename()).toBe(`rozliczenie-${month}-${ANNA.slug}.pdf`);
      const bytes = await readFile(await file.path());
      expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    });
  });
});

test.describe("PDF rozliczenia tylko dla właściciela", () => {
  test.use({ storageState: RIDER_A_STATE });

  test("konto jeźdźca nie pobiera PDF rozliczenia — przekierowanie poza przestrzeń ośrodka", async ({ page }) => {
    await test.step("adres PDF przekierowuje poza „Rozliczenia”", async () => {
      const response = await page.request.get(pdfUrl(ANNA.key, monthWithRides()), { maxRedirects: 0 });
      expect(response.status()).toBe(302);
      expect(response.headers().location).not.toMatch(new RegExp(SETTLEMENTS_ROUTE));
    });
  });

  test("bez sesji adres PDF prowadzi do logowania", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      await test.step("adres PDF przekierowuje do logowania", async () => {
        const response = await context.request.get(pdfUrl(ANNA.key, monthWithRides()), { maxRedirects: 0 });
        expect(response.status()).toBe(302);
        expect(response.headers().location).toMatch(/\/auth\/signin/);
      });
    } finally {
      await context.close();
    }
  });
});
