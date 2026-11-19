import { expect, test } from "@playwright/test";
import { SEED_HINT, STABLE_NAME, STABLE_STATE, seedDay } from "./helpers";

/**
 * Panel ośrodka (`/osrodek`, #84, #85): właściciel Stadniny Pod Dębem widzi najbliższe 7 dni,
 * liczby z ostatnich 30 dni i boczną kolumnę „Ośrodek”. Seed układa tylko jutro (z zapisem Anny
 * u Joanny o 11:00), więc jutro jest dniem ułożonym, a pozostałe dni tygodnia — „brak grafiku”.
 * Ostatnie 30 dni liczą minioną historię demo, którą ładuje setup; wyrocznią jest spójność ze
 * Statystykami tego samego okresu, nie konkretne liczby (historia liczy się od dnia załadowania). Liczby zapisów i miejsc nie są
 * przypięte: inne scenariusze zmieniają limity jutra i po sobie sprzątają.
 *
 * Panel liczy „dziś” w Europe/Warsaw, a seed jutro wg `current_date` bazy (UTC): między północą
 * w Warszawie a północą UTC jutro seeda jest dla panelu dniem dzisiejszym i ten scenariusz nie
 * znajdzie „Jutra” ułożonego.
 */
test.use({ storageState: STABLE_STATE });

const DEMO_HINT = "Brak minionej historii demo — uruchom: npm run db:demo";
const DAY_MS = 24 * 60 * 60 * 1000;

test("panel ośrodka pokazuje najbliższe 7 dni, ostatnie 30 dni i prowadzi do pięciu sekcji ośrodka", async ({
  page,
}) => {
  await page.goto("/osrodek");
  await expect(page.getByRole("heading", { level: 1, name: "Panel ośrodka" })).toBeVisible();
  await expect(page.getByText(STABLE_NAME, { exact: true })).toBeVisible();

  const week = page.getByRole("region", { name: "Najbliższe 7 dni" });
  const days = week.getByRole("listitem");

  await test.step("pasek ma 7 dni od dziś", async () => {
    await expect(days).toHaveCount(7);
    await expect(days.first().getByRole("link")).toContainText("Dziś");
  });

  await test.step("jutro jest dniem ułożonym z zapisami na miejsca i prowadzi do Zapisów tego dnia", async () => {
    const tomorrow = days.nth(1).getByRole("link");
    await expect(tomorrow, SEED_HINT).toContainText("Jutro");
    await expect(tomorrow, SEED_HINT).toContainText("ułożony");
    await expect(tomorrow).toHaveAccessibleName(/\d+ zapis\S* na \d+ miejsc/);
    await expect(tomorrow).toHaveAttribute("href", `/osrodek/zapisy?dzien=${seedDay()}`);
  });

  await test.step("podsumowanie tygodnia liczy zapisy na miejsca i dni bez grafiku", async () => {
    // Akapit podsumowania — sam tekst „… na … miejsc” powtarza też ukryty opis dnia w pasku.
    const summary = week.getByRole("paragraph");
    await expect(summary).toContainText(/\d+ zapis\S* na \d+ miejsc/);
    await expect(summary).toContainText(/\d+ (dzień|dni) bez grafiku/);
  });

  await test.step("dzień bez grafiku ma „Ułóż” i otwiera Grafik na ten dzień", async () => {
    const unscheduled = week.getByRole("link", { name: /brak grafiku/ }).first();
    await expect(unscheduled).toContainText("Ułóż");
    const href = await unscheduled.getAttribute("href");
    expect(href).toMatch(/^\/osrodek\/grafik\?dzien=\d{4}-\d{2}-\d{2}$/);
    await unscheduled.click();
    await page.waitForURL(`**${href ?? ""}`);
    await expect(page.getByRole("heading", { level: 1, name: "Grafik dnia" })).toBeVisible();
    await page.goBack();
  });

  await test.step("ostatnie 30 dni: kafelki z historii demo, wykres i „Pełne statystyki” z tym samym okresem", async () => {
    const month = page.getByRole("region", { name: "Ostatnie 30 dni" });
    await expect(month.getByRole("term")).toHaveText([
      "Godziny jazd",
      "Obłożenie grafiku",
      "Odwołania",
      "Najbardziej obciążony koń",
    ]);
    const tiles = month.getByRole("definition");
    await expect(tiles.nth(0), DEMO_HINT).toContainText(/[1-9]\d* h/);
    await expect(tiles.nth(1)).toContainText(/\d+%/);
    await expect(tiles.nth(2)).toContainText(/[1-9]\d*/);
    // Historia demo ma jazdy na Belli, Kasztanie i Iskrze — któryś z nich jest najbardziej obciążony.
    await expect(tiles.nth(3)).toContainText(/(Bella|Kasztan|Iskra)\s*[1-9]\d* h/);
    await expect(month.getByRole("figure", { name: "Godziny jazd dzień po dniu" })).toBeVisible();

    const ridesText = /(\d+) jazd/.exec(await tiles.nth(0).innerText());
    expect(ridesText, "kafelek godzin jazd podaje liczbę jazd").not.toBeNull();
    const rides = Number(ridesText?.[1]);

    const fullStats = month.getByRole("link", { name: "Pełne statystyki" });
    const href = (await fullStats.getAttribute("href")) ?? "";
    const period = /^\/osrodek\/statystyki\?od=(\d{4}-\d{2}-\d{2})&do=(\d{4}-\d{2}-\d{2})$/.exec(href);
    expect(period, `adres „Pełnych statystyk”: ${href}`).not.toBeNull();
    const [, from = "", to = ""] = period ?? [];
    expect(Date.parse(to) - Date.parse(from), "okres to 30 dni do dziś włącznie").toBe(29 * DAY_MS);

    await fullStats.click();
    await page.waitForURL(`**${href}`);
    await expect(page.getByRole("heading", { level: 1, name: "Statystyki" })).toBeVisible();
    await expect(page.getByLabel("Od", { exact: true })).toHaveValue(from);
    await expect(page.getByLabel("Do", { exact: true })).toHaveValue(to);
    // Te same liczby: Statystyki tego okresu mają tyle samo jazd co kafelek panelu.
    const summary = page.getByRole("region", { name: "Podsumowanie okresu" });
    await expect(summary.getByRole("definition").first()).toHaveText(String(rides));
    await page.goBack();
  });

  await test.step("boczna kolumna „Ośrodek” prowadzi do pięciu sekcji, każda z krótką informacją", async () => {
    const side = page.getByRole("navigation", { name: "Ośrodek" });
    const links = side.getByRole("link");
    await expect(links).toHaveCount(5);

    const expected: [RegExp, string][] = [
      [/^Grafik jutro: ułożony$/, `/osrodek/grafik?dzien=${seedDay()}`],
      [/^Zapisy dziś: \d+$/, "/osrodek/zapisy?dzien="],
      [/^Konie \d+ aktywn\S+$/, "/osrodek/konie"],
      [/^Instruktorzy \d+ z \d+ z kontem$/, "/osrodek/instruktorzy"],
      [/^Statystyki dowolny okres$/, "/osrodek/statystyki"],
    ];
    for (const [name, href] of expected) {
      const link = side.getByRole("link", { name });
      await expect(link).toBeVisible();
      expect(await link.getAttribute("href")).toContain(href);
    }
  });
});

test("panel ośrodka mieści się w telefonie bez poziomego przewijania", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/osrodek");
  await expect(page.getByRole("region", { name: "Najbliższe 7 dni" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "strona jest szersza niż ekran 390 px").toBeLessThanOrEqual(0);
});
