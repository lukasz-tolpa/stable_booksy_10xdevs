import { expect, test, type Page } from "@playwright/test";
import { signUpOwnerWithStable, waitForIslands } from "./helpers";

/**
 * Zaproszenie instruktora do konta na stronie Instruktorzy (#74, US 5–10): właściciel
 * wpisuje adres, dostaje link z przyciskiem kopiowania, widzi stan konta przy instruktorze,
 * zaprasza ponownie (nowy link) i wycofuje zaproszenie. Przyjęcie linku przy rejestracji to
 * osobny scenariusz (#75).
 *
 * Świeży właściciel per uruchomienie: zaproszenia i instruktorzy nie gromadzą się w ośrodku
 * z seeda, a kolejne uruchomienie nie widzi zaproszeń poprzedniego.
 */
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const LINK_PATTERN = /\/auth\/signup\?zaproszenie=[0-9a-f]{64}$/;

/** Etykieta stanu konta przy zaproszeniu wystawionym teraz: ważne 7 dni, dzień w strefie ośrodka. */
function invitedLabel(): string {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const day = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "Europe/Warsaw" });
  return `Zaproszenie ważne do ${day.format(expires)}`;
}

function instructorCard(page: Page, name: string) {
  return page.getByRole("article").filter({ has: page.getByRole("heading", { name }) });
}

async function createLink(page: Page, instructor: string, email: string): Promise<string> {
  const card = instructorCard(page, instructor);
  const field = card.getByLabel(`Adres e-mail — ${instructor}`);
  await field.fill(email);
  await card.getByRole("button", { name: "Utwórz link zaproszenia" }).click();
  await page.waitForURL("**/osrodek/instruktorzy");

  const notice = page.getByRole("region", { name: "Link zaproszenia" });
  await expect(notice).toContainText(instructor);
  const link = notice.getByLabel("Link zaproszenia");
  await expect(link).toHaveValue(LINK_PATTERN);
  return link.inputValue();
}

test("właściciel zaprasza instruktora, kopiuje link, zaprasza ponownie i wycofuje zaproszenie", async ({ page }) => {
  const stamp = String(Date.now());
  const owner = `Właściciel Zaproszeń ${stamp}`;
  const instructor = `Joanna Zaproszona ${stamp}`;

  await test.step("właściciel ma ośrodek i instruktora bez konta", async () => {
    await signUpOwnerWithStable(page, owner, `e2e-invite-owner-${stamp}@example.com`);
    await page.goto("/osrodek/instruktorzy");
    await waitForIslands(page);
    await page.getByLabel("Nazwa instruktora").fill(instructor);
    await page.getByRole("button", { name: "Dodaj instruktora" }).click();
    await page.waitForURL("**/osrodek/instruktorzy");

    const ownerCard = instructorCard(page, owner);
    await expect(ownerCard.getByText("Z kontem", { exact: true })).toBeVisible();
    await expect(ownerCard.getByText("Zaproś", { exact: true })).toHaveCount(0);
    await expect(instructorCard(page, instructor).getByText("Bez konta", { exact: true })).toBeVisible();
  });

  let firstLink = "";
  await test.step("„Zaproś” — adres e-mail daje link do skopiowania", async () => {
    await waitForIslands(page);
    await instructorCard(page, instructor).getByText("Zaproś", { exact: true }).click();
    firstLink = await createLink(page, instructor, `  Joanna.${stamp}@Example.com `);

    const notice = page.getByRole("region", { name: "Link zaproszenia" });
    await expect(notice).toContainText(`joanna.${stamp}@example.com`);
    await waitForIslands(page);
    await notice.getByRole("button", { name: "Kopiuj link" }).click();
    await expect(notice.getByRole("button", { name: "Skopiowano" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(firstLink);

    // Długi link nie rozpycha strony na telefonie (CODING_STANDARDS: 390 px bez poziomego przewijania).
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "strona z linkiem zaproszenia jest szersza niż ekran 390 px").toBeLessThanOrEqual(0);
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  await test.step("przy instruktorze: zaproszenie ważne do dnia, z adresem; link widać tylko raz", async () => {
    const card = instructorCard(page, instructor);
    await expect(card.getByText(invitedLabel(), { exact: true })).toBeVisible();
    await expect(card.getByText(`joanna.${stamp}@example.com`, { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("region", { name: "Link zaproszenia" })).toHaveCount(0);
    await expect(card.getByText(invitedLabel(), { exact: true })).toBeVisible();
  });

  await test.step("„Zaproś ponownie” — nowy link w miejsce poprzedniego", async () => {
    await waitForIslands(page);
    const card = instructorCard(page, instructor);
    await card.getByText("Zaproś ponownie", { exact: true }).click();
    await expect(card.getByLabel(`Adres e-mail — ${instructor}`)).toHaveValue(`joanna.${stamp}@example.com`);
    const secondLink = await createLink(page, instructor, `poprawiony.${stamp}@example.com`);

    expect(secondLink).not.toBe(firstLink);
    await expect(
      instructorCard(page, instructor).getByText(`poprawiony.${stamp}@example.com`, { exact: true }),
    ).toBeVisible();
  });

  await test.step("„Wycofaj zaproszenie” — instruktor znów bez konta i bez zaproszenia", async () => {
    await instructorCard(page, instructor).getByRole("button", { name: "Wycofaj zaproszenie" }).click();
    await page.waitForURL("**/osrodek/instruktorzy");

    const card = instructorCard(page, instructor);
    await expect(card.getByText("Bez konta", { exact: true })).toBeVisible();
    await expect(card.getByText("Zaproś", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Wycofaj zaproszenie" })).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
