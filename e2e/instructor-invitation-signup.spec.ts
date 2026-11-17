import { expect, test, type Page } from "@playwright/test";
import { PASSWORD, hourSection, waitForIslands } from "./helpers";
import { runLocalSql } from "../scripts/db-demo.mjs";

/**
 * Instruktor zakłada konto z linku zaproszenia (#75, US 16–19): właściciel z seeda wystawia
 * zaproszenie na stronie Instruktorzy, nowa sesja otwiera link, widzi formularz bez wyboru
 * rodzaju konta z zablokowanym adresem i nazwą ośrodka, zakłada konto i trafia do „Moje sloty”
 * ze slotem, na który jest zapisany jeździec. Wejście do przestrzeni ośrodka przenosi z powrotem,
 * a wykorzystany link pokazuje powód.
 *
 * Instruktor: Tomasz Lis w Stajni Nad Rzeką (właściciel `osrodek.rzeka`) — w seedzie bez konta,
 * jutro 1 miejsce w godzinach 9–13, Piotr Nowak zapisany o 10 bez konia. Scenariusz tylko czyta
 * ten zapis. W Stadninie Pod Dębem nie ma instruktora bez konta ze slotem z zapisem (Joanna ma
 * konto, Karol nie pracuje — jego 13:00 należy do pętli jeźdźca).
 *
 * Powtarzalność bez `db reset`: powiązania z kontem aplikacja nie cofa (ADR-0004), więc przed
 * scenariuszem usuwamy jako superuser konta instruktora z poprzednich uruchomień — wyłącznie
 * adresy `e2e-instructor-…@example.com` powiązane z Tomaszem Lisem. Usunięcie profilu zeruje
 * `instructors.account_id` (FK `on delete set null`) i Tomasz znów jest „Bez konta”.
 */
const OWNER_EMAIL = "osrodek.rzeka@example.com";
const STABLE = "Stajnia Nad Rzeką";
const INSTRUCTOR = "Tomasz Lis";
const LINK_PATTERN = /\/auth\/signup\?zaproszenie=[0-9a-f]{64}$/;

test.beforeAll(() => {
  const result = runLocalSql(`
    delete from auth.users u
    using public.instructors i
    join public.stables s on s.id = i.stable_id
    where i.account_id = u.id
      and s.name = '${STABLE}' and i.name = '${INSTRUCTOR}'
      and u.email like 'e2e-instructor-%@example.com';
  `);
  if (result.status !== 0) {
    throw new Error(`Nie udało się zwolnić instruktora z poprzedniego uruchomienia:\n${result.stderr}`);
  }
});

function instructorCard(page: Page) {
  return page.getByRole("article").filter({ has: page.getByRole("heading", { name: INSTRUCTOR }) });
}

test("instruktor zakłada konto z linku zaproszenia i trafia do swoich slotów", async ({ page, browser }) => {
  const stamp = String(Date.now());
  const email = `e2e-instructor-${stamp}@example.com`;
  let link = "";

  await test.step("właściciel z seeda wystawia zaproszenie na stronie Instruktorzy", async () => {
    await page.goto("/auth/signin");
    await waitForIslands(page);
    await page.getByLabel("Adres e-mail").fill(OWNER_EMAIL);
    await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL("**/osrodek");

    await page.goto("/osrodek/instruktorzy");
    await waitForIslands(page);
    const card = instructorCard(page);
    await expect(card.getByText("Bez konta", { exact: true })).toBeVisible();
    await card.getByText("Zaproś", { exact: true }).click();
    await card.getByLabel(`Adres e-mail — ${INSTRUCTOR}`).fill(email);
    await card.getByRole("button", { name: "Utwórz link zaproszenia" }).click();
    await page.waitForURL("**/osrodek/instruktorzy");

    const field = page.getByRole("region", { name: "Link zaproszenia" }).getByLabel("Link zaproszenia");
    await expect(field).toHaveValue(LINK_PATTERN);
    link = await field.inputValue();
  });

  const invitee = await browser.newContext();
  try {
    const instructorPage = await invitee.newPage();

    await test.step("link otwiera rejestrację bez wyboru roli, z adresem i nazwą ośrodka", async () => {
      await instructorPage.goto(link);
      await waitForIslands(instructorPage);
      await expect(instructorPage.getByRole("heading", { level: 1, name: STABLE })).toBeVisible();
      const address = instructorPage.getByLabel("Adres e-mail");
      await expect(address).toHaveValue(email);
      await expect(address).not.toBeEditable();
      await expect(instructorPage.getByRole("radio")).toHaveCount(0);
    });

    await test.step("założenie konta prowadzi do „Moje sloty” ze slotem z zapisanym jeźdźcem", async () => {
      await instructorPage.getByLabel("Imię i nazwisko").fill(INSTRUCTOR);
      await instructorPage.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
      await instructorPage.getByLabel("Powtórz hasło").fill(PASSWORD);
      await instructorPage.getByRole("button", { name: "Załóż konto" }).click();
      await instructorPage.waitForURL("**/instruktor");
      await expect(instructorPage.getByRole("heading", { level: 1, name: "Moje sloty" })).toBeVisible();

      const slot = hourSection(instructorPage, 10);
      await expect(slot.getByText("zajęte 1 z 1", { exact: true })).toBeVisible();
      const rider = slot.getByRole("listitem").filter({ hasText: "Piotr Nowak" });
      await expect(rider.getByText("bez konia", { exact: true })).toBeVisible();
    });

    await test.step("wejście do przestrzeni ośrodka przenosi do „Moje sloty”", async () => {
      await instructorPage.goto("/osrodek/instruktorzy");
      await instructorPage.waitForURL("**/instruktor");
      await expect(instructorPage.getByRole("heading", { level: 1, name: "Moje sloty" })).toBeVisible();
    });
  } finally {
    await invitee.close();
  }

  await test.step("właściciel widzi instruktora z kontem", async () => {
    await page.reload();
    await expect(instructorCard(page).getByText("Z kontem", { exact: true })).toBeVisible();
  });

  await test.step("wykorzystany link pokazuje powód i prośbę o nowy link", async () => {
    const stranger = await browser.newContext();
    try {
      const strangerPage = await stranger.newPage();
      await strangerPage.goto(link);
      await expect(strangerPage.getByRole("heading", { level: 1, name: "Link zaproszenia nie działa" })).toBeVisible();
      await expect(strangerPage.getByText(/został już wykorzystany/)).toBeVisible();
      await expect(strangerPage.getByRole("button", { name: "Załóż konto" })).toHaveCount(0);
    } finally {
      await stranger.close();
    }
  });
});
