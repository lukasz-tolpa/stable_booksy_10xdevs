import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForIslands } from "./helpers";

/**
 * Strona główna: dwa wejścia (#49, #51), sekcja „Jeden dzień z getona.horse” (#53, #56)
 * oraz logo w górnym pasku i w stopce (#59).
 * Gość wybiera połowę albo czyta dzień do końca, a rejestracja otwiera się z zaznaczonym
 * rodzajem konta. Bez stanu sesji — to scenariusz gościa.
 *
 * „Załóż konto jeźdźca” i „Załóż konto ośrodka” stoją na stronie dwa razy (połowa
 * i zamknięcie sekcji), a górny pasek ma własne „Zaloguj się” i „Załóż konto”. Dlatego
 * każdy przycisk szukany jest wewnątrz regionu nazwanego swoim nagłówkiem, a link
 * logowania pod połowami wewnątrz `<main>`.
 *
 * Nazwę „getona.horse” też niosą dwa elementy: logo w górnym pasku (link w `banner`)
 * i logo w stopce (`contentinfo`), więc każde szukane jest w swoim punkcie orientacyjnym.
 */
const PRODUCT_NAME = "getona.horse";
const DAY_HEADING = "Jeden dzień z getona.horse";
const DAY_TITLES = [
  "Ośrodek układa grafik na jutro.",
  "Anna zapisuje się na 11:00.",
  "Ośrodek przydziela konie.",
  "Anna sprawdza swoje zapisy.",
  "Jazda.",
  "Ośrodek patrzy w statystyki.",
];
/** Pięć momentów ma zrzut ekranu; „Jazda.” nie. */
const DAY_SHOT_COUNT = 5;

const region = (page: Page, name: string): Locator => page.getByRole("region", { name, exact: true });
const riderHalf = (page: Page) => region(page, "Jeżdżę konno.");
const stableHalf = (page: Page) => region(page, "Prowadzę ośrodek.");
const daySection = (page: Page) => region(page, DAY_HEADING);
const closing = (page: Page) => region(page, "Jutro może tak wyglądać Twój dzień.");
const topbarLogo = (page: Page) => page.getByRole("banner").getByRole("link", { name: PRODUCT_NAME, exact: true });
const footerLogo = (page: Page) => page.getByRole("contentinfo").getByRole("img", { name: PRODUCT_NAME, exact: true });

/**
 * Zrzuty ładują się leniwie: każdy trzeba przewinąć w pole widzenia i poczekać na plik.
 * Wymiary zadeklarowane w znaczniku, z którego przeglądarka wzięła plik (`<source>` albo
 * `<img>`), muszą być wymiarami samego pliku — pochodzą z manifestu skryptu zrzutów,
 * a przeglądarka rezerwuje z nich miejsce, zanim plik się załaduje.
 */
async function expectDayShotsLoaded(page: Page): Promise<void> {
  const shots = daySection(page).getByRole("img");
  await expect(shots).toHaveCount(DAY_SHOT_COUNT);
  for (const shot of await shots.all()) {
    await shot.scrollIntoViewIfNeeded();
    await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const sizes = await shot.evaluate((img: HTMLImageElement) => {
      const file = new URL(img.currentSrc).pathname;
      const declaring = [...(img.parentElement?.querySelectorAll("source") ?? []), img].find(
        (element) => (element.getAttribute("srcset") ?? element.getAttribute("src")) === file,
      );
      return {
        file,
        declared: declaring
          ? [Number(declaring.getAttribute("width")), Number(declaring.getAttribute("height"))]
          : null,
        natural: [img.naturalWidth, img.naturalHeight],
      };
    });
    expect(sizes.declared, `wymiary zadeklarowane na stronie dla ${sizes.file}`).toEqual(sizes.natural);
  }
}

async function expectSignupWithRole(page: Page, checked: "Jeździec" | "Ośrodek"): Promise<void> {
  const other = checked === "Jeździec" ? "Ośrodek" : "Jeździec";
  await waitForIslands(page);
  await expect(page.getByRole("radio", { name: checked })).toBeChecked();
  await expect(page.getByRole("radio", { name: other })).not.toBeChecked();
}

test("gość wchodzi ze strony głównej do rejestracji swojej roli albo do logowania", async ({ page }) => {
  await test.step("strona główna pokazuje dwie połowy", async () => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Jeżdżę konno.", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Prowadzę ośrodek.", exact: true })).toBeVisible();
  });

  await test.step("pod połowami stoi „Jeden dzień z getona.horse” z sześcioma momentami po kolei", async () => {
    await expect(page.getByRole("heading", { level: 2, name: DAY_HEADING, exact: true })).toBeVisible();
    await expect(daySection(page).getByRole("listitem").getByRole("heading", { level: 3 })).toHaveText(DAY_TITLES);
  });

  await test.step("na końcu strony, pod zamknięciem sekcji, stoi stopka z logo „getona.horse”", async () => {
    await expect(footerLogo(page)).toBeVisible();
    const closingBox = await closing(page).boundingBox();
    const footerBox = await page.getByRole("contentinfo").boundingBox();
    expect(closingBox, "zamknięcie „Jutro może tak wyglądać Twój dzień.” jest na stronie").not.toBeNull();
    expect(footerBox, "stopka jest na stronie").not.toBeNull();
    if (closingBox && footerBox) {
      expect(footerBox.y, "stopka zaczyna się pod zamknięciem sekcji").toBeGreaterThanOrEqual(
        closingBox.y + closingBox.height,
      );
    }
  });

  await test.step("zrzuty ekranu sekcji ładują się w szerokości komputera", async () => {
    await expectDayShotsLoaded(page);
  });

  await test.step("zrzuty ekranu sekcji ładują się w szerokości telefonu", async () => {
    const desktop = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expectDayShotsLoaded(page);
    if (desktop) {
      await page.setViewportSize(desktop);
    }
  });

  await test.step("„Załóż konto ośrodka” w połowie otwiera rejestrację z zaznaczonym kontem ośrodka", async () => {
    await page.goto("/");
    await stableHalf(page).getByRole("link", { name: "Załóż konto ośrodka", exact: true }).click();
    await page.waitForURL("**/auth/signup?rola=osrodek");
    await expectSignupWithRole(page, "Ośrodek");
  });

  await test.step("„Załóż konto jeźdźca” w połowie otwiera rejestrację z zaznaczonym kontem jeźdźca", async () => {
    await page.goto("/");
    await riderHalf(page).getByRole("link", { name: "Załóż konto jeźdźca", exact: true }).click();
    await page.waitForURL("**/auth/signup?rola=jezdziec");
    await expectSignupWithRole(page, "Jeździec");
  });

  await test.step("„Załóż konto jeźdźca” na końcu sekcji otwiera rejestrację z zaznaczonym kontem jeźdźca", async () => {
    await page.goto("/");
    await closing(page).getByRole("link", { name: "Załóż konto jeźdźca", exact: true }).click();
    await page.waitForURL("**/auth/signup?rola=jezdziec");
    await expectSignupWithRole(page, "Jeździec");
  });

  await test.step("„Załóż konto ośrodka” na końcu sekcji otwiera rejestrację z zaznaczonym kontem ośrodka", async () => {
    await page.goto("/");
    await closing(page).getByRole("link", { name: "Załóż konto ośrodka", exact: true }).click();
    await page.waitForURL("**/auth/signup?rola=osrodek");
    await expectSignupWithRole(page, "Ośrodek");
  });

  await test.step("„Zaloguj się” pod połowami prowadzi do logowania", async () => {
    await page.goto("/");
    await page.getByRole("main").getByRole("link", { name: "Zaloguj się", exact: true }).click();
    await page.waitForURL("**/auth/signin");
    await expect(page.getByRole("heading", { level: 1, name: "Zaloguj się", exact: true })).toBeVisible();
  });

  await test.step("„Zapisz się” na ilustracji listy slotów prowadzi gościa do logowania", async () => {
    await page.goto("/");
    // Ilustracja jest ukryta przed czytnikami (`aria-hidden`), więc lokator ról jej nie widzi;
    // to skrót dla myszy, a tekst jest jedynym, co widzi użytkownik.
    await riderHalf(page).getByText("Zapisz się", { exact: true }).click();
    await page.waitForURL("**/auth/signin");
    await expect(page.getByRole("heading", { level: 1, name: "Zaloguj się", exact: true })).toBeVisible();
  });

  await test.step("logo „getona.horse” w górnym pasku wraca na stronę główną", async () => {
    await topbarLogo(page).click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByRole("heading", { level: 1, name: "Jeżdżę konno.", exact: true })).toBeVisible();
  });
});
