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

test.beforeEach(async ({ page }) => {
  await page.goto("/osrodek");
  await expect(page.getByRole("heading", { level: 1, name: "Panel ośrodka" })).toBeVisible();
});

test("panel ośrodka pokazuje ośrodek i najbliższe 7 dni od dziś", async ({ page }) => {
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
    const unscheduled = week
      .getByRole("link")
      .filter({ has: page.getByText("brak grafiku", { exact: true }) })
      .first();
    await expect(unscheduled).toContainText("Ułóż");
    const href = await unscheduled.getAttribute("href");
    expect(href).toMatch(/^\/osrodek\/grafik\?dzien=\d{4}-\d{2}-\d{2}$/);
    await unscheduled.click();
    await page.waitForURL(`**${href ?? ""}`);
    await expect(page.getByRole("heading", { level: 1, name: "Grafik dnia" })).toBeVisible();
  });
});

test("panel ośrodka pokazuje liczby z ostatnich 30 dni zgodne ze Statystykami tego okresu", async ({ page }) => {
  const month = page.getByRole("region", { name: "Ostatnie 30 dni" });

  await test.step("kafelki z historii demo i wykres godzin jazd dzień po dniu", async () => {
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
  });

  await test.step("„Pełne statystyki” otwierają Statystyki z tym samym okresem i tą samą liczbą jazd", async () => {
    const ridesTile = month.getByRole("definition").first();
    await expect(ridesTile, DEMO_HINT).toContainText(/\d+ jazd/);
    const ridesText = /(\d+) jazd/.exec(await ridesTile.innerText());
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
  });
});

test("boczna kolumna „Ośrodek” prowadzi do sekcji ośrodka, każda z krótką informacją", async ({ page }) => {
  await test.step("osiem linków z informacją i adresem sekcji", async () => {
    const side = page.getByRole("navigation", { name: "Ośrodek" });
    const links = side.getByRole("link");
    await expect(links).toHaveCount(8);

    const expected: [RegExp, string][] = [
      [/^Grafik jutro: ułożony$/, `/osrodek/grafik?dzien=${seedDay()}`],
      [/^Zapisy dziś: \d+$/, "/osrodek/zapisy?dzien="],
      [/^Konie \d+ aktywn\S+$/, "/osrodek/konie"],
      // Ośrodek z seeda ma dwa place, Hala i Duży plac (#113).
      [/^Place \d+ aktywn\S+$/, "/osrodek/place"],
      [/^Instruktorzy \d+ z \d+ z kontem$/, "/osrodek/instruktorzy"],
      [/^Podsumowanie miesiąca \S+: \d+ jazd\S*$/, "/osrodek/podsumowanie"],
      // Bez stawki ośrodka prośba o nią, ze stawką — suma bieżącego miesiąca (#98).
      [/^Rozliczenia (Ustaw stawkę|\S+: [\d\s]+,\d{2}\szł)$/, "/osrodek/rozliczenia"],
      [/^Statystyki dowolny okres$/, "/osrodek/statystyki"],
    ];
    for (const [name, href] of expected) {
      const link = side.getByRole("link", { name });
      await expect(link).toBeVisible();
      expect(await link.getAttribute("href")).toContain(href);
    }
  });

  await test.step("obok bocznej kolumny kolumna główna nie powtarza linków do Placów, Podsumowania miesiąca i Rozliczeń", async () => {
    await expect(page.getByRole("link", { name: /^Place · / })).toBeHidden();
    await expect(page.getByRole("link", { name: /^Podsumowanie miesiąca · / })).toBeHidden();
    await expect(page.getByRole("link", { name: /^Rozliczenia · / })).toBeHidden();
  });
});

test("na telefonie panel i sekcje ośrodka są pod ręką w dolnym pasku, a panel mieści się bez poziomego przewijania", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("region", { name: "Najbliższe 7 dni" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "strona jest szersza niż ekran 390 px").toBeLessThanOrEqual(0);

  const tabBar = page.getByRole("navigation", { name: "Sekcje ośrodka" });
  await test.step("dolny pasek ma panel i pięć sekcji, jest widoczny bez przewijania i zaznacza panel", async () => {
    await expect(tabBar.getByRole("link")).toHaveText([
      "Panel",
      "Grafik",
      "Zapisy",
      "Konie",
      "Instruktorzy",
      "Statystyki",
    ]);
    await expect(tabBar.getByRole("link", { name: "Panel", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(tabBar).toBeInViewport();
    await expect(page.getByRole("navigation", { name: "Ośrodek" })).toBeHidden();
  });

  await test.step("Podsumowanie miesiąca, którego nie ma w dolnym pasku, otwiera się z kolumny głównej panelu", async () => {
    const link = page.getByRole("link", { name: /^Podsumowanie miesiąca · \S+: \d+ jazd\S*$/ });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("**/osrodek/podsumowanie");
    await expect(page.getByRole("heading", { level: 1, name: "Podsumowanie miesiąca" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Panel ośrodka" })).toBeVisible();
  });

  await test.step("Rozliczenia, których nie ma w dolnym pasku, otwierają się z kolumny głównej panelu", async () => {
    const link = page.getByRole("link", { name: /^Rozliczenia · (Ustaw stawkę|\S+: [\d\s]+,\d{2}\szł)$/ });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("**/osrodek/rozliczenia");
    await expect(page.getByRole("heading", { level: 1, name: "Rozliczenia" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Panel ośrodka" })).toBeVisible();
  });

  await test.step("pasek zostaje na stronie sekcji i zaznacza ją jako bieżącą", async () => {
    await tabBar.getByRole("link", { name: "Konie", exact: true }).click();
    await page.waitForURL("**/osrodek/konie");
    await expect(tabBar).toBeInViewport();
    await expect(tabBar.getByRole("link", { name: "Konie", exact: true })).toHaveAttribute("aria-current", "page");
  });

  await test.step("„Panel” w dolnym pasku wraca na panel, a menu konta nie powtarza „Mój panel”", async () => {
    await page.getByLabel("Menu konta").click();
    await expect(page.getByRole("banner").getByRole("link", { name: "Mój panel", exact: true })).toBeHidden();
    await tabBar.getByRole("link", { name: "Panel", exact: true }).click();
    await page.waitForURL("**/osrodek");
    await expect(page.getByRole("heading", { level: 1, name: "Panel ośrodka" })).toBeVisible();
  });

  await test.step("na stronie głównej dolnego paska nie ma, a „Mój panel” wraca do menu konta", async () => {
    await page.goto("/");
    await expect(tabBar).toHaveCount(0);
    await page.getByLabel("Menu konta").click();
    await expect(page.getByRole("banner").getByRole("link", { name: "Mój panel", exact: true })).toBeVisible();
  });
});
